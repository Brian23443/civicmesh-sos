// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LocationConfidenceType } from '../protocol/enums';
import { resolveHeadcount, resolveMedical, resolveLocation } from './index';

interface ParityRow {
  text: string;
  headcount: [number, number];
  medical_mask: number;
  location: { type: keyof typeof LocationConfidenceType | number; text: string | null; flags: number };
}
const fixturePath = fileURLToPath(new URL('../../../tests/fixtures/parity_sentences.jsonl', import.meta.url));
const present = existsSync(fixturePath);
if (!present && process.env.REQUIRE_RESOLVER_PARITY === '1') {
  throw new Error(`Missing T1 resolver parity fixture: ${fixturePath}. Supply the 50 Python-reference rows; do not generate JS-derived expectations.`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 15;
}
function validate(value: unknown, line: number): asserts value is ParityRow {
  if (!isRecord(value) || typeof value.text !== 'string' || !value.text.trim()
    || !Array.isArray(value.headcount) || value.headcount.length !== 2 || !value.headcount.every(isCount)
    || typeof value.medical_mask !== 'number' || !Number.isInteger(value.medical_mask)
    || value.medical_mask < 0 || value.medical_mask > 255 || !isRecord(value.location)) {
    throw new Error(`Invalid K5 resolver fixture at line ${line}`);
  }
  const location = value.location;
  const validType = typeof location.type === 'string'
    ? Object.hasOwn(LocationConfidenceType, location.type)
    : typeof location.type === 'number' && Number.isInteger(location.type) && location.type >= 0 && location.type <= 3;
  if (!validType || !(location.text === null || typeof location.text === 'string')
    || typeof location.flags !== 'number' || !Number.isInteger(location.flags)
    || location.flags < 0 || location.flags > 0x1fff) {
    throw new Error(`Invalid K5 location fixture at line ${line}`);
  }
}
function loadReferenceRows(path: string): ParityRow[] {
  const rows: ParityRow[] = [];
  readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new Error(`Invalid JSON at K5 fixture line ${index + 1}`); }
    validate(value, index + 1); rows.push(value);
  });
  return rows;
}
function checkRows(rows: ParityRow[]) {
  it('contains exactly 50 sentences', () => { expect(rows).toHaveLength(50); });
  rows.forEach((row, index) => {
    describe(`sentence ${index + 1}: ${row.text}`, () => {
      it('matches expected headcounts', () => {
        const result = resolveHeadcount(row.text);
        expect([result.adults, result.children]).toEqual(row.headcount);
      });
      it('matches expected medical mask', () => { expect(resolveMedical(row.text)).toBe(row.medical_mask); });
      it('matches expected location type, text, and flags', () => {
        const result = resolveLocation(row.text);
        const expectedType = typeof row.location.type === 'string' ? LocationConfidenceType[row.location.type] : row.location.type;
        expect(result).toEqual({ ...row.location, type: expectedType });
      });
    });
  });
}

describe('Hand-authored mock resolver checks — NOT Python parity', () => {
  const mockPath = fileURLToPath(new URL('./fixtures/mock_sentences.json', import.meta.url));
  const values: unknown = JSON.parse(readFileSync(mockPath, 'utf8'));
  if (!Array.isArray(values)) throw new Error('Mock fixtures must be an array');
  const rows: ParityRow[] = [];
  values.forEach((value, index) => { validate(value, index + 1); rows.push(value); });
  checkRows(rows);
});

describe('T1 K5 resolver parity', () => {
  if (present) checkRows(loadReferenceRows(fixturePath));
  else it.skip('requires the missing T1 Python reference fixture', () => {});
});
