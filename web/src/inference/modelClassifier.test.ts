import { expect, it, vi } from 'vitest';
import { FineTunedClassifier, createModelClassifier, parseModelConfig, Stage1Classifier } from './classifier';
import { HazardClass, RescueStatus, TriagePriority } from '../protocol/enums';
import type { PrototypeData } from './types';
import type { TriageLogits } from './fineTunedClassifier';
function logits():TriageLogits {
  return {priority:[0,1,2,0],hazard:Array.from({length:16},(_,i)=>i===15?4:0),status:[0,0,0,4],medical:[0,1000,-1000,0,0,0,0,0],thirdParty:[0]};
}
it('selects Stage1 from model.kind and uses its embedding provider',async()=>{
  const vector=Array(384).fill(0);vector[0]=1;
  const group=(labels:string[])=>Object.fromEntries(labels.map(label=>[label,vector]));
  const prototypes={dim:384,priority:group(Object.keys(TriagePriority)),hazard:group(Object.keys(HazardClass).filter(n=>n!=='OTHER')),status:group(Object.keys(RescueStatus).filter(n=>n!=='UNKNOWN'))} as unknown as PrototypeData;
  const embed=vi.fn(async()=>vector);
  const classifier=createModelClassifier({kind:'prototype'},{embeddingProvider:{embed},prototypes});
  expect(classifier).toBeInstanceOf(Stage1Classifier);await classifier.classify('sample');expect(embed).toHaveBeenCalledWith('sample');
});
it('selects FineTunedClassifier and returns all five decoded heads',async()=>{
  const predict=vi.fn(async()=>logits());
  const classifier=createModelClassifier({kind:'classifier',red_threshold:0.5},{logitProvider:{predict}});
  expect(classifier).toBeInstanceOf(FineTunedClassifier);
  const result=await classifier.classify('sample');
  expect(predict).toHaveBeenCalledWith('sample');
  expect(result).toMatchObject({priority:2,hazard:15,status:3,thirdPartyProb:0.5,medicalProbs:[0.5,1,0,0.5,0.5,0.5,0.5,0.5]});
  expect(result.scores.priority.reduce((a,b)=>a+b,0)).toBeCloseTo(1);
});
it('excludes Red when its probability is below the configured threshold',async()=>{
  const classifier=new FineTunedClassifier({redThreshold:0.99,logitProvider:{predict:async()=>logits()}});
  expect((await classifier.classify('sample')).priority).toBe(1);
});
it('includes Red at an exact threshold and handles large finite logits',async()=>{
  const values=logits();values.priority=[1000,1000,1000,1000];
  const classifier=new FineTunedClassifier({redThreshold:0.25,logitProvider:{predict:async()=>values}});
  expect((await classifier.classify('sample')).priority).toBe(2);
});
it.each(['priority','hazard','status','medical','thirdParty'] as const)('rejects invalid %s outputs',async key=>{
  const values=logits();values[key]=[NaN];
  const classifier=new FineTunedClassifier({redThreshold:0.5,logitProvider:{predict:async()=>values}});
  await expect(classifier.classify('sample')).rejects.toThrow();
});
it('propagates provider failure for manual fallback',async()=>{
  const classifier=new FineTunedClassifier({redThreshold:0.5,logitProvider:{predict:async()=>{throw Error('ONNX failed');}}});
  await expect(classifier.classify('sample')).rejects.toThrow('ONNX failed');
});
it.each([null,{}, {kind:'unknown'}, {kind:'classifier'}, {kind:'classifier',red_threshold:NaN}, {kind:'prototype',unknown_margin:-1}])('rejects malformed configuration %j',config=>{
  expect(()=>parseModelConfig(config)).toThrow();
});
it('requires branch-specific providers',()=>{
  expect(()=>createModelClassifier({kind:'prototype'},{})).toThrow('embeddings and prototypes');
  expect(()=>createModelClassifier({kind:'classifier',red_threshold:0.5},{})).toThrow('logit provider');
});
