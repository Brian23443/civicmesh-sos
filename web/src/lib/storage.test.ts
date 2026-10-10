import { describe, expect, it } from 'vitest';
import { createStorage } from './storage';
const isString = (v: unknown): v is string => typeof v === 'string';
describe('safe storage', () => {
  it('continues in memory when even accessing localStorage throws', () => {
    const s = createStorage(() => { throw new Error('blocked'); });
    expect(s.read('theme', 'dark', isString)).toBe('dark');
    expect(s.write('theme', 'light')).toBe(false);
    expect(s.read('theme', 'dark', isString)).toBe('light');
    expect(s.persistent).toBe(false); s.remove('theme');
    expect(s.read('theme', 'dark', isString)).toBe('dark');
  });
  it('rejects corrupt and invalid saved data', () => {
    const data = new Map([['bad', '{'], ['wrong', '42']]);
    const s = createStorage(() => ({ getItem: k => data.get(k) ?? null, setItem: (k,v) => { data.set(k,v); }, removeItem: k => { data.delete(k); } }));
    expect(s.read('bad', 'dark', isString)).toBe('dark');
    expect(s.read('wrong', 'dark', isString)).toBe('dark');
    s.write('theme', 'light'); expect(data.get('theme')).toBe('"light"');
  });
  it('does not resurrect a removed value when removal is blocked', () => {
    const s = createStorage(() => ({ getItem: () => '"old"', setItem: () => {}, removeItem: () => { throw Error('blocked'); } }));
    s.remove('key'); expect(s.read('key', 'fallback', isString)).toBe('fallback');
  });
});
