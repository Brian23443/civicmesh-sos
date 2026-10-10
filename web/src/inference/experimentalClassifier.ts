import { createModelClassifier, parseModelConfig } from './modelClassifier';
import type { Classifier, PrototypeData } from './types';
import { fetchLocalAsset, localAssetUrl } from '../offline/assets';

let loaded: Promise<Classifier> | undefined;
/** Explicit experimental alternative. Never fetches a remote model or CDN runtime. */
export function loadExperimentalClassifier(progress: (message: string) => void = () => {}): Promise<Classifier> {
  if (loaded) return loaded;
  loaded = (async () => {
    const model=parseModelConfig(await (await fetchLocalAsset('experimental/model.json')).json());
    if(model.kind!=='prototype') throw Error('Experimental MiniLM contains embedding weights only. A fine-tuned model needs its own local five-head ONNX provider.');
    progress('Loading local tokenizer and WASM…');
    const { env, pipeline } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = localAssetUrl('experimental/model.json').replace(/model\.json$/, '') ;
    env.useBrowserCache = false; // The production service worker owns the complete asset cache.
    const wasm = env.backends.onnx.wasm;
    if (!wasm) throw Error('WASM backend unavailable');
    wasm.wasmPaths = localAssetUrl('ort/ort-wasm-simd-threaded.wasm').replace(/ort-wasm-simd-threaded\.wasm$/, '');
    wasm.numThreads = 1;
    wasm.proxy = false;
    const extractor = await pipeline('feature-extraction', 'minilm', {
      device: 'wasm', dtype: 'q8', local_files_only: true,
      progress_callback: event => {
        if ('progress' in event && typeof event.progress === 'number') progress(`Loading local model… ${Math.round(event.progress)}%`);
      },
    });
    try {
      const prototypes = await (await fetchLocalAsset('experimental/prototypes.json')).json() as PrototypeData;
      const classifier = createModelClassifier(model, {
        prototypes,
        embeddingProvider: { async embed(text) {
          const result = await extractor(text, { pooling: 'mean', normalize: true });
          return result.data as Float32Array;
        } },
      });
      progress('Checking local inference…');
      await classifier.classify('A person needs assistance.');
      return classifier;
    } catch (error) { await extractor.dispose(); throw error; }
  })().catch(error => { loaded = undefined; throw error; });
  return loaded;
}
