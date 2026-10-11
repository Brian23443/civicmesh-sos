/**
 * Offline voice guidance. Clips were generated once with ElevenLabs (scripts/voice.mjs) and ship in
 * public/voice/<lang>/ — the phone never contacts ElevenLabs. Phrases are stitched together with short
 * pauses; a missing clip falls back to the phone's built-in voice.
 *
 * iOS rules this handles: audio may only start inside a tap (unlock() from the tap handler, then later
 * playback is allowed), and the silent switch mutes web audio unless the session is "playback".
 */
import phrases from './phrases.en.json';
import type { FrameFields } from '../protocol/types';

const TEXT = phrases as Record<string, string>;
const GAP_S = 0.14;   // pause between phrases
const BASE = `${import.meta.env.BASE_URL}voice/en/`;

type Ctx = AudioContext;
let ctx: Ctx | null = null;
const decoded = new Map<string, Promise<AudioBuffer | null>>();
let run = 0;
let playing: AudioBufferSourceNode[] = [];
/** Speech that iOS blocked (audio suspended since the app was last in the background), played on the next tap. */
let pending: { keys: string[]; at: number } | null = null;
const PENDING_MS = 15_000;

function context(): Ctx | null {
  if (ctx && ctx.state !== 'closed') return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    // Safari 17+: play through the ring/silent switch like media does.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  } catch { /* unsupported */ }
  ctx = new Ctor();
  return ctx;
}

/** Call from inside a tap handler: lets later (async) playback start on iOS. */
export function unlockAudio(): void {
  let c = context();
  if (!c) return;
  // iOS marks the context "interrupted" after the app was backgrounded (or a call/Siri); a fresh one
  // is the reliable way back. Decoded clips are kept — AudioBuffers aren't tied to a context.
  if ((c.state as string) === 'interrupted') { void c.close().catch(() => {}); ctx = null; c = context(); if (!c) return; }
  void c.resume().catch(() => {});
  try { // a one-sample silent buffer completes the unlock on older iOS
    const src = c.createBufferSource(); src.buffer = c.createBuffer(1, 1, 22050); src.connect(c.destination); src.start(0);
  } catch { /* ignore */ }
  if (pending) {
    const { keys, at } = pending; pending = null;
    if (Date.now() - at < PENDING_MS) void say(keys);
  }
}

/**
 * Keeps voice working across leaving and returning to the app: any tap re-unlocks audio while voice
 * guidance is on (iOS suspends it in the background), and speech stops when the app is hidden.
 */
export function installVoiceLifecycle(isOn: () => boolean): () => void {
  const onTap = () => { if (isOn()) unlockAudio(); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') stopSpeaking(); };
  for (const type of ['touchend', 'click'] as const) document.addEventListener(type, onTap, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    for (const type of ['touchend', 'click'] as const) document.removeEventListener(type, onTap, { capture: true });
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** resume() can stay pending forever when iOS won't allow audio yet — don't wait on it. */
function resumeQuickly(c: Ctx): Promise<void> {
  return Promise.race([c.resume().catch(() => {}), new Promise<void>(r => setTimeout(r, 300))]);
}

function clip(key: string): Promise<AudioBuffer | null> {
  let p = decoded.get(key);
  if (!p) {
    const c = context();
    p = !c ? Promise.resolve(null) : fetch(BASE + key + '.mp3')
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(data => c.decodeAudioData(data))
      .catch(() => null);
    decoded.set(key, p);
  }
  return p;
}

export function stopSpeaking(): void {
  run++; pending = null;
  for (const s of playing) { try { s.stop(); } catch { /* already ended */ } }
  playing = [];
  try { window.speechSynthesis?.cancel(); } catch { /* unsupported */ }
}

/** Speak phrases in order (stops anything already playing). Resolves when finished or interrupted. */
export async function say(keys: string[]): Promise<void> {
  stopSpeaking();
  const mine = run;
  const c = context();
  const buffers = await Promise.all(keys.map(clip));
  if (mine !== run) return;
  if (!c || buffers.some(b => !b)) return fallback(keys, mine);
  await resumeQuickly(c);
  if (mine !== run) return;
  if (c.state !== 'running') { pending = { keys, at: Date.now() }; return; } // plays on the next tap
  let t = c.currentTime + 0.05;
  for (const b of buffers as AudioBuffer[]) {
    const src = c.createBufferSource(); src.buffer = b; src.connect(c.destination); src.start(t);
    playing.push(src); t += b.duration + GAP_S;
  }
  await new Promise(resolve => setTimeout(resolve, (t - c.currentTime) * 1000));
}

/** The phone's own voice, for anything the clip pack can't play. */
function fallback(keys: string[], mine: number): Promise<void> {
  const synth = window.speechSynthesis;
  if (!synth || mine !== run) return Promise.resolve();
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(keys.map(k => TEXT[k] ?? '').join(' '));
    u.rate = 0.95; u.onend = () => resolve(); u.onerror = () => resolve();
    synth.speak(u);
  });
}

type ReadbackFields = Pick<FrameFields, 'priority' | 'hazard' | 'status' | 'adults' | 'children' | 'medicalFlags' | 'thirdParty'>;

/**
 * The spoken check before Send — what the model decided, in the order a responder thinks about it:
 * "Here's what will be sent. Red. Life-threatening. Flood. Trapped. Three people. Needs: insulin and oxygen.
 *  Location found. Tap Send to send it, or tap anything that's wrong to change it."
 */
export function readbackKeys(f: ReadbackFields, location: 'found' | 'searching' | 'none'): string[] {
  const keys = ['readback_intro', `priority_${f.priority}`];
  if (f.hazard !== 0) keys.push(`hazard_${f.hazard}`);
  keys.push(`status_${f.status}`);
  keys.push(`people_${Math.min(30, f.adults + f.children)}`);
  if (f.children > 0) keys.push(`children_${Math.min(15, f.children)}`);
  const needs = [0, 1, 2, 3, 4, 5, 6, 7].filter(bit => f.medicalFlags & (1 << bit)).map(bit => `medical_${bit}`);
  if (needs.length) {
    keys.push('needs_intro', ...needs.slice(0, -1));
    if (needs.length > 1) keys.push('and');
    keys.push(needs[needs.length - 1]);
  }
  if (f.thirdParty) keys.push('third_party');
  keys.push(`location_${location}`, 'readback_outro', 'wifi');
  return keys;
}
