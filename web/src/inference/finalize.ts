/**
 * Combines a classifier result with the §5.4 resolvers into the Review screen's fields — the
 * TypeScript twin of Python's PrototypeClassifier.to_slots / FinetunedTriageExtractor.to_slots.
 */
import type { LocationConfidenceType as LocationType } from '../protocol/enums';
import type { resolveReport } from '../resolvers';
import type { FinalizeSettings, TriageResult } from './types';

export interface FinalFields {
  priority: TriageResult['priority']; hazard: TriageResult['hazard']; status: TriageResult['status'];
  adults: number; children: number; medicalFlags: number; thirdParty: boolean;
  locationType: LocationType; locationText: string | null;
}
const NO_SETTINGS: FinalizeSettings = { statusBackstop: false, medicalThresholds: null, thirdPartyThreshold: null };

export function finalizeReport(result: TriageResult, fields: ReturnType<typeof resolveReport>,
  settings: FinalizeSettings = NO_SETTINGS): FinalFields {
  // Stage 1 status backstop. `??` not `||`: SHELTERED is 0.
  const status = (settings.statusBackstop ? fields.statusKeyword ?? result.status : result.status) as TriageResult['status'];
  // Medical: keyword backstop, OR'd with the model's thresholded flags when it has a medical head (§5.3).
  let medicalFlags = fields.medicalFlags;
  if (result.medicalProbs && settings.medicalThresholds) {
    result.medicalProbs.forEach((p, bit) => { if (p >= settings.medicalThresholds![bit]) medicalFlags |= 1 << bit; });
  }
  // Third-party: Stage 2 from the model only; Stage 1 has no head, so the location resolver suggests it.
  const thirdParty = result.thirdPartyProb !== null && settings.thirdPartyThreshold !== null
    ? result.thirdPartyProb >= settings.thirdPartyThreshold
    : fields.suggestedThirdParty;
  return { priority: result.priority, hazard: result.hazard, status, adults: fields.adults, children: fields.children,
    medicalFlags, thirdParty, locationType: fields.location.type, locationText: fields.location.text };
}
