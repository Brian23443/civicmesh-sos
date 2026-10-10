// @vitest-environment node
/**
 * The TypeScript resolvers must reproduce src/models/resolvers.py exactly. The expectations are
 * Python's output (python3 -m stage1.make_js_reference) — never JS-derived.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveHeadcount, resolveLocation, resolveMedical, resolveStatus } from './index';

interface ReferenceRow {
  text: string; adults: number; children: number; medical: number;
  location: { type: number; text: string | null; flags: number }; status: number | null;
}
const path = fileURLToPath(new URL('../../../tests/fixtures/resolver_reference.json', import.meta.url));
const rows = JSON.parse(readFileSync(path, 'utf8')) as ReferenceRow[];

describe('resolvers match the Python reference', () => {
  it('has the full reference set', () => expect(rows.length).toBeGreaterThanOrEqual(200));
  it.each(rows.map((r, i) => [i, r.text, r] as const))('#%i %s', (_i, text, r) => {
    expect(resolveHeadcount(text)).toEqual({ adults: r.adults, children: r.children });
    expect(resolveMedical(text)).toBe(r.medical);
    expect(resolveLocation(text)).toEqual(r.location);
    expect(resolveStatus(text)).toBe(r.status);
  });
});
