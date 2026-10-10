import { TriagePriority } from '../protocol/enums';
import type { Classifier, FinalizeSettings, HazardScores, NullableScores4, Scores4, TriageResult } from './types';

/** Five ONNX outputs, flattened from batch size 1, in protocol enum order. */
export interface TriageLogits {
  priority: ArrayLike<number>; hazard: ArrayLike<number>; status: ArrayLike<number>;
  medical: ArrayLike<number>; thirdParty: ArrayLike<number>;
}
export interface LogitProvider { predict(text: string): Promise<TriageLogits> }
export interface FineTunedClassifierOptions {
  logitProvider: LogitProvider; redThreshold: number;
  medicalThresholds?: number[]; thirdPartyThreshold?: number;
}
function validate(values: ArrayLike<number>, size: number, name: string): number[] {
  if (!values || values.length !== size) throw Error(`${name} must contain ${size} logits`);
  return Array.from(values, value => {
    if (!Number.isFinite(value)) throw Error(`${name} contains a non-finite logit`);
    return value;
  });
}
function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map(value => Math.exp(value - max));
  const sum = exps.reduce((a,b) => a+b,0);
  return exps.map(value => value/sum);
}
function sigmoid(value: number): number {
  return value >= 0 ? 1/(1+Math.exp(-value)) : Math.exp(value)/(1+Math.exp(value));
}
function argmax(values: number[], exclude = -1): number {
  let best = -1;
  for(let i=0;i<values.length;i++) if(i!==exclude && (best<0||values[i]>values[best])) best=i;
  return best;
}
/** Stage 2 decoder; loading/tokenization are delegated to the injected local ONNX provider. */
export class FineTunedClassifier implements Classifier {
  readonly kind = 'classifier' as const;
  private readonly provider: LogitProvider;
  private readonly redThreshold: number;
  readonly settings: FinalizeSettings;
  constructor({logitProvider,redThreshold,medicalThresholds=Array(8).fill(0.5),thirdPartyThreshold=0.5}: FineTunedClassifierOptions) {
    const prob=(v:number)=>Number.isFinite(v)&&v>=0&&v<=1;
    if(!prob(redThreshold)) throw Error('redThreshold must be between 0 and 1');
    if(medicalThresholds.length!==8||!medicalThresholds.every(prob)) throw Error('medicalThresholds must be 8 probabilities');
    if(!prob(thirdPartyThreshold)) throw Error('thirdPartyThreshold must be between 0 and 1');
    this.provider=logitProvider;this.redThreshold=redThreshold;
    // §5.3: medical = thresholds OR keyword backstop; third-party from the model only.
    this.settings={statusBackstop:false,medicalThresholds:[...medicalThresholds],thirdPartyThreshold};
  }
  async classify(text: string): Promise<TriageResult> {
    const logits=await this.provider.predict(text);
    const priority=softmax(validate(logits.priority,4,'priority'));
    const hazard=softmax(validate(logits.hazard,16,'hazard'));
    const status=softmax(validate(logits.status,4,'status'));
    const medicalProbs=validate(logits.medical,8,'medical').map(sigmoid);
    const thirdPartyProb=sigmoid(validate(logits.thirdParty,1,'thirdParty')[0]);
    return {
      priority: (priority[TriagePriority.IMMEDIATE]>=this.redThreshold ? TriagePriority.IMMEDIATE : argmax(priority,TriagePriority.IMMEDIATE)) as TriageResult['priority'],
      hazard: argmax(hazard) as TriageResult['hazard'],status: argmax(status) as TriageResult['status'],
      medicalProbs,thirdPartyProb,
      scores:{priority:priority as Scores4,hazard:hazard as HazardScores,status:status as NullableScores4},
    };
  }
}
