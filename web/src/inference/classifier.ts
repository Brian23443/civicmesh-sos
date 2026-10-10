import { MockClassifier } from './mockClassifier';
import { Stage1Classifier } from './stage1Classifier';
import type { MockClassifierOptions, Stage1ClassifierOptions } from './types';
export type { Classifier, TriageResult, ClassificationResult, EmbeddingProvider, PrototypeData } from './types';
export { MockClassifier } from './mockClassifier';
export { Stage1Classifier, decodeStage1 } from './stage1Classifier';

export type ClassifierOptions = ({ kind: 'mock' } & MockClassifierOptions)
  | ({ kind: 'prototype' } & Stage1ClassifierOptions);

/** Explicit selection; model/runtime failures propagate so the UI can offer manual mode. */
export function createClassifier(options: ClassifierOptions = { kind: 'mock' }): MockClassifier | Stage1Classifier {
  switch (options.kind) {
    case 'mock': return new MockClassifier(options);
    case 'prototype': return new Stage1Classifier(options);
    default: throw new Error('Unsupported classifier kind');
  }
}

export { FineTunedClassifier } from './fineTunedClassifier';
export type { LogitProvider, TriageLogits, FineTunedClassifierOptions } from './fineTunedClassifier';
export { createModelClassifier, parseModelConfig } from './modelClassifier';
export type { ModelConfig, ModelProviders } from './modelClassifier';
