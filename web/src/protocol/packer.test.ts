import { describe, expect, it } from 'vitest';
import { GpsAccuracy, HazardClass, LocationConfidenceType, MedicalFlags, RescueStatus, TriagePriority, gpsBucket } from './enums';
import { fromHex, toHex } from './hex';
import { pack, packFrame, unpackFrame } from './packer';
import type { FrameFields } from './types';

const main: FrameFields = {
  priority: TriagePriority.IMMEDIATE, hazard: HazardClass.FLOOD, status: RescueStatus.TRAPPED,
  adults: 2, children: 1, medicalFlags: MedicalFlags.INSULIN, thirdParty: false,
  locationType: LocationConfidenceType.DIRECT_ON_SCENE, lat: 30.2672, lon: -97.7431,
  timestamp: 1760000000, deviceId: 0xbeef, seq: 0, gpsAccuracy: GpsAccuracy.M10,
};
const vector1 = '861200012B0BF3BA7E6A68E77800BEEF0050';
const vector2 = '9E0119002B0BF3BA7E6A68E7780000000040';

describe('§3 protocol vectors', () => {
  it('matches the main vector exactly, including tail offsets', () => {
    const frame = packFrame(main);
    expect(frame).toHaveLength(18); expect(toHex(frame)).toBe(vector1);
    expect(Array.from(frame.slice(10))).toEqual([0x68, 0xe7, 0x78, 0, 0xbe, 0xef, 0, 0x50]);
    const decoded = unpackFrame(frame);
    expect(decoded).toMatchObject({ priority: 2, hazard: 1, status: 2, adults: 2, children: 1,
      flags: 1, medicalFlags: 1, thirdParty: false, locationType: 0, timestamp: 1760000000,
      deviceId: 48879, seq: 0, gpsAccuracy: 2, version: 1 });
  });
  it('matches the third-party/address vector exactly', () => {
    const frame = packFrame({ ...main, hazard: HazardClass.MEDICAL_CRISIS, adults: 1, children: 0,
      medicalFlags: 0, thirdParty: true, locationType: LocationConfidenceType.EXPLICIT_ADDRESS,
      deviceId: 0, gpsAccuracy: GpsAccuracy.NO_FIX });
    expect(toHex(frame)).toBe(vector2);
    expect(unpackFrame(frame)).toMatchObject({ flags: 0x1900, thirdParty: true, locationType: 3 });
  });
});

it.each([[90, 180], [90, -180], [-90, 180], [-90, -180], [0, 0], [-33.8688, 151.2093], [64.1466, -21.9426]])(
  'round-trips coordinates at %s, %s', (lat, lon) => {
    const frame = packFrame({ ...main, lat, lon }); const decoded = unpackFrame(frame);
    expect(Math.abs(decoded.lat - lat)).toBeLessThanOrEqual(1.1e-5);
    expect(Math.abs(decoded.lon - lon)).toBeLessThanOrEqual(2.2e-5);
    expect(packFrame(decoded)).toEqual(frame);
  },
);

it('covers every priority/hazard/status bit combination', () => {
  for (const priority of Object.values(TriagePriority)) {
    for (const hazard of Object.values(HazardClass)) {
      for (const status of Object.values(RescueStatus)) {
        const frame = packFrame({ ...main, priority, hazard, status });
        expect(frame[0]).toBe(priority | hazard << 2 | status << 6);
        expect(unpackFrame(frame)).toMatchObject({ priority, hazard, status });
      }
    }
  }
});
it('saturates counts and preserves maximum unsigned metadata', () => {
  const frame = packFrame({ ...main, adults: -2, children: 99, timestamp: 0xffffffff, deviceId: 0xffff, seq: 255 });
  expect(frame[1]).toBe(0xf0);
  expect(unpackFrame(frame)).toMatchObject({ adults: 0, children: 15, timestamp: 0xffffffff, deviceId: 65535, seq: 255 });
});
it.each([[0,0], [1,0x1200], [2,0x1400], [3,0x1800]] as const)('sets location flags for type %s', (locationType, flags) => {
  expect(unpackFrame(packFrame({ ...main, medicalFlags: 0, locationType })).flags).toBe(flags);
});
it('preserves supplied flags and uses ADDRESS > LANDMARK > PROXIMATE precedence', () => {
  const decoded = unpackFrame(packFrame({ ...main, medicalFlags: 0x1fff }));
  expect(decoded.flags).toBe(0x1fff); expect(decoded.thirdParty).toBe(true); expect(decoded.locationType).toBe(3);
});
it('decodes a frame slice with a nonzero buffer offset', () => {
  const larger = new Uint8Array(30); larger.set(packFrame(main), 5);
  expect(unpackFrame(larger.subarray(5,23))).toEqual(unpackFrame(packFrame(main)));
});
it.each([0, 17, 19])('rejects length %s', length => {
  expect(() => unpackFrame(new Uint8Array(length))).toThrow();
  expect(() => toHex(new Uint8Array(length))).toThrow();
});
it.each([0,2,3])('rejects version %s', version => {
  const frame = packFrame(main); frame[17] = (version << 6) | 16;
  expect(() => unpackFrame(frame)).toThrow('version');
  expect(() => fromHex(Array.from(frame, v => v.toString(16).padStart(2,'0')).join(''))).toThrow('version');
});
it('hex accepts either case and emits uppercase', () => {
  expect(toHex(fromHex(vector1.toLowerCase()))).toBe(vector1);
});
it.each(['', vector1.slice(2), `${vector1}00`, ` ${vector1}`, `0x${vector1}`, 'G'.repeat(36)])('rejects malformed hex %s', hex => {
  expect(() => fromHex(hex)).toThrow();
});
it.each([
  [null,0], [undefined,0], [-1,0], [NaN,0], [0,1], [3.2,1], [5,1], [5.01,2], [10,2], [10.01,3],
  [25,3], [25.01,4], [50,4], [50.01,5], [100,5], [100.01,6], [480,6], [500,6], [500.01,7], [2000,7],
])('buckets GPS accuracy %s as %s', (meters, bucket) => { expect(gpsBucket(meters)).toBe(bucket); });
it.each([
  { priority: 4 }, { hazard: 16 }, { status: -1 }, { adults: NaN }, { children: 1.5 },
  { lat: 91 }, { lon: -181 }, { lat: Infinity }, { timestamp: -1 }, { timestamp: 0x100000000 },
  { deviceId: 65536 }, { seq: 256 }, { gpsAccuracy: 8 }, { medicalFlags: 0x2000 }, { locationType: 4 },
])('rejects invalid fields %j', fields => {
  expect(() => packFrame({ ...main, ...fields } as FrameFields)).toThrow();
});

// Caller-supplied golden assertions; vectors are field objects, not hex strings.
it('matches the supplied pack() golden vectors verbatim', () => {
  const vector1: FrameFields = { ...main };
  const vector2: FrameFields = {
    ...main, hazard: HazardClass.MEDICAL_CRISIS, adults: 1, children: 0,
    medicalFlags: 0, thirdParty: true, locationType: LocationConfidenceType.EXPLICIT_ADDRESS,
    deviceId: 0, gpsAccuracy: GpsAccuracy.NO_FIX,
  };
  expect(pack(vector1)).toBe(
    "861200012B0BF3BA7E6A68E77800BEEF0050"
  );
  expect(pack(vector2)).toBe(
    "9E0119002B0BF3BA7E6A68E7780000000040"
  );
});
