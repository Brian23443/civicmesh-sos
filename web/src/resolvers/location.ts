import { LocationConfidenceType, MedicalFlags } from '../protocol/enums';
import type { LocationConfidenceType as LocationType } from '../protocol/enums';

export interface LocationResult { type: LocationType; text: string | null; flags: number }
const LEFT = '(?<![\\p{L}\\p{N}])';
const RIGHT = '(?![\\p{L}\\p{N}])';
const streetType = '(?:Lane|Ln|Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Court|Ct|Way|Highway|Hwy|Terrace|Place|Pl)';
const nameWord = "[\\p{L}\\p{N}][\\p{L}\\p{N}'’.-]*";
const address = new RegExp(`${LEFT}[0-9]{1,5}\\s+(?:${nameWord}\\s+){1,6}?${streetType}${RIGHT}\\.?`, 'iu');
// Longer multi-word names precede their contained shorter names.
const landmarks = ['home depot', 'high school', 'middle school', 'elementary school', 'city hall',
  'fire station', 'police station', 'walmart', 'target', 'costco', 'kroger', 'heb', 'safeway',
  'walgreens', 'cvs', 'school', 'hospital', 'clinic', 'church', 'stadium', 'mall', 'library',
  'airport', 'bridge', 'overpass'];
const offsets = ['a few blocks away', 'down the street', 'across the street', 'nearby',
  'around the corner', 'blocks north', 'blocks south', 'miles away'];
const phrasePattern = (phrases: string[]) => new RegExp(`${LEFT}(?:${phrases.map(p => p.replaceAll(' ', '\\s+')).join('|')})${RIGHT}`, 'iu');
const landmark = phrasePattern(landmarks);
const offset = phrasePattern(offsets);

/** §5.4: address > landmark > offset; preserve the survivor's matched text. */
export function resolveLocation(message: string): LocationResult {
  const addressText = address.exec(message)?.[0];
  const landmarkText = landmark.exec(message)?.[0];
  const offsetText = offset.exec(message)?.[0];
  let type: LocationType = LocationConfidenceType.DIRECT_ON_SCENE;
  let text: string | null = null;
  let flags = 0;
  if (addressText) {
    type = LocationConfidenceType.EXPLICIT_ADDRESS; text = addressText;
    flags = MedicalFlags.LOC_EXPLICIT_ADDRESS;
  } else if (landmarkText) {
    type = LocationConfidenceType.LANDMARK_POI; text = landmarkText;
    flags = MedicalFlags.LOC_LANDMARK;
  } else if (offsetText) {
    type = LocationConfidenceType.PROXIMATE_OFFSET; text = offsetText;
    flags = MedicalFlags.LOC_PROXIMATE;
  }
  if (offsetText && type !== LocationConfidenceType.PROXIMATE_OFFSET) text = `${text} (${offsetText})`;
  if (flags) flags |= MedicalFlags.LOCATION_DISCREPANCY_ALERT;
  return { type, text, flags };
}
