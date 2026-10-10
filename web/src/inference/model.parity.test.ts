// @vitest-environment node
/**
 * End-to-end parity with Python on the real shipped model: loadLocalModel (same code the app
 * uses) reads web/public/model/, tokenizes, runs onnxruntime-web, decodes and finalizes. Each of
 * the 50 K5 sentences must match Python's INT8 result (tests/fixtures/parity_sentences.jsonl):
 * decoded fields ≥ 98% (same graph → expected 100%) and the full confirmation line.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { HazardClass, RescueStatus } from '../protocol/enums';
import { resolveReport } from '../resolvers';
import { finalizeReport, type FinalFields } from './finalize';
import { loadLocalModel, type LoadedModel } from './loadModel';

const web = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(resolve(web, '../tests/fixtures/parity_sentences.jsonl'), 'utf8')
  .trim().split('\n').map(line => JSON.parse(line) as {
    text: string; stage1_summary?: string;
    stage1?: { priority: number; hazard: number; status: number;
      scores: { priority: (number | null)[]; hazard: (number | null)[]; status: (number | null)[] } };
  });
const modelKind = JSON.parse(readFileSync(resolve(web, 'public/model/model.json'), 'utf8')).kind as string;

/** Python's schema.summary_line. */
const COLORS = ['Green', 'Yellow', 'Red', 'Black'];
const HAZARDS = Object.keys(HazardClass);
const STATUSES = Object.keys(RescueStatus).map(s => s[0] + s.slice(1).toLowerCase());
const MEDICAL = ['INSULIN', 'OXYGEN', 'BLEEDING', 'HYPOTHERMIA', 'MOBILITY_IMPAIRED', 'CARDIAC', 'PREGNANCY_INFANT', 'BURNS'];
export function summaryLine(f: FinalFields): string {
  const people = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  let who = people(f.adults, 'adult', 'adults');
  if (f.children) who += ` + ${people(f.children, 'child', 'children')}`;
  const parts = [COLORS[f.priority], HAZARDS[f.hazard], STATUSES[f.status], who];
  const meds = MEDICAL.filter((_, bit) => f.medicalFlags & (1 << bit));
  if (meds.length) parts.push(meds.join(', '));
  return parts.join(' · ');
}

const fromDisk = async (path: string) => new Response(readFileSync(resolve(web, 'public', path)));

describe.runIf(modelKind === 'prototype')('Stage 1 model in the browser runtime matches Python', () => {
  let model: LoadedModel;
  beforeAll(async () => {
    model = await loadLocalModel(() => {}, {
      fetchAsset: fromDisk,
      ort: () => import('onnxruntime-web'),
      wasmPaths: resolve(web, 'node_modules/onnxruntime-web/dist') + '/',
    });
  }, 120_000);

  it('decoded fields match Python INT8 on ≥ 98% of fields', async () => {
    let same = 0;
    for (const row of fixture) {
      const r = await model.classifier.classify(row.text);
      same += Number(r.priority === row.stage1!.priority) + Number(r.hazard === row.stage1!.hazard)
        + Number(r.status === row.stage1!.status);
    }
    expect(same / (fixture.length * 3)).toBeGreaterThanOrEqual(0.98);
  }, 120_000);

  /** Python's top-two gap for a head: below NEAR_TIE, native and WASM kernels may legitimately disagree. */
  const NEAR_TIE = 0.002;
  const gap = (scores: (number | null)[]) => {
    const s = scores.filter((x): x is number => x !== null).sort((a, b) => b - a);
    return s[0] - s[1];
  };

  it.each(fixture.map((row, i) => [i, row.text, row] as const))('summary #%i %s', async (_i, text, row) => {
    const r = { ...(await model.classifier.classify(text)) };
    // A model decision may differ only on a near-tie; then compare everything else with Python's decision.
    for (const head of ['priority', 'hazard', 'status'] as const) {
      if (r[head] !== row.stage1![head]) {
        expect(gap(row.stage1!.scores[head]), `${head} differs without a near-tie`).toBeLessThan(NEAR_TIE);
        (r as unknown as Record<string, number>)[head] = row.stage1![head];
      }
    }
    expect(summaryLine(finalizeReport(r, resolveReport(text), model.classifier.settings))).toBe(row.stage1_summary);
  });

  it('the §13.5 demo sentence', async () => {
    const text = 'Water is rising fast, my mother needs insulin, 2 of us trapped in attic';
    const r = await model.classifier.classify(text);
    expect(summaryLine(finalizeReport(r, resolveReport(text), model.classifier.settings)))
      .toBe('Red · FLOOD · Trapped · 2 adults · INSULIN');
  });
});
