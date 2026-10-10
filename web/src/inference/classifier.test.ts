import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClassifier, decodeStage1, MockClassifier, Stage1Classifier } from './classifier';
import { HazardClass, RescueStatus, TriagePriority } from '../protocol/enums';
import type { Classifier, TriageResult, PrototypeData, PriorityLabel, HazardPrototypeLabel, StatusPrototypeLabel } from './types';

function basis(index: number): number[] { const v = Array(384).fill(0); v[index] = 1; return v; }
function prototypes(): PrototypeData {
  const field = <L extends string>(labels: L[], offset: number): Record<L, number[]> =>
    Object.fromEntries(labels.map((label, i) => [label, basis(offset + i)])) as Record<L, number[]>;
  return { dim:384,
    priority:field(Object.keys(TriagePriority) as PriorityLabel[],0),
    hazard:field(Object.keys(HazardClass).filter(label => label !== 'OTHER') as HazardPrototypeLabel[],4),
    status:field(Object.keys(RescueStatus).filter(label => label !== 'UNKNOWN') as StatusPrototypeLabel[],19),
  };
}
function assertK4(result: TriageResult) {
  expect(Object.keys(result).sort()).toEqual(['hazard','medicalProbs','priority','scores','status','thirdPartyProb']);
  expect(result.scores.priority).toHaveLength(4); expect(result.scores.hazard).toHaveLength(16);
  expect(result.scores.status).toHaveLength(4); expect(result.scores.hazard[15]).toBeNull();
  expect(result.scores.status[3]).toBeNull(); expect(result.medicalProbs).toBeNull(); expect(result.thirdPartyProb).toBeNull();
}
afterEach(() => vi.useRealTimers());

describe('development mock', () => {
  it('defaults to mock and returns the K4 contract', async () => {
    const classifier = createClassifier({ kind:'mock', delayMs:0 });
    expect(classifier.kind).toBe('mock');
    const result = await classifier.classify('Flooding in a stairwell; three people trapped.');
    expect(result).toMatchObject({ priority:2, hazard:1, status:2 }); assertK4(result);
  });
  it('waits 300 ms by default, without reporting model latency', async () => {
    vi.useFakeTimers(); const done = vi.fn();
    const task = createClassifier().classify('hello').then(done);
    await vi.advanceTimersByTimeAsync(299); expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await task; expect(done).toHaveBeenCalledOnce();
  });
  it('keeps repeated results deterministic and independently mutable', async () => {
    const c = new MockClassifier({ delayMs:0 });
    const a = await c.classify('safe inside'); const b = await c.classify('safe inside');
    expect(a).toEqual(b); a.scores.priority[0] = -100; expect(b.scores.priority[0]).toBe(1);
    expect(b).toMatchObject({ priority:0, hazard:0, status:0 });
  });
  it.each([
    ['Smoke outside; stuck',2,2,2], ['collapsed roof; exposed',1,3,1],
    ['chest pain',2,7,3], ['insulin needed',1,7,3], ['deceased',3,0,3], ['',0,0,3],
  ])('mock output for %s', async (text,priority,hazard,status) => {
    const result = await new MockClassifier({ delayMs:0 }).classify(text);
    expect(result).toMatchObject({ priority,hazard,status }); assertK4(result);
  });
  it.each([-1,NaN,Infinity])('rejects invalid delay %s', delayMs => {
    expect(() => new MockClassifier({ delayMs })).toThrow();
  });
});

describe('Stage 1 decoding without a model runtime', () => {
  it('decodes dot products in enum order rather than object insertion order', () => {
    const p = prototypes(); p.priority = Object.fromEntries(Object.entries(p.priority).reverse()) as typeof p.priority;
    const embedding = Array(384).fill(0); for (const i of [2,5,21]) embedding[i] = 1 / Math.sqrt(3);
    const result = decodeStage1(embedding,p);
    expect(result).toMatchObject({ priority:2, hazard:1, status:2 }); assertK4(result);
    expect(result.scores.priority[2]).toBeCloseTo(1 / Math.sqrt(3));
  });
  it('supports normalized typed arrays and returns UNKNOWN below the margin', () => {
    const result = decodeStage1(new Float32Array(basis(2)),prototypes());
    expect(result).toMatchObject({ priority:2, hazard:0, status:3 });
    expect(result.scores.status).toEqual([0,0,0,null]);
  });
  it('uses strict less-than at the status margin and stable ties', () => {
    const embedding = Array(384).fill(0); embedding[19]=0.25; embedding[20]=0.125;
    embedding[0]=Math.sqrt(1-0.25**2-0.125**2);
    expect(decodeStage1(embedding,prototypes(),0.125).status).toBe(0);
    expect(decodeStage1(embedding,prototypes(),0.126).status).toBe(3);
    expect(decodeStage1(basis(2),prototypes(),0).status).toBe(0);
  });
  it('selects the least negative score rather than assuming scores are positive', () => {
    const p = prototypes(); p.priority.MINOR=basis(0); p.priority.DELAYED=basis(0);
    p.priority.IMMEDIATE=basis(1); p.priority.DECEASED=basis(0);
    const e=Array(384).fill(0); e[0]=-Math.sqrt(0.75); e[1]=-0.5;
    expect(decodeStage1(e,p).priority).toBe(2);
  });
  it('passes text through the injected provider and snapshots prototype inputs', async () => {
    const p = prototypes(); const embed = vi.fn(async () => basis(2));
    const classifier = createClassifier({ kind:'prototype', embeddingProvider:{embed}, prototypes:p });
    (p.priority.IMMEDIATE as number[])[2]=0;
    const result=await classifier.classify('independent test');
    expect(embed).toHaveBeenCalledWith('independent test'); expect(classifier.kind).toBe('prototype');
    expect(result.priority).toBe(2);
  });
  it('propagates embedding failure so callers can activate manual mode', async () => {
    const c = new Stage1Classifier({ prototypes:prototypes(), embeddingProvider:{embed:async () => { throw Error('embedding unavailable'); }} });
    await expect(c.classify('test')).rejects.toThrow('embedding unavailable');
  });
  it.each([[],Array(384).fill(0),Array(384).fill(NaN),Array(384).fill(Infinity),Array(383).fill(1)])('rejects invalid embedding %#', embedding => {
    expect(() => decodeStage1(embedding,prototypes())).toThrow();
  });
  it.each([-1,NaN,Infinity,3])('rejects invalid margin %s', margin => {
    expect(() => decodeStage1(basis(0),prototypes(),margin)).toThrow();
  });
  it('rejects missing/extra prototypes and malformed vectors', () => {
    const missing=prototypes(); delete (missing.hazard as Partial<typeof missing.hazard>).FLOOD;
    expect(() => decodeStage1(basis(0),missing)).toThrow('labels');
    const extra=prototypes(); Object.assign(extra.hazard,{OTHER:basis(25)});
    expect(() => decodeStage1(basis(0),extra)).toThrow('labels');
    const malformed=prototypes(); malformed.status.TRAPPED=[1,0];
    expect(() => decodeStage1(basis(0),malformed)).toThrow('384');
  });
});


it('accepts a classifier implementing only the stable method', async () => {
  const mock = new MockClassifier({ delayMs: 0 });
  const classifier: Classifier = { classify: text => mock.classify(text) };
  const result: TriageResult = await classifier.classify('safe inside');
  assertK4(result);
  expect(result.status).toBe(RescueStatus.SHELTERED);
});
