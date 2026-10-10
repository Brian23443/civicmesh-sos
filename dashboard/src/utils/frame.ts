import type { Incident } from "../types/incident";

export interface FrameBreakdownRow {
  offset: string;
  hex: string;
  field: string;
  decoded: string;
}

const FLAG_NAMES = [
  "INSULIN",
  "OXYGEN",
  "BLEEDING",
  "HYPOTHERMIA",
  "MOBILITY_IMPAIRED",
  "CARDIAC",
  "PREGNANCY_INFANT",
  "BURNS",
  "THIRD_PARTY_REPORT",
  "LOC_PROXIMATE",
  "LOC_LANDMARK",
  "LOC_EXPLICIT_ADDRESS",
  "LOCATION_DISCREPANCY_ALERT",
  "RESERVED_13",
  "RESERVED_14",
  "RESERVED_15",
] as const;

function signedInt24(
  high: number,
  middle: number,
  low: number,
): number {
  const unsigned = (high << 16) | (middle << 8) | low;
  return unsigned & 0x800000 ? unsigned - 0x1000000 : unsigned;
}

function rangeHex(bytes: Uint8Array, start: number, end: number): string {
  return Array.from(bytes.slice(start, end + 1))
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

export function isValidFrameHex(frameHex: string): boolean {
  return /^[0-9A-F]{36}$/.test(frameHex);
}

export function decodeFrameBreakdown(
  frameHex: string,
  incident: Incident,
): FrameBreakdownRow[] {
  if (!isValidFrameHex(frameHex)) return [];

  const bytes = Uint8Array.from(
    frameHex.match(/.{2}/g) ?? [],
    (value) => Number.parseInt(value, 16),
  );
  const view = new DataView(bytes.buffer);
  const control = bytes[0];
  const counts = bytes[1];
  const flags = view.getUint16(2, false);
  const latitudeRaw = signedInt24(bytes[4], bytes[5], bytes[6]);
  const longitudeRaw = signedInt24(bytes[7], bytes[8], bytes[9]);
  const latitude = (latitudeRaw / 0x7fffff) * 90;
  const longitude = (longitudeRaw / 0x7fffff) * 180;
  const timestamp = view.getUint32(10, false);
  const deviceId = view.getUint16(14, false);
  const sequence = bytes[16];
  const tail = bytes[17];
  const enabledFlags = FLAG_NAMES.flatMap((name, bit) =>
    flags & (1 << bit) ? [`bit ${bit}: ${name}`] : [],
  );

  return [
    {
      offset: "0x00",
      hex: rangeHex(bytes, 0, 0),
      field: "Priority / Hazard / Status",
      decoded:
        `priority ${control & 0x03} (${incident.priority.name}); ` +
        `hazard ${(control >> 2) & 0x0f} (${incident.hazard.name}); ` +
        `status ${(control >> 6) & 0x03} (${incident.status.name})`,
    },
    {
      offset: "0x01",
      hex: rangeHex(bytes, 1, 1),
      field: "Adults / Children",
      decoded: `${counts & 0x0f} adults; ${(counts >> 4) & 0x0f} children`,
    },
    {
      offset: "0x02–0x03",
      hex: rangeHex(bytes, 2, 3),
      field: "Flags (>H)",
      decoded: enabledFlags.length > 0 ? enabledFlags.join(", ") : "No flags set",
    },
    {
      offset: "0x04–0x06",
      hex: rangeHex(bytes, 4, 6),
      field: "Latitude (signed int24)",
      decoded: `${latitudeRaw} → ${latitude.toFixed(6)}°`,
    },
    {
      offset: "0x07–0x09",
      hex: rangeHex(bytes, 7, 9),
      field: "Longitude (signed int24)",
      decoded: `${longitudeRaw} → ${longitude.toFixed(6)}°`,
    },
    {
      offset: "0x0A–0x0D",
      hex: rangeHex(bytes, 10, 13),
      field: "Timestamp (uint32)",
      decoded: `${timestamp} → ${new Date(timestamp * 1000).toLocaleString()}`,
    },
    {
      offset: "0x0E–0x0F",
      hex: rangeHex(bytes, 14, 15),
      field: "Device ID (uint16)",
      decoded: `${deviceId} (0x${deviceId.toString(16).padStart(4, "0").toUpperCase()})`,
    },
    {
      offset: "0x10",
      hex: rangeHex(bytes, 16, 16),
      field: "Sequence counter",
      decoded: String(sequence),
    },
    {
      offset: "0x11",
      hex: rangeHex(bytes, 17, 17),
      field: "Spare / GPS Accuracy / Version",
      decoded:
        `spare ${tail & 0x07}; GPS ${(tail >> 3) & 0x07} ` +
        `(${incident.gps_accuracy.name}); version ${(tail >> 6) & 0x03}`,
    },
  ];
}
