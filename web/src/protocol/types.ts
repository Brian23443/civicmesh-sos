import type { GpsAccuracy, HazardClass, LocationConfidenceType, RescueStatus, TriagePriority } from './enums';

/** Flat review-state API; original text is deliberately absent from the wire fields. */
export interface FrameFields {
  priority: TriagePriority;
  hazard: HazardClass;
  status: RescueStatus;
  adults: number;
  children: number;
  /** §3 starts with this mask and ORs in third-party and location flags. */
  medicalFlags: number;
  thirdParty: boolean;
  locationType: LocationConfidenceType;
  /** JavaScript Number (double precision); never Float32Array. */
  lat: number;
  lon: number;
  timestamp: number;
  deviceId: number;
  seq: number;
  gpsAccuracy: GpsAccuracy;
}

export interface DecodedFrame extends FrameFields {
  /** Complete 16-bit wire mask, including medical and location flags. */
  flags: number;
  version: 1;
}
