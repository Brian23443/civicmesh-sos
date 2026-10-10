import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireGps, gpsLabel, type GpsUpdate } from './gps';

const pos = (accuracy: number, lat = 30.27, lon = -97.74) =>
  ({ coords: { latitude: lat, longitude: lon, accuracy } }) as GeolocationPosition;
const err = (code: number) => ({ code }) as GeolocationPositionError;

function fakeGeo() {
  const watchers: PositionCallback[] = [];
  const geo = {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn((ok: PositionCallback) => { watchers.push(ok); return 7; }),
    clearWatch: vi.fn(),
  };
  return { geo: geo as unknown as Geolocation, raw: geo, emit: (p: GeolocationPosition) => watchers.forEach(w => w(p)) };
}

describe('acquireGps', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('makes the spec call first and stops on a good fix', () => {
    const { geo, raw } = fakeGeo();
    raw.getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(pos(8)));
    const updates: GpsUpdate[] = [];
    acquireGps(geo, u => updates.push(u));
    expect(raw.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function),
      { enableHighAccuracy: true, timeout: 10000 });
    expect(updates.at(-1)).toMatchObject({ phase: 'ready', fix: { accuracy: 8 } });
    expect(raw.watchPosition).not.toHaveBeenCalled();
  });

  it('keeps listening after the 10 s attempt times out, then takes the best fix', () => {
    const { geo, raw, emit } = fakeGeo();
    raw.getCurrentPosition.mockImplementation((_: PositionCallback, fail: PositionErrorCallback) => fail(err(3)));
    const updates: GpsUpdate[] = [];
    acquireGps(geo, u => updates.push(u));
    expect(raw.watchPosition).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(20_000);
    expect(gpsLabel(updates.at(-1)!)).toBe('Getting GPS… 20s');
    emit(pos(300)); expect(updates.at(-1)).toMatchObject({ phase: 'searching', fix: { accuracy: 300 } });
    emit(pos(900)); expect(updates.at(-1)!.fix!.accuracy).toBe(300);   // keeps the better fix
    emit(pos(35));  expect(updates.at(-1)).toMatchObject({ phase: 'ready', fix: { accuracy: 35 } });
    expect(raw.clearWatch).toHaveBeenCalledWith(7);
  });

  it('gives a coarse fix at the time budget instead of nothing', () => {
    const { geo, raw, emit } = fakeGeo();
    raw.getCurrentPosition.mockImplementation((_: PositionCallback, fail: PositionErrorCallback) => fail(err(2)));
    const updates: GpsUpdate[] = [];
    acquireGps(geo, u => updates.push(u), { budgetMs: 90_000 });
    emit(pos(450));
    vi.advanceTimersByTime(90_000);
    expect(updates.at(-1)).toMatchObject({ phase: 'ready', fix: { accuracy: 450 } });
  });

  it('reports a timeout without any fix, and a block immediately', () => {
    const t = fakeGeo();
    t.raw.getCurrentPosition.mockImplementation((_: PositionCallback, fail: PositionErrorCallback) => fail(err(3)));
    const a: GpsUpdate[] = [];
    acquireGps(t.geo, u => a.push(u), { budgetMs: 5_000 });
    vi.advanceTimersByTime(5_000);
    expect(gpsLabel(a.at(-1)!)).toBe('No GPS fix — try near a window');

    const d = fakeGeo();
    d.raw.getCurrentPosition.mockImplementation((_: PositionCallback, fail: PositionErrorCallback) => fail(err(1)));
    const b: GpsUpdate[] = [];
    acquireGps(d.geo, u => b.push(u));
    expect(gpsLabel(b.at(-1)!)).toBe('Location blocked — allow it in Settings');
    expect(d.raw.watchPosition).not.toHaveBeenCalled();
  });

  it('handles a browser without geolocation', () => {
    const updates: GpsUpdate[] = [];
    acquireGps(undefined, u => updates.push(u));
    expect(updates).toEqual([{ phase: 'unsupported', fix: null, elapsedMs: 0 }]);
  });
});
