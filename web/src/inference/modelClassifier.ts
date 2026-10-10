import { Stage1Classifier } from './stage1Classifier';
import { FineTunedClassifier, type LogitProvider } from './fineTunedClassifier';
import type { Classifier, EmbeddingProvider, PrototypeData } from './types';

export type ModelConfig =
  | { kind:'prototype'; unknown_margin?:number }
  | { kind:'classifier'; red_threshold:number };
export interface ModelProviders {
  embeddingProvider?: EmbeddingProvider; prototypes?: PrototypeData; logitProvider?: LogitProvider;
}
export function parseModelConfig(value: unknown): ModelConfig {
  if(!value||typeof value!=='object') throw Error('Invalid model configuration');
  const model=value as Record<string,unknown>;
  if(model.kind==='prototype') {
    if(model.unknown_margin!==undefined && (typeof model.unknown_margin!=='number'||!Number.isFinite(model.unknown_margin)||model.unknown_margin<0||model.unknown_margin>2)) throw Error('Invalid unknown_margin');
    return {kind:'prototype',unknown_margin:model.unknown_margin as number|undefined};
  }
  if(model.kind==='classifier') {
    if(typeof model.red_threshold!=='number'||!Number.isFinite(model.red_threshold)||model.red_threshold<0||model.red_threshold>1) throw Error('Invalid red_threshold');
    return {kind:'classifier',red_threshold:model.red_threshold};
  }
  throw Error('Unsupported model kind');
}
/** Reject unknown kinds instead of silently treating them as fine-tuned models. */
export function createModelClassifier(config: ModelConfig, providers: ModelProviders): Classifier {
  const model=parseModelConfig(config);
  if(model.kind==='prototype' && (!providers.embeddingProvider||!providers.prototypes)) throw Error('Prototype model requires embeddings and prototypes');
  if(model.kind==='classifier' && !providers.logitProvider) throw Error('Classifier model requires a local five-head ONNX logit provider');
  const classifier = model.kind === 'prototype'
    ? new Stage1Classifier({embeddingProvider:providers.embeddingProvider!,prototypes:providers.prototypes!,unknownMargin:model.unknown_margin})
    : new FineTunedClassifier({logitProvider:providers.logitProvider!,redThreshold:model.red_threshold});
  return classifier;
}
