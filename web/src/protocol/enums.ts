/** MASTER_PROMPT.md §2: values are shared with Python and firmware. */
export const TriagePriority = { MINOR: 0, DELAYED: 1, IMMEDIATE: 2, DECEASED: 3 } as const;
export const HazardClass = {
  NONE: 0, FLOOD: 1, FIRE_SMOKE: 2, STRUCTURAL_COLLAPSE: 3,
  HAZMAT_GAS: 4, ELECTRICAL_POWER: 5, EXTREME_WEATHER: 6, MEDICAL_CRISIS: 7,
  ACTIVE_VIOLENCE: 8, TSUNAMI_SURGE: 9, LANDSLIDE: 10, HYPOTHERMIA_FREEZE: 11,
  HEAT_STROKE: 12, SINKHOLE_SUBSIDENCE: 13, CONTAMINATED_WATER: 14, OTHER: 15,
} as const;
export const RescueStatus = { SHELTERED: 0, EXPOSED: 1, TRAPPED: 2, UNKNOWN: 3 } as const;
export const MedicalFlags = {
  INSULIN: 0x0001, OXYGEN: 0x0002, BLEEDING: 0x0004, HYPOTHERMIA: 0x0008,
  MOBILITY_IMPAIRED: 0x0010, CARDIAC: 0x0020, PREGNANCY_INFANT: 0x0040, BURNS: 0x0080,
  THIRD_PARTY_REPORT: 0x0100, LOC_PROXIMATE: 0x0200, LOC_LANDMARK: 0x0400,
  LOC_EXPLICIT_ADDRESS: 0x0800, LOCATION_DISCREPANCY_ALERT: 0x1000,
} as const;
export const LocationConfidenceType = {
  DIRECT_ON_SCENE: 0, PROXIMATE_OFFSET: 1, LANDMARK_POI: 2, EXPLICIT_ADDRESS: 3,
} as const;
export const GpsAccuracy = { NO_FIX: 0, M5: 1, M10: 2, M25: 3, M50: 4, M100: 5, M500: 6, COARSE: 7 } as const;

type Values<T> = T[keyof T];
export type TriagePriority = Values<typeof TriagePriority>;
export type HazardClass = Values<typeof HazardClass>;
export type RescueStatus = Values<typeof RescueStatus>;
export type LocationConfidenceType = Values<typeof LocationConfidenceType>;
export type GpsAccuracy = Values<typeof GpsAccuracy>;

export function gpsBucket(meters: number | null | undefined): GpsAccuracy {
  if (meters == null || Number.isNaN(meters) || meters < 0) return GpsAccuracy.NO_FIX;
  if (meters <= 5) return GpsAccuracy.M5;
  if (meters <= 10) return GpsAccuracy.M10;
  if (meters <= 25) return GpsAccuracy.M25;
  if (meters <= 50) return GpsAccuracy.M50;
  if (meters <= 100) return GpsAccuracy.M100;
  if (meters <= 500) return GpsAccuracy.M500;
  return GpsAccuracy.COARSE;
}
