// Copies the pinned onnxruntime-web WASM runtime into public/ort/ so it is served (and precached)
// from the app's own origin — never a CDN. Runs before dev, build and test.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = resolve(import.meta.dirname, '../node_modules/onnxruntime-web');
const dist = resolve(pkg, 'dist');
const out = resolve(import.meta.dirname, '../public/ort');
mkdirSync(out, { recursive: true });
for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) copyFileSync(resolve(dist, file), resolve(out, file));
const { version } = JSON.parse(readFileSync(resolve(pkg, 'package.json'), 'utf8'));
console.log(`onnxruntime-web ${version} WASM copied to public/ort/`);
