// @vitest-environment node
import { afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import { Stage1Classifier } from './stage1Classifier';
import type { PrototypeData } from './types';
import { createHash } from 'node:crypto';

const root=resolve(import.meta.dirname,'../..');
const metadata=JSON.parse(readFileSync(resolve(root,'public/experimental/model.json'),'utf8'));
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=resolve(root,'public/experimental')+'/';env.useFSCache=false;
const extractorPromise=pipeline('feature-extraction','minilm',{dtype:'q8',device:'cpu',local_files_only:true});
afterAll(async()=>{await (await extractorPromise).dispose();});
it('matches the recorded immutable model/tokenizer checksums',()=>{
  for(const [file,hash] of Object.entries(metadata.hashes)){
    const bytes=readFileSync(resolve(root,'public/experimental/minilm',file));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
  }
});
it('runs real local embeddings through Stage1 and returns the wire-compatible result',async()=>{
  const extractor=await extractorPromise;
  const prototypes=JSON.parse(readFileSync(resolve(root,'public/experimental/prototypes.json'),'utf8')) as PrototypeData;
  const classifier=new Stage1Classifier({prototypes,embeddingProvider:{async embed(text){
    return (await extractor(text,{pooling:'mean',normalize:true})).data as Float32Array;
  }}});
  const message='The kitchen is filling with smoke and we cannot leave.';
  const a=await classifier.classify(message),b=await classifier.classify(message);
  expect(a).toEqual(b);
  expect(a.medicalProbs).toBeNull();expect(a.thirdPartyProb).toBeNull();
  expect(a.scores.priority).toHaveLength(4);expect(a.scores.hazard).toHaveLength(16);expect(a.scores.status).toHaveLength(4);
  for(const value of [...a.scores.priority,...a.scores.hazard,...a.scores.status].filter(n=>n!==null)) expect(Number.isFinite(value)).toBe(true);
  expect(a.priority).toBeGreaterThanOrEqual(0);expect(a.priority).toBeLessThanOrEqual(3);
  expect(a.hazard).toBeGreaterThanOrEqual(0);expect(a.hazard).toBeLessThanOrEqual(15);
},20000);
