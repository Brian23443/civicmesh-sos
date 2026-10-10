/**
 * Shared helpers for the §5.4 resolvers — a line-by-line port of src/models/resolvers.py.
 * Python is the single source of truth; resolvers.reference.test.ts checks this port against
 * Python's output on every sentence we have (fixtures/python_reference.json).
 *
 * Portability rules (mirroring the Python file):
 * - Case-insensitive, no `u` flag (identity escapes like `\ ` must stay legal).
 * - Word edges use explicit lookarounds over Latin-1 letters, never `\b`.
 * - Text is lowercased and curly apostrophes become "'" before matching.
 */

// Letters (incl. Latin-1 accented), digits, underscore — same class as Python's _WORD_CHARS.
const WORD_CHARS = 'A-Za-z0-9_\\u00C0-\\u00FF';
export const WB_START = `(?<![${WORD_CHARS}])`;
export const WB_END = `(?![${WORD_CHARS}])`;

/** Alternation that must end at a word edge: (?:a|b|c)WB_END */
export const alt = (alternatives: readonly string[]) => `(?:${alternatives.join('|')})${WB_END}`;
/** Whole-word alternation: WB_START(?:a|b|c)WB_END */
export const words = (alternatives: readonly string[]) => WB_START + alt(alternatives);

/** Python 3.7+ re.escape: escapes only ()[]{}?*+-|^$\.&~# and whitespace (lengths drive longestFirst). */
export function reEscape(text: string): string {
  return text.replace(/[()[\]{}?*+\-|^$\\.&~# \t\n\r\v\f]/g, ch => `\\${ch}`);
}

/** Python's `sorted(..., key=len, reverse=True)` on escaped strings (stable for ties). */
export function longestFirst(items: readonly string[]): string[] {
  return items.map(reEscape).map((s, i) => [s, i] as const)
    .sort((a, b) => b[0].length - a[0].length || a[1] - b[1]).map(([s]) => s);
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/’/g, "'").replace(/‘/g, "'");
}

/** re.compile(pattern, re.IGNORECASE); `g` for finditer, `d` for group offsets (m.start(2)). */
export const rx = (pattern: string) => new RegExp(pattern, 'i');
export const rxAll = (pattern: string) => new RegExp(pattern, 'gid');

export function* finditer(regex: RegExp, text: string): Generator<RegExpExecArray> {
  const r = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    yield m;
    if (m[0].length === 0) r.lastIndex++;
  }
}

export const clamp15 = (n: number) => Math.max(0, Math.min(15, n));

// --- negation guard (shared by medical and status) --------------------------------

const NEGATION_RX = rx(words(['no', 'not', 'zero', 'without', "isn't", 'isnt', "aren't", 'arent', 'nobody',
  'none', 'never', 'nadie', 'sin']) + '[^.!?;,]{0,25}$');

/** A negation word shortly before the match, in the same clause ("no bleeding", "not burned"). */
export function negated(t: string, start: number): boolean {
  return NEGATION_RX.test(t.slice(Math.max(0, start - 30), start));
}
