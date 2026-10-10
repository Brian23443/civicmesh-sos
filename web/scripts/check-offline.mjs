import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../dist');
function assert(condition,message){if(!condition) throw Error(message);}
const inventory=JSON.parse(readFileSync(resolve(root,'offline-assets.json'),'utf8'));
const worker=readFileSync(resolve(root,'sw.js'),'utf8');
const precached=new Set([...worker.matchAll(/url:"([^"]+)"/g)].map(match=>match[1]));
const assets=[...inventory.shell,...inventory.model,...inventory.wasm,'offline-assets.json','manifest.webmanifest'];
for(const path of assets){
  assert(!path.includes('..')&&!path.startsWith('/')&&!path.includes(':'),`Non-local asset: ${path}`);
  assert(existsSync(resolve(root,path)),`Missing build asset: ${path}`);
  assert(statSync(resolve(root,path)).size<=40*1024*1024,`Asset exceeds precache ceiling: ${path}`);
  assert(precached.has(path),`Asset not precached: ${path}`);
}
assert(inventory.shell.includes('index.html'),'App shell HTML is missing');
assert(inventory.shell.some(path=>path.endsWith('.woff2')),'Local Inter fonts are missing');
const html=readFileSync(resolve(root,'index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) assert(!/^(?:https?:)?\/\//.test(match[1]),`Remote runtime HTML dependency: ${match[1]}`);
for(const path of inventory.shell.filter(path=>path.endsWith('.css'))){
  const css=readFileSync(resolve(root,path),'utf8');
  assert(!/(?:url\(\s*["']?|@import\s*["'])(?:https?:)?\/\//i.test(css),`Remote CSS/font dependency: ${path}`);
}
if(process.argv.includes('--require-inference')) assert(inventory.missingInference.length===0,`Local inference assets are missing: ${inventory.missingInference.join(', ')}`);
if(process.argv.includes('--require-experimental')) {
  for(const path of ['experimental/model.json','experimental/prototypes.json','experimental/minilm/config.json','experimental/minilm/tokenizer.json','experimental/minilm/tokenizer_config.json','experimental/minilm/onnx/model_quantized.onnx','ort/ort-wasm-simd-threaded.jsep.mjs','ort/ort-wasm-simd-threaded.jsep.wasm']) assert(precached.has(path),`Experimental asset not precached: ${path}`);
  console.log('Experimental MiniLM model, tokenizer, prototypes and WASM are present and precached.');
}
console.log(`Offline build audit passed: ${assets.length} local assets are present and precached; local fonts verified.`);
console.log(inventory.missingInference.length ? `T1 inference assets unavailable: ${inventory.missingInference.join(', ')}` : 'Local inference assets present (runtime execution still requires separate verification).');
