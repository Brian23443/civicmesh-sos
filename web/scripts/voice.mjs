#!/usr/bin/env node
/**
 * RescuNote voice pack — generated ONCE with ElevenLabs, shipped as static audio, played offline.
 * The API key is read from ELEVENLABS_API_KEY (or the repo's git-ignored .env) and never leaves this machine.
 *
 *   node scripts/voice.mjs voices                       list the voices on your account
 *   node scripts/voice.mjs audition [--ids a,b,c]       sample read-back per voice → voice-audition/index.html
 *   node scripts/voice.mjs generate --voice <id> [--lang en] [--model eleven_v4] [--force]
 *                                                       all phrases → public/voice/<lang>/*.mp3 + manifest.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.elevenlabs.io/v1';
const MODEL = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'eleven_v4'; // 94 languages, incl. Spanish
const FORMAT = 'mp3_44100_64';          // small files, clear speech
// Calm and steady rather than expressive: this is read to someone in an emergency.
const SETTINGS = { stability: 0.6, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
const SAMPLE = "Here's what will be sent. Red. Life-threatening. Flood. Trapped. Three people. Needs: insulin. "
  + "Location found. Tap Send to send it, or tap anything that's wrong to change it.";

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const env = join(WEB, '..', '.env');
  if (existsSync(env)) {
    for (const line of readFileSync(env, 'utf8').split('\n')) {
      const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.*)\s*$/);
      if (m && m[1]) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  console.error('ELEVENLABS_API_KEY is not set (environment or .env). Open a new terminal after adding it to ~/.zshrc.');
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { 'xi-api-key': apiKey(), ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function speak(voiceId, text) {
  const res = await api(`/text-to-speech/${voiceId}?output_format=${FORMAT}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  });
  return Buffer.from(await res.arrayBuffer());
}

async function listVoices() {
  const { voices } = await (await api('/voices')).json();
  return voices.map(v => ({ id: v.voice_id, name: v.name, category: v.category,
    labels: Object.values(v.labels ?? {}).filter(Boolean).join(', '), preview: v.preview_url }));
}

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const escape = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function audition() {
  const all = await listVoices();
  const wanted = arg('ids')?.split(',').map(s => s.trim());
  // Voices outside the account list (e.g. from the Voice Library) still work by id.
  const voices = wanted ? wanted.map(id => all.find(v => v.id === id) ?? { id, name: id, labels: '' })
    : all.filter(v => v.category === 'premade').slice(0, 12);
  const out = join(WEB, 'voice-audition');
  mkdirSync(out, { recursive: true });
  const rows = [];
  for (const v of voices) {
    process.stdout.write(`  ${v.name} … `);
    writeFileSync(join(out, `${v.id}.mp3`), await speak(v.id, SAMPLE));
    console.log('ok');
    rows.push(`<tr><td><strong>${escape(v.name)}</strong><br><small>${escape(v.labels)}</small></td>`
      + `<td><audio controls preload="none" src="${escape(v.id)}.mp3"></audio></td><td><code>${escape(v.id)}</code></td></tr>`);
  }
  writeFileSync(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>RescuNote voice audition</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px/1.5 system-ui;margin:24px;max-width:900px}td{padding:10px 12px;border-bottom:1px solid #ddd;vertical-align:middle}code{font-size:13px}</style>
<h1>RescuNote voice audition</h1><p>Each plays the same read-back: <em>${escape(SAMPLE)}</em></p>
<table>${rows.join('')}</table>`);
  console.log(`\nOpen ${join(out, 'index.html')}`);
}

async function generate() {
  const voice = arg('voice'); const lang = arg('lang') ?? 'en'; const force = process.argv.includes('--force');
  if (!voice) { console.error('--voice <id> is required (see: node scripts/voice.mjs voices)'); process.exit(1); }
  const phrases = JSON.parse(readFileSync(join(WEB, 'src', 'voice', `phrases.${lang}.json`), 'utf8'));
  const out = join(WEB, 'public', 'voice', lang);
  mkdirSync(out, { recursive: true });
  const manifestPath = join(out, 'manifest.json');
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  // A different voice or changed text means regenerating that clip; otherwise reuse it (saves credits).
  const sameVoice = previous?.voice === voice && previous?.model === MODEL;
  let made = 0;
  for (const [key, text] of Object.entries(phrases)) {
    const file = join(out, `${key}.mp3`);
    if (!force && sameVoice && previous.text?.[key] === text && existsSync(file)) continue;
    writeFileSync(file, await speak(voice, text)); made++;
    process.stdout.write(`\r  ${made} generated (${key})            `);
  }
  writeFileSync(manifestPath, JSON.stringify({ voice, model: MODEL, format: FORMAT, lang, generatedAt: new Date().toISOString(),
    text: phrases }, null, 1));
  console.log(`\n${Object.keys(phrases).length} phrases in public/voice/${lang} (${made} new).`);
}

const command = process.argv[2];
try {
  if (command === 'voices') console.table((await listVoices()).map(({ preview, ...v }) => v));
  else if (command === 'audition') await audition();
  else if (command === 'generate') await generate();
  else { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).join('\n')); }
} catch (error) {
  console.error(error instanceof Error ? error.message : error); process.exit(1);
}
