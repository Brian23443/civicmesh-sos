export const FRAME_LEN = 18;
export const FRAME_VERSION = 1;

/** Structural frame validation shared by the decoder and transport helpers. */
export function assertFrame(frame: Uint8Array): void {
  if (!(frame instanceof Uint8Array) || frame.length !== FRAME_LEN) {
    throw new RangeError(`Frame must be exactly ${FRAME_LEN} bytes`);
  }
  if (frame[17] >>> 6 !== FRAME_VERSION) throw new RangeError('Unsupported frame version');
}

export function toHex(frame: Uint8Array): string {
  assertFrame(frame);
  return Array.from(frame, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Accepts either case, but not whitespace, prefixes, separators, or partial frames. */
export function fromHex(hex: string): Uint8Array {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]{36}$/.test(hex)) {
    throw new RangeError('Frame hex must contain exactly 36 hexadecimal characters');
  }
  const frame = Uint8Array.from({ length: FRAME_LEN }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  assertFrame(frame);
  return frame;
}
