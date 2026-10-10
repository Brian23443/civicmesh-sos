import { resolveHeadcount } from './headcount';
import { resolveMedical } from './medical';
import { resolveLocation } from './location';
import { LocationConfidenceType } from '../protocol/enums';
export { resolveHeadcount } from './headcount';
export type { HeadcountResult } from './headcount';
export { resolveMedical } from './medical';
export { resolveLocation } from './location';
export type { LocationResult } from './location';

/** Model-independent fields. The user controls the final third-party answer. */
export function resolveReport(text: string) {
  const { adults, children } = resolveHeadcount(text);
  const medicalFlags = resolveMedical(text);
  const location = resolveLocation(text);
  return {
    adults, children, medicalFlags, location,
    flags: medicalFlags | location.flags,
    suggestedThirdParty: location.type !== LocationConfidenceType.DIRECT_ON_SCENE,
  };
}
