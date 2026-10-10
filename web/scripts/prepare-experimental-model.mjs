import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const revision='751bff37182d3f1213fa05d7196b954e230abad9';
const model=resolve(root,'public/experimental/minilm');
const files=['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt','onnx/model_quantized.onnx'];
const hashes={};
for(const file of files){
 const path=resolve(model,file); await mkdir(dirname(path),{recursive:true});
 let bytes; try { bytes=await readFile(path); } catch {
  console.log('Downloading',file);
  const response=await fetch(`https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${revision}/${file}`);
  if(!response.ok) throw Error(`Download failed: ${file}: ${response.status}`);
  bytes=Buffer.from(await response.arrayBuffer()); await writeFile(path,bytes);
 }
 hashes[file]=createHash('sha256').update(bytes).digest('hex');
}
const require=createRequire(import.meta.url);
const transformerRequire=createRequire(require.resolve('@huggingface/transformers'));
const ortDist=dirname(transformerRequire.resolve('onnxruntime-web'));
await mkdir(resolve(root,'public/ort'),{recursive:true});
for(const file of ['ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm']){
 await copyFile(resolve(ortDist,file),resolve(root,'public/ort',file));
}
const {env,pipeline}=await import('@huggingface/transformers');
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=resolve(root,'public/experimental')+'/';env.useFSCache=false;
const extractor=await pipeline('feature-extraction','minilm',{dtype:'q8',device:'cpu',local_files_only:true});
const seeds=JSON.parse(await readFile(resolve(root,'scripts/experimental-seeds.json'),'utf8'));
const prototypes={dim:384};
for(const [group,labels] of Object.entries(seeds)){
 prototypes[group]={};
 for(const [label,sentences] of Object.entries(labels)){
  const mean=new Array(384).fill(0);
  for(const sentence of sentences){
   const result=await extractor(sentence,{pooling:'mean',normalize:true});
   for(let i=0;i<384;i++) mean[i]+=result.data[i]/sentences.length;
  }
  const norm=Math.hypot(...mean);prototypes[group][label]=mean.map(n=>n/norm);
 }
}
await extractor.dispose();
await writeFile(resolve(root,'public/experimental/prototypes.json'),JSON.stringify(prototypes));
await writeFile(resolve(root,'public/experimental/model.json'),JSON.stringify({kind:'prototype',experimental:true,model:'Xenova/all-MiniLM-L6-v2',revision,dtype:'q8',pooling:'mean',normalize:true,unknown_margin:0.02,hashes},null,2)+'\n');
console.log('Prepared experimental MiniLM and matching prototypes. This is not T1 parity.');
