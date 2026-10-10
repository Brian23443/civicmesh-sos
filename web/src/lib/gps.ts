/**
 * GPS acquisition for the report (§12.3), hardened after a real-iPhone test in Airplane Mode.
 *
 * 1. The spec's call first: getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 }).
 * 2. A cold GPS start indoors without network assistance often needs longer, so if that attempt
 *    times out or is coarse, keep listening with watchPosition for up to `budgetMs`, keeping the
 *    most accurate fix and stopping early once it is within `goodEnoughM`.
 * Every state change is reported, including *why* there is no fix, so the UI never looks idle.
 */

export type GpsPhase = 'searching' | 'ready' | 'denied' | 'unavailable' | 'timeout' | 'unsupported';
export interface GpsFix { lat: number; lon: number; accuracy: number }
export interface GpsUpdate { phase: GpsPhase; fix: GpsFix | null; elapsedMs: number }
export interface GpsOptions { budgetMs?: number; goodEnoughM?: number; tickMs?: number }

const SPEC_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10000 };

function toFix(position: GeolocationPosition): GpsFix | null {
  const { latitude: lat, longitude: lon, accuracy } = position.coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180
    || !Number.isFinite(accuracy) || accuracy < 0) return null;
  return { lat, lon, accuracy };
}

/** Starts acquisition; returns a cancel function. */
export function acquireGps(geo: Geolocation | undefined, onUpdate: (u: GpsUpdate) => void,
  { budgetMs = 90_000, goodEnoughM = 50, tickMs = 1000 }: GpsOptions = {}): () => void {
  const started = Date.now();
  let best: GpsFix | null = null;
  let done = false;
  let watchId: number | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let budget: ReturnType<typeof setTimeout> | null = null;
  const elapsed = () => Date.now() - started;

  const stop = () => {
    done = true;
    if (watchId !== null && geo) geo.clearWatch(watchId);
    if (ticker) clearInterval(ticker);
    if (budget) clearTimeout(budget);
  };
  const finish = (phase: GpsPhase) => { if (done) return; stop(); onUpdate({ phase: best ? 'ready' : phase, fix: best, elapsedMs: elapsed() }); };
  const consider = (position: GeolocationPosition) => {
    if (done) return;
    const fix = toFix(position);
    if (fix && (!best || fix.accuracy < best.accuracy)) best = fix;
    if (best && best.accuracy <= goodEnoughM) finish('ready');
    else onUpdate({ phase: 'searching', fix: best, elapsedMs: elapsed() });
  };
  const failed = (error: GeolocationPositionError) => {
    if (done) return;
    if (error.code === 1) finish('denied');  // PERMISSION_DENIED: waiting longer won't help
    else if (watchId === null) startWatch(); // TIMEOUT / POSITION_UNAVAILABLE: keep listening
  };
  const startWatch = () => {
    if (done || watchId !== null || !geo) return;
    try {
      watchId = geo.watchPosition(consider, e => { if (e.code === 1) finish('denied'); },
        { enableHighAccuracy: true, maximumAge: 120_000, timeout: budgetMs });
    } catch { finish('unavailable'); }
  };

  if (!geo) { onUpdate({ phase: 'unsupported', fix: null, elapsedMs: 0 }); return () => {}; }
  onUpdate({ phase: 'searching', fix: null, elapsedMs: 0 });
  ticker = setInterval(() => { if (!done) onUpdate({ phase: 'searching', fix: best, elapsedMs: elapsed() }); }, tickMs);
  budget = setTimeout(() => finish(best ? 'ready' : 'timeout'), budgetMs);
  try {
    geo.getCurrentPosition(position => {
      consider(position);
      if (!done) startWatch();  // coarse first fix: keep improving within the budget
    }, failed, SPEC_OPTIONS);
  } catch { startWatch(); }
  return stop;
}

/** One-line status for the pills and the report screen. */
export function gpsLabel(u: GpsUpdate | null): string {
  if (!u) return 'No GPS fix';
  const s = Math.round(u.elapsedMs / 1000);
  switch (u.phase) {
    case 'searching': return u.fix ? `Getting GPS… ${s}s · ±${Math.ceil(u.fix.accuracy)} m` : `Getting GPS… ${s}s`;
    case 'ready': return `GPS ±${Math.ceil(u.fix!.accuracy)} m`;
    case 'denied': return 'Location blocked — allow it in Settings';
    case 'unsupported': return 'No GPS on this device';
    default: return 'No GPS fix — try near a window';
  }
}
