import type { HazardClass, RescueStatus, TriagePriority } from '../protocol/enums';
import { HazardClass as Hazards, RescueStatus as Statuses, TriagePriority as Priorities } from '../protocol/enums';

export type Scores4 = [number, number, number, number];
export type NullableScores4 = [number | null, number | null, number | null, number | null];
export type HazardScores = [number | null, number | null, number | null, number | null,
  number | null, number | null, number | null, number | null,
  number | null, number | null, number | null, number | null,
  number | null, number | null, number | null, number | null];

/** Contract K4: resolvers and user confirmation remain outside the classifier. */
export interface TriageResult {
  priority: TriagePriority;
  hazard: HazardClass;
  status: RescueStatus;
  medicalProbs: number[] | null;
  thirdPartyProb: number | null;
  scores: { priority: Scores4; hazard: HazardScores; status: NullableScores4 };
}
/** How the model's output is combined with the resolvers (see finalize.ts). */
export interface FinalizeSettings {
  statusBackstop: boolean;                 // Stage 1: resolveStatus overrides the prototype status
  medicalThresholds: number[] | null;      // Stage 2: per-flag thresholds (8), OR'd with the keyword backstop
  thirdPartyThreshold: number | null;      // Stage 2: third-party from the model only
}
export interface Classifier {
  classify(text: string): Promise<TriageResult>;
  readonly settings?: FinalizeSettings;
}

/** Compatibility name for existing K4 consumers. */
export type ClassificationResult = TriageResult;
export type PriorityLabel = keyof typeof Priorities;
export type HazardPrototypeLabel = Exclude<keyof typeof Hazards, 'OTHER'>;
export type StatusPrototypeLabel = Exclude<keyof typeof Statuses, 'UNKNOWN'>;

/** T1's prototypes.json; all vectors are pre-normalized 384-dimensional embeddings. */
export interface PrototypeData {
  dim: 384;
  priority: Record<PriorityLabel, readonly number[]>;
  hazard: Record<HazardPrototypeLabel, readonly number[]>;
  status: Record<StatusPrototypeLabel, readonly number[]>;
}

/** Future runtime seam. No tokenizer, ONNX session, or model loading here. */
export interface EmbeddingProvider {
  embed(text: string): Promise<ArrayLike<number>>;
}
export interface MockClassifierOptions { delayMs?: number }
export interface Stage1ClassifierOptions {
  embeddingProvider: EmbeddingProvider;
  prototypes: PrototypeData;
  unknownMargin?: number;
  redMargin?: number;
  statusBackstop?: boolean;
}
