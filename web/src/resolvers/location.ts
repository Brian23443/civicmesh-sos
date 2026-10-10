/** §5.4 location resolver — port of resolve_location in src/models/resolvers.py. */
import { LocationConfidenceType, MedicalFlags } from '../protocol/enums';
import type { LocationConfidenceType as LocationType } from '../protocol/enums';
import { NUMBER } from './headcount';
import { WB_END, WB_START, finditer, longestFirst, rx, rxAll, words } from './common';

export interface LocationResult { type: LocationType; text: string | null; flags: number }

const STREET_TYPES = ['lane', 'ln', 'street', 'st', 'road', 'rd', 'avenue', 'ave', 'boulevard', 'blvd', 'drive', 'dr',
  'court', 'ct', 'way', 'highway', 'hwy', 'terrace', 'place', 'pl'];
// Words that can't be part of a street name — stops "3 people on the way" being an address.
const STREET_STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'us', 'on', 'in', 'at', 'to', 'my', 'our', 'we',
  'are', 'is', 'was', 'people', 'ppl', 'adults', 'adult', 'kids', 'kid', 'children', 'persons',
  'minutes', 'mins', 'hours', 'hrs', 'feet', 'ft', 'miles', 'blocks', 'floors', 'floor',
  'their', 'his', 'her', 'your', 'this', 'that', 'way', 'no', 'not', 'all', 'just']);
const ADDRESS_RX = rxAll(
  `${WB_START}([0-9]{1,5})\\s+((?:[a-z0-9.'-]+\\s+){1,4}?)(${STREET_TYPES.join('|')})\\.?${WB_END}`);

const LANDMARKS = ['walmart', 'target', 'costco', 'home depot', 'kroger', 'heb', 'h-e-b', 'safeway', 'walgreens', 'cvs',
  'high school', 'middle school', 'elementary school', 'school', 'hospital', 'clinic', 'church',
  'stadium', 'mall', 'library', 'city hall', 'airport', 'fire station', 'police station', 'bridge', 'overpass'];
const LANDMARK_RX = rx(words(longestFirst(LANDMARKS)));

const OFFSETS = ['a few blocks away', 'down the street', 'across the street', 'nearby', 'around the corner',
  'blocks north', 'blocks south', 'blocks east', 'blocks west', 'blocks away', 'miles away'];
const OFFSET_COUNT = `(?:(?:${NUMBER}|a few|few|several)\\s+)?`;
const OFFSET_RX = rx(`${WB_START}(?:${OFFSET_COUNT}(?:blocks|miles)\\s+(?:north|south|east|west|away)`
  + `|${longestFirst(OFFSETS).join('|')})${WB_END}`);

export const LOCATION_FLAGS: Record<LocationType, number> = {
  [LocationConfidenceType.DIRECT_ON_SCENE]: 0,
  [LocationConfidenceType.PROXIMATE_OFFSET]: MedicalFlags.LOC_PROXIMATE | MedicalFlags.LOCATION_DISCREPANCY_ALERT,
  [LocationConfidenceType.LANDMARK_POI]: MedicalFlags.LOC_LANDMARK | MedicalFlags.LOCATION_DISCREPANCY_ALERT,
  [LocationConfidenceType.EXPLICIT_ADDRESS]: MedicalFlags.LOC_EXPLICIT_ADDRESS | MedicalFlags.LOCATION_DISCREPANCY_ALERT,
} as Record<LocationType, number>;

/** Python str.strip(".,"). */
const stripDotsCommas = (w: string) => w.replace(/^[.,]+|[.,]+$/g, '');

function findAddress(text: string): string | null {
  for (const m of finditer(ADDRESS_RX, text)) {
    const nameWords = m[2].split(/\s+/).filter(Boolean);
    if (nameWords.some(w => STREET_STOPWORDS.has(stripDotsCommas(w).toLowerCase()))) continue;
    return text.slice(m.index, m.index + m[0].length).replace(/\.+$/, '');
  }
  return null;
}

/** §5.4 rules 1–3. location text keeps the message's spelling; an offset is appended in parentheses. */
export function resolveLocation(message: string): LocationResult {
  // Matching runs on the original text (patterns are case-insensitive) so spans map back 1:1.
  const src = message.replace(/’/g, "'").replace(/‘/g, "'");
  let type: LocationType = LocationConfidenceType.DIRECT_ON_SCENE;
  let text: string | null = null;

  const address = findAddress(src);
  if (address) {
    type = LocationConfidenceType.EXPLICIT_ADDRESS; text = address;
  } else {
    const m = LANDMARK_RX.exec(src);
    if (m) { type = LocationConfidenceType.LANDMARK_POI; text = m[0]; }
  }
  const m = OFFSET_RX.exec(src);
  if (m) {
    if (text === null) { type = LocationConfidenceType.PROXIMATE_OFFSET; text = m[0]; }
    else text = `${text} (${m[0]})`;
  }
  return { type, text, flags: LOCATION_FLAGS[type] };
}
