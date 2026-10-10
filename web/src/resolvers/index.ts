import { resolveHeadcount } from './headcount';
import { resolveMedical } from './medical';
import { resolveLocation } from './location';
import { resolveStatus } from './status';
import { LocationConfidenceType } from '../protocol/enums';
export { resolveHeadcount } from './headcount';
export type { HeadcountResult } from './headcount';
export { resolveMedical } from './medical';
export { resolveLocation } from './location';
export type { LocationResult } from './location';
export { resolveStatus } from './status';

/** Model-independent fields (§5.4). The user controls the final third-party answer. */
export function resolveReport(text: string) {
  const { adults, children } = resolveHeadcount(text);
  const medicalFlags = resolveMedical(text);
  const location = resolveLocation(text);
  return {
    adults, children, medicalFlags, location, statusKeyword: resolveStatus(text),
    flags: medicalFlags | location.flags,
    suggestedThirdParty: location.type !== LocationConfidenceType.DIRECT_ON_SCENE,
  };
}
