import { LocationConfidenceType as Location, MedicalFlags as Flags } from './enums';
import { assertFrame, FRAME_LEN, FRAME_VERSION, toHex } from './hex';
import type { DecodedFrame, FrameFields } from './types';
export { FRAME_LEN, FRAME_VERSION, toHex, fromHex } from './hex';
export { gpsBucket } from './enums';

const INT24_MAX = 0x7fffff;
const LOCATION_FLAGS = [0, Flags.LOC_PROXIMATE, Flags.LOC_LANDMARK, Flags.LOC_EXPLICIT_ADDRESS] as const;

function integer(value: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new RangeError(`${name} must be an integer from 0 to ${max}`);
  return value;
}
function count(value: number): number {
  if (!Number.isInteger(value)) throw new RangeError('Headcounts must be finite integers');
  return Math.max(0, Math.min(15, value));
}
function coordinate(value: number, limit: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > limit) throw new RangeError(`Coordinate must be within ±${limit}`);
  // Track 4's specified JS formula. Number retains double precision throughout.
  return Math.max(-INT24_MAX, Math.min(INT24_MAX, Math.round(value / limit * INT24_MAX)));
}
function writeInt24(frame: Uint8Array, offset: number, value: number): void {
  const unsigned = value & 0xffffff;
  frame[offset] = unsigned >>> 16;
  frame[offset + 1] = unsigned >>> 8;
  frame[offset + 2] = unsigned;
}
function readInt24(frame: Uint8Array, offset: number): number {
  const unsigned = (frame[offset] << 16) | (frame[offset + 1] << 8) | frame[offset + 2];
  return unsigned & 0x800000 ? unsigned - 0x1000000 : unsigned;
}

/** MASTER_PROMPT.md §3: exactly 18 bytes, big-endian, no application checksum. */
export function packFrame(fields: FrameFields): Uint8Array {
  const priority = integer(fields.priority, 3, 'priority');
  const hazard = integer(fields.hazard, 15, 'hazard');
  const status = integer(fields.status, 3, 'status');
  const location = integer(fields.locationType, 3, 'locationType');
  const gps = integer(fields.gpsAccuracy, 7, 'gpsAccuracy');
  if (typeof fields.thirdParty !== 'boolean') throw new TypeError('thirdParty must be a boolean');
  let flags = integer(fields.medicalFlags, 0x1fff, 'medicalFlags');
  if (fields.thirdParty) flags |= Flags.THIRD_PARTY_REPORT | Flags.LOCATION_DISCREPANCY_ALERT;
  if (location !== Location.DIRECT_ON_SCENE) flags |= LOCATION_FLAGS[location] | Flags.LOCATION_DISCREPANCY_ALERT;
  const frame = new Uint8Array(FRAME_LEN);
  const view = new DataView(frame.buffer);
  frame[0] = priority | (hazard << 2) | (status << 6);
  frame[1] = count(fields.adults) | (count(fields.children) << 4);
  view.setUint16(2, flags, false);
  writeInt24(frame, 4, coordinate(fields.lat, 90));
  writeInt24(frame, 7, coordinate(fields.lon, 180));
  view.setUint32(10, integer(fields.timestamp, 0xffffffff, 'timestamp'), false);
  view.setUint16(14, integer(fields.deviceId, 0xffff, 'deviceId'), false);
  frame[16] = integer(fields.seq, 0xff, 'seq');
  frame[17] = (FRAME_VERSION << 6) | (gps << 3);
  return frame;
}

export function unpackFrame(frame: Uint8Array): DecodedFrame {
  assertFrame(frame);
  // Respect slices into larger buffers (byteOffset must not be lost).
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const flags = view.getUint16(2, false);
  const locationType = flags & Flags.LOC_EXPLICIT_ADDRESS ? Location.EXPLICIT_ADDRESS
    : flags & Flags.LOC_LANDMARK ? Location.LANDMARK_POI
    : flags & Flags.LOC_PROXIMATE ? Location.PROXIMATE_OFFSET : Location.DIRECT_ON_SCENE;
  return {
    priority: (frame[0] & 3) as FrameFields['priority'],
    hazard: ((frame[0] >>> 2) & 15) as FrameFields['hazard'],
    status: (frame[0] >>> 6) as FrameFields['status'],
    adults: frame[1] & 15, children: frame[1] >>> 4,
    medicalFlags: flags, flags, thirdParty: Boolean(flags & Flags.THIRD_PARTY_REPORT), locationType,
    lat: readInt24(frame, 4) / INT24_MAX * 90,
    lon: readInt24(frame, 7) / INT24_MAX * 180,
    timestamp: view.getUint32(10, false), deviceId: view.getUint16(14, false), seq: frame[16],
    gpsAccuracy: ((frame[17] >>> 3) & 7) as FrameFields['gpsAccuracy'], version: FRAME_VERSION,
  };
}

/** Convenience API for the relay URL: returns exactly 36 uppercase hex characters. */
export function pack(fields: FrameFields): string {
  return toHex(packFrame(fields));
}
