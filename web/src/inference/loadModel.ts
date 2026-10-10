/**
 * Loads Track 1's browser model from web/public/model/ (contract K4) and runs it locally with
 * onnxruntime-web (WASM, 1 thread — iOS-safe). model.json `kind` picks the stage:
 *   prototype  → embedder.onnx.gz + prototypes.json  (Stage 1)
 *   classifier → classifier.onnx.gz                   (Stage 2, five heads)
 * Swapping stages is only a file replacement; nothing else in the app knows which is loaded.
 */
import type { InferenceSession, Tensor } from 'onnxruntime-web';
import { fetchLocalAsset, localAssetUrl } from '../offline/assets';
import type { LogitProvider, TriageLogits } from './fineTunedClassifier';
import { createModelClassifier, parseModelConfig, type ModelConfig } from './modelClassifier';
import { WordPieceTokenizer } from './tokenizer';
import type { Classifier, PrototypeData } from './types';

type Ort = typeof import('onnxruntime-web');
export interface LoadDeps {
  fetchAsset: (path: string) => Promise<Response>;
  ort: () => Promise<Ort>;
  wasmPaths: string;
}
export interface LoadedModel { classifier: Classifier; config: ModelConfig; downloadBytes: number; loadMs: number }

const MODEL_DIR = 'model/';
const browserDeps = (): LoadDeps => ({
  fetchAsset: fetchLocalAsset,
  ort: () => import('onnxruntime-web/wasm') as unknown as Promise<Ort>,
  wasmPaths: localAssetUrl('ort/ort-wasm-simd-threaded.wasm').replace(/ort-wasm-simd-threaded\.wasm$/, ''),
});

/** Reads a response with byte progress; gunzips only if the bytes really are gzip (a host may have
 * already decoded a Content-Encoding: gzip response). */
async function readModelBytes(res: Response, onBytes: (loaded: number, total: number | null) => void): Promise<Uint8Array> {
  const total = Number(res.headers.get('content-length')) || null;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); loaded += value.byteLength; onBytes(loaded, total);
    }
  } else {
    const all = new Uint8Array(await res.arrayBuffer());
    chunks.push(all); loaded = all.byteLength; onBytes(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function feeds(ort: Ort, tokenizer: WordPieceTokenizer, text: string): Record<string, Tensor> {
  const { inputIds, attentionMask } = tokenizer.encode(text);
  const dims = [1, inputIds.length];
  return {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), dims),
    attention_mask: new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), dims),
  };
}

export async function loadLocalModel(progress: (message: string) => void = () => {},
  deps: LoadDeps = browserDeps()): Promise<LoadedModel> {
  const started = performance.now();
  progress('Preparing emergency mode…');
  const config = parseModelConfig(await (await deps.fetchAsset(`${MODEL_DIR}model.json`)).json());
  const tokenizer = new WordPieceTokenizer(await (await deps.fetchAsset(`${MODEL_DIR}tokenizer.json`)).json(),
    config.max_length ?? 128);

  const ort = await deps.ort();
  ort.env.wasm.wasmPaths = deps.wasmPaths;
  ort.env.wasm.numThreads = 1;   // iOS Safari: no SharedArrayBuffer threads
  ort.env.wasm.proxy = false;

  const file = config.kind === 'prototype' ? 'embedder.onnx.gz' : 'classifier.onnx.gz';
  const bytes = await readModelBytes(await deps.fetchAsset(MODEL_DIR + file), (loaded, total) => {
    progress(total ? `Preparing emergency mode… ${Math.round((100 * loaded) / total)}%`
      : `Preparing emergency mode… ${(loaded / 1e6).toFixed(1)} MB`);
  });
  progress('Starting the on-device model…');
  const session: InferenceSession = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });

  let classifier: Classifier;
  if (config.kind === 'prototype') {
    const prototypes = await (await deps.fetchAsset(`${MODEL_DIR}prototypes.json`)).json() as PrototypeData;
    classifier = createModelClassifier(config, {
      prototypes,
      embeddingProvider: { async embed(text) {
        const out = await session.run(feeds(ort, tokenizer, text));
        return out.embedding.data as Float32Array;
      } },
    });
  } else {
    const logitProvider: LogitProvider = { async predict(text): Promise<TriageLogits> {
      const out = await session.run(feeds(ort, tokenizer, text));
      const f = (name: string) => out[name].data as Float32Array;
      return { priority: f('priority'), hazard: f('hazard'), status: f('status'), medical: f('medical'),
        thirdParty: f('third_party') };
    } };
    classifier = createModelClassifier(config, { logitProvider });
  }
  progress('Checking the on-device model…');
  await classifier.classify('A person needs assistance.');
  return { classifier, config, downloadBytes: bytes.byteLength, loadMs: performance.now() - started };
}
