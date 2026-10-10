import { Stage1Classifier } from './stage1Classifier';
import { FineTunedClassifier, type LogitProvider } from './fineTunedClassifier';
import type { Classifier, EmbeddingProvider, PrototypeData } from './types';

/** web/public/model/model.json (contract K4). Stage 1 settings are tuned on validation by stage1.tune_stage1. */
export type ModelConfig =
  | { kind: 'prototype'; max_length?: number; unknown_margin?: number; red_margin?: number; status_backstop?: boolean }
  | { kind: 'classifier'; max_length?: number; red_threshold: number; medical_thresholds?: number[]; third_party_threshold?: number };
export interface ModelProviders {
  embeddingProvider?: EmbeddingProvider; prototypes?: PrototypeData; logitProvider?: LogitProvider;
}
const isNum = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export function parseModelConfig(value: unknown): ModelConfig {
  if (!value || typeof value !== 'object') throw Error('Invalid model configuration');
  const m = value as Record<string, unknown>;
  if (m.max_length !== undefined && !(Number.isInteger(m.max_length) && isNum(m.max_length, 8, 512))) throw Error('Invalid max_length');
  if (m.kind === 'prototype') {
    for (const key of ['unknown_margin', 'red_margin'] as const) {
      if (m[key] !== undefined && !isNum(m[key], 0, 2)) throw Error(`Invalid ${key}`);
    }
    if (m.status_backstop !== undefined && typeof m.status_backstop !== 'boolean') throw Error('Invalid status_backstop');
    return { kind: 'prototype', max_length: m.max_length as number | undefined, unknown_margin: m.unknown_margin as number | undefined,
      red_margin: m.red_margin as number | undefined, status_backstop: m.status_backstop as boolean | undefined };
  }
  if (m.kind === 'classifier') {
    if (!isNum(m.red_threshold, 0, 1)) throw Error('Invalid red_threshold');
    if (m.medical_thresholds !== undefined && !(Array.isArray(m.medical_thresholds) && m.medical_thresholds.length === 8
      && m.medical_thresholds.every(v => isNum(v, 0, 1)))) throw Error('Invalid medical_thresholds');
    if (m.third_party_threshold !== undefined && !isNum(m.third_party_threshold, 0, 1)) throw Error('Invalid third_party_threshold');
    return { kind: 'classifier', max_length: m.max_length as number | undefined, red_threshold: m.red_threshold as number,
      medical_thresholds: m.medical_thresholds as number[] | undefined, third_party_threshold: m.third_party_threshold as number | undefined };
  }
  throw Error('Unsupported model kind');
}

/** Reject unknown kinds instead of silently treating them as fine-tuned models. */
export function createModelClassifier(config: ModelConfig, providers: ModelProviders): Classifier {
  const model = parseModelConfig(config);
  if (model.kind === 'prototype') {
    if (!providers.embeddingProvider || !providers.prototypes) throw Error('Prototype model requires embeddings and prototypes');
    return new Stage1Classifier({ embeddingProvider: providers.embeddingProvider, prototypes: providers.prototypes,
      unknownMargin: model.unknown_margin, redMargin: model.red_margin, statusBackstop: model.status_backstop });
  }
  if (!providers.logitProvider) throw Error('Classifier model requires a local five-head ONNX logit provider');
  return new FineTunedClassifier({ logitProvider: providers.logitProvider, redThreshold: model.red_threshold,
    medicalThresholds: model.medical_thresholds, thirdPartyThreshold: model.third_party_threshold });
}
