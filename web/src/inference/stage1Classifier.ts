import { HazardClass, RescueStatus, TriagePriority } from '../protocol/enums';
import type { TriageResult, Classifier, FinalizeSettings, HazardScores, NullableScores4, PrototypeData, Scores4, Stage1ClassifierOptions } from './types';

const PRIORITY_LABELS = Object.keys(TriagePriority);
const HAZARD_LABELS = Object.keys(HazardClass).filter(label => label !== 'OTHER');
const STATUS_LABELS = Object.keys(RescueStatus).filter(label => label !== 'UNKNOWN');
const DIM = 384;
function validateMargin(margin: number): void {
  if (!Number.isFinite(margin) || margin < 0 || margin > 2) throw new RangeError('unknownMargin must be between 0 and 2');
}
function validateVector(vector: ArrayLike<number>, name: string): void {
  if (!vector || vector.length !== DIM) throw new RangeError(`${name} must have 384 dimensions`);
  let normSquared = 0;
  for (let i = 0; i < DIM; i++) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) throw new RangeError(`${name} contains a non-finite value`);
    normSquared += vector[i] * vector[i];
  }
  if (Math.abs(Math.sqrt(normSquared) - 1) > 0.001) throw new RangeError(`${name} must be L2-normalized`);
}
function preparePrototypes(data: PrototypeData): PrototypeData {
  if (data.dim !== DIM) throw new RangeError('Prototype dimension must be 384');
  const result = { dim: DIM } as PrototypeData;
  for (const [field, labels] of [['priority', PRIORITY_LABELS], ['hazard', HAZARD_LABELS], ['status', STATUS_LABELS]] as const) {
    const source = data[field] as Record<string, readonly number[]>;
    if (!source || Object.keys(source).length !== labels.length || Object.keys(source).some(key => !labels.includes(key))) {
      throw new RangeError(`Unexpected ${field} prototype labels`);
    }
    const copy: Record<string, readonly number[]> = {};
    for (const label of labels) { validateVector(source[label], `${field}.${label}`); copy[label] = Object.freeze(Array.from(source[label])); }
    Object.assign(result, { [field]: Object.freeze(copy) });
  }
  return Object.freeze(result);
}
function dot(a: ArrayLike<number>, b: readonly number[]): number {
  let sum = 0; for (let i = 0; i < DIM; i++) sum += a[i] * b[i]; return sum;
}
function rank(scores: readonly number[]): number[] {
  // Stable enum-order tie break; no invented OTHER/UNKNOWN prototype.
  return scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
}
function decode(embedding: ArrayLike<number>, data: PrototypeData, margin: number, redMargin = 0): TriageResult {
  validateVector(embedding, 'Embedding');
  const priority = PRIORITY_LABELS.map(label => dot(embedding, data.priority[label as keyof typeof data.priority])) as Scores4;
  const hazard = HAZARD_LABELS.map(label => dot(embedding, data.hazard[label as keyof typeof data.hazard]));
  const status = STATUS_LABELS.map(label => dot(embedding, data.status[label as keyof typeof data.status]));
  const statusRank = rank(status);
  // Red bias (model.json red_margin, tuned on validation): IMMEDIATE when its score is within
  // red_margin of the top priority score — same rule as Python's PrototypeClassifier.decode.
  let top = rank(priority)[0];
  if (priority[TriagePriority.IMMEDIATE] >= priority[top] - redMargin) top = TriagePriority.IMMEDIATE;
  return {
    priority: top as TriageResult['priority'],
    hazard: rank(hazard)[0] as TriageResult['hazard'],
    status: status[statusRank[0]] - status[statusRank[1]] < margin ? RescueStatus.UNKNOWN : statusRank[0] as TriageResult['status'],
    medicalProbs: null, thirdPartyProb: null,
    scores: { priority, hazard: [...hazard, null] as HazardScores, status: [...status, null] as NullableScores4 },
  };
}

/** Pure Stage 1 decoder. Does not load or run a model. */
export function decodeStage1(embedding: ArrayLike<number>, prototypes: PrototypeData, unknownMargin = 0.02,
  redMargin = 0): TriageResult {
  validateMargin(unknownMargin); validateMargin(redMargin);
  return decode(embedding, preparePrototypes(prototypes), unknownMargin, redMargin);
}

/** Runtime-independent adapter: supply T1 prototypes and a future embedding provider. */
export class Stage1Classifier implements Classifier {
  readonly kind = 'prototype' as const;
  private readonly prototypes: PrototypeData;
  private readonly margin: number;
  private readonly redMargin: number;
  private readonly provider: Stage1ClassifierOptions['embeddingProvider'];
  readonly settings: FinalizeSettings;
  constructor({ embeddingProvider, prototypes, unknownMargin = 0.02, redMargin = 0, statusBackstop = false }: Stage1ClassifierOptions) {
    validateMargin(unknownMargin); validateMargin(redMargin);
    this.margin = unknownMargin; this.redMargin = redMargin;
    this.settings = { statusBackstop, medicalThresholds: null, thirdPartyThreshold: null }; this.prototypes = preparePrototypes(prototypes); this.provider = embeddingProvider;
  }
  async classify(text: string): Promise<TriageResult> {
    const embedding = await this.provider.embed(text);
    return decode(embedding, this.prototypes, this.margin, this.redMargin);
  }
}
