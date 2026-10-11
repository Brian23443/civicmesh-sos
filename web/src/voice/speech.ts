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

function context(): Ctx | null {
  if (ctx) return ctx;
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
  const c = context();
  if (!c) return;
  void c.resume().catch(() => {});
  try { // a one-sample silent buffer completes the unlock on older iOS
    const src = c.createBufferSource(); src.buffer = c.createBuffer(1, 1, 22050); src.connect(c.destination); src.start(0);
  } catch { /* ignore */ }
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
  run++;
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
  await c.resume().catch(() => {});
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
