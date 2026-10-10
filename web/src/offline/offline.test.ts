// @vitest-environment node
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, openSync, ftruncateSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { MAX_PRECACHE_BYTES, PRECACHE_PATTERNS, PRECACHE_IGNORES } from './config';
import { isInventory, localAssetUrl, verifyCachedInventory, type OfflineInventory } from './assets';
const inventory:OfflineInventory={version:1,shell:['index.html','assets/app.js','assets/app.css','assets/inter.woff2'],model:['model/embedder.onnx.gz','model/tokenizer.json'],wasm:['ort/runtime.wasm'],missingInference:[]};
it('requires every shell, model, tokenizer, and WASM asset in Cache Storage',async()=>{
  expect(await verifyCachedInventory(inventory,async()=>({}),path=>path)).toBe(true);
  for(const missing of [...inventory.shell,...inventory.model,...inventory.wasm,'offline-assets.json']) {
    expect(await verifyCachedInventory(inventory,async path=>path===missing?undefined:{},path=>path)).toBe(false);
  }
  expect(await verifyCachedInventory({...inventory,shell:['index.html']},async()=>({}),path=>path)).toBe(false);
});
it('builds same-origin model/WASM URLs under a hosting subpath',()=>{
  expect(localAssetUrl('model/tokenizer.json','/civicmesh-sos/','https://demo.example')).toBe('https://demo.example/civicmesh-sos/model/tokenizer.json');
  expect(localAssetUrl('ort/runtime.wasm','/','https://demo.example')).toBe('https://demo.example/ort/runtime.wasm');
});
it.each(['https://remote.example/model','//cdn.example/font','../model.json','model/../config.json','model.json?q=remote','model\\file','model//config'])('rejects non-local asset path %s',path=>{
  expect(()=>localAssetUrl(path,'/','https://demo.example')).toThrow();
});
it('rejects invalid inventory and an external base URL',()=>{
  expect(isInventory(inventory)).toBe(true);expect(isInventory({...inventory,model:['https://example/model']})).toBe(false);
  expect(isInventory({...inventory,wasm:undefined})).toBe(false);
  expect(()=>localAssetUrl('model/model.json','https://cdn.example/','https://demo.example')).toThrow();
});
it('Workbox includes a 40 MiB model, tokenizer, local WASM and font, and warns above the ceiling',async()=>{
  const require=createRequire(import.meta.url);
  // Use the same locked Workbox implementation that vite-plugin-pwa actually uses.
  const workboxRequire=createRequire(require.resolve('vite-plugin-pwa'));
  const {getManifest}=workboxRequire('workbox-build') as {getManifest(options:Record<string,unknown>):Promise<{manifestEntries:{url:string}[];warnings:string[]}>};
  const root=mkdtempSync(join(tmpdir(),'civicmesh-precache-'));
  try {
    mkdirSync(join(root,'model'));mkdirSync(join(root,'ort'));
    writeFileSync(join(root,'index.html'),'test shell');writeFileSync(join(root,'inter.woff2'),'test font');
    writeFileSync(join(root,'model/tokenizer.json'),'{}');writeFileSync(join(root,'ort/runtime.wasm'),'test WASM');
    const model=openSync(join(root,'model/embedder.onnx.gz'),'w');ftruncateSync(model,MAX_PRECACHE_BYTES);closeSync(model);
    const tooLarge=openSync(join(root,'model/too-large.gz'),'w');ftruncateSync(tooLarge,MAX_PRECACHE_BYTES+1);closeSync(tooLarge);
    const result=await getManifest({globDirectory:root,globPatterns:PRECACHE_PATTERNS,globIgnores:PRECACHE_IGNORES,maximumFileSizeToCacheInBytes:MAX_PRECACHE_BYTES});
    expect(MAX_PRECACHE_BYTES).toBeGreaterThanOrEqual(40*1024*1024);
    const urls=result.manifestEntries.map(entry=>entry.url);
    expect(urls).toEqual(expect.arrayContaining(['index.html','inter.woff2','model/embedder.onnx.gz','model/tokenizer.json','ort/runtime.wasm']));
    expect(urls).not.toContain('model/too-large.gz');expect(result.warnings.some(w=>w.includes('too-large.gz'))).toBe(true);
  } finally {rmSync(root,{recursive:true,force:true});}
},15000);
