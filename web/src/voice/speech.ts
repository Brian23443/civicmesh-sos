/**
 * Offline voice guidance. Clips were generated once with ElevenLabs (scripts/voice.mjs) and ship in
 * public/voice/<lang>/ — the phone never contacts ElevenLabs. Phrases are stitched together with short
 * pauses; a missing clip falls back to the phone's built-in voice.
 *
 * Playback uses ONE <audio> element, because that is what iOS reliably allows:
 *  - once a tap has played something through an element, iOS lets that element play later (e.g. the
 *    read-back that starts after analysis), including after the app was backgrounded;
 *  - media elements play through the ring/silent switch.
 * (Web Audio was tried first: after leaving and returning to the app iOS kept it silent.)
 * Clips are fetched (from the offline cache) and played from blob: URLs — Safari's media loader makes
 * Range requests that a service-worker cache can't answer, so direct URLs could fail offline.
 */
import phrases from './phrases.en.json';
import type { FrameFields } from '../protocol/types';

const TEXT = phrases as Record<string, string>;
const GAP_MS = 140;   // pause between phrases
const BASE = `${import.meta.env.BASE_URL}voice/en/`;
const PENDING_MS = 15_000;

let player: HTMLAudioElement | null = null;
const urls = new Map<string, Promise<string | null>>();
let run = 0;
/** Speech iOS blocked (no tap yet since the app came back), played on the next tap. */
let pending: { keys: string[]; at: number } | null = null;
let silence: string | null = null;

/** Hidden diagnostics (open the app with ?voicedebug=1): what iOS allowed, shown on screen. */
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('voicedebug');
export const voiceDebugEnabled = DEBUG;
function log(msg: string) {
  if (!DEBUG) return;
  const line = `${new Date().toLocaleTimeString()} ${msg}`;
  window.dispatchEvent(new CustomEvent('voicedebug', { detail: line }));
}

function audio(): HTMLAudioElement | null {
  if (player) return player;
  if (typeof Audio === 'undefined') return null;
  player = new Audio();
  player.preload = 'auto';
  player.setAttribute('playsinline', '');
  return player;
}

/** 50 ms of silent 8 kHz mono WAV, built in memory — used to "prime" the element inside a tap. */
function silentUrl(): string {
  if (silence) return silence;
  const samples = 400, bytes = 44 + samples;
  const v = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  silence = URL.createObjectURL(new Blob([v.buffer], { type: 'audio/wav' }));
  return silence;
}

/** Call from inside a tap handler: lets later (async) playback start on iOS. */
export function unlockAudio(): void {
  const el = audio();
  if (!el) return;
  const held = pending; pending = null;
  // Prime the element synchronously, inside the tap — that grants it permission to play later.
  if (el.paused) { el.src = silentUrl(); el.play().then(() => log('prime ok'), e => log(`prime refused: ${e?.name}`)); }
  if (held && Date.now() - held.at < PENDING_MS) void say(held.keys); // something was blocked: play it now
}

/**
 * Keeps voice working across leaving and returning to the app: any tap re-primes the player while voice
 * guidance is on, and speech stops when the app is hidden.
 */
export function installVoiceLifecycle(isOn: () => boolean): () => void {
  const onTap = () => { if (isOn()) unlockAudio(); };
  const onVisibility = () => { log(`visibility ${document.visibilityState}`); if (document.visibilityState === 'hidden') stopSpeaking(); };
  for (const type of ['touchend', 'click'] as const) document.addEventListener(type, onTap, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    for (const type of ['touchend', 'click'] as const) document.removeEventListener(type, onTap, { capture: true });
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

function clip(key: string): Promise<string | null> {
  let p = urls.get(key);
  if (!p) {
    p = fetch(BASE + key + '.mp3')
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(blob => URL.createObjectURL(blob))
      .catch(() => null);
    urls.set(key, p);
  }
  return p;
}

export function stopSpeaking(): void {
  run++; pending = null;
  if (player) { player.pause(); player.onended = null; }
  try { window.speechSynthesis?.cancel(); } catch { /* unsupported */ }
}

/** Play one clip to the end. false = iOS refused (no tap yet). */
function playOne(el: HTMLAudioElement, src: string, mine: number): Promise<boolean> {
  return new Promise(resolve => {
    if (mine !== run) return resolve(true);
    el.onended = () => resolve(true);
    el.src = src;
    el.play().then(() => log(`play ${src.slice(-6)} ok`), e => { log(`play refused: ${e?.name}`); resolve(false); });
  });
}

/** Speak phrases in order (stops anything already playing). Resolves when finished or interrupted. */
export async function say(keys: string[]): Promise<void> {
  stopSpeaking();
  log(`say ${keys[0]}… (${keys.length})`);
  const mine = run;
  const el = audio();
  const sources = await Promise.all(keys.map(clip));
  if (mine !== run) return;
  if (!el || sources.some(s => !s)) return fallback(keys, mine);
  for (let i = 0; i < sources.length; i++) {
    const ok = await playOne(el, sources[i]!, mine);
    if (mine !== run) return;
    if (!ok) { pending = { keys: keys.slice(i), at: Date.now() }; return; } // plays on the next tap
    if (i < sources.length - 1) await new Promise(r => setTimeout(r, GAP_MS));
  }
  el.onended = null;
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
