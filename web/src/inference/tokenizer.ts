/**
 * BERT WordPiece tokenizer built from a Hugging Face tokenizer.json (MASTER_PROMPT §12.1 fallback).
 *
 * Mirrors the Rust `tokenizers` pipeline used in Python for both shipped models (bge-small,
 * MiniLM): BertNormalizer(clean_text, handle_chinese_chars, strip_accents=lowercase, lowercase)
 * → BertPreTokenizer (whitespace + punctuation) → WordPiece (greedy longest match, "##",
 * max 100 chars/word) → [CLS] … [SEP], truncated to max_length. Token ids are checked against
 * Python's on every reference sentence (tokenizer.test.ts) — no network, no transformers.js.
 */

interface TokenizerJson {
  normalizer?: { type?: string; lowercase?: boolean; strip_accents?: boolean | null; clean_text?: boolean;
    handle_chinese_chars?: boolean };
  model: { type?: string; vocab: Record<string, number>; unk_token?: string; continuing_subword_prefix?: string;
    max_input_chars_per_word?: number };
}

export interface Encoding { inputIds: number[]; attentionMask: number[] }

const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x4e00, 0x9fff], [0x3400, 0x4dbf], [0x20000, 0x2a6df], [0x2a700, 0x2b73f],
  [0x2b740, 0x2b81f], [0x2b820, 0x2ceaf], [0xf900, 0xfaff], [0x2f800, 0x2fa1f],
];
const isCjk = (cp: number) => CJK_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
const isWhitespace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || /\s/u.test(ch);
const isControl = (ch: string) => ch !== '\t' && ch !== '\n' && ch !== '\r' && /\p{C}/u.test(ch);
const isPunctuation = (ch: string) => /[!-/:-@[-`{-~]/.test(ch) || /\p{P}/u.test(ch);

export class WordPieceTokenizer {
  private readonly vocab: Map<string, number>;
  private readonly unk: string;
  private readonly prefix: string;
  private readonly maxChars: number;
  private readonly lowercase: boolean;
  private readonly stripAccents: boolean;
  private readonly cleanText: boolean;
  private readonly chineseChars: boolean;
  readonly clsId: number;
  readonly sepId: number;

  constructor(json: TokenizerJson, readonly maxLength = 128) {
    if (json.model?.type && json.model.type !== 'WordPiece') throw Error(`Unsupported tokenizer model: ${json.model.type}`);
    this.vocab = new Map(Object.entries(json.model.vocab));
    this.unk = json.model.unk_token ?? '[UNK]';
    this.prefix = json.model.continuing_subword_prefix ?? '##';
    this.maxChars = json.model.max_input_chars_per_word ?? 100;
    const n = json.normalizer ?? {};
    this.lowercase = n.lowercase ?? true;
    this.stripAccents = n.strip_accents ?? this.lowercase;  // HF: strip_accents defaults to lowercase
    this.cleanText = n.clean_text ?? true;
    this.chineseChars = n.handle_chinese_chars ?? true;
    const id = (token: string) => {
      const v = this.vocab.get(token);
      if (v === undefined) throw Error(`Tokenizer vocab is missing ${token}`);
      return v;
    };
    this.clsId = id('[CLS]'); this.sepId = id('[SEP]'); id(this.unk);
  }

  normalize(text: string): string {
    let out = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (this.cleanText) {
        if (cp === 0 || cp === 0xfffd || isControl(ch)) continue;
        if (isWhitespace(ch)) { out += ' '; continue; }
      }
      out += this.chineseChars && isCjk(cp) ? ` ${ch} ` : ch;
    }
    if (this.stripAccents) out = out.normalize('NFD').replace(/\p{Mn}/gu, '');
    if (this.lowercase) out = out.toLowerCase();
    return out;
  }

  preTokenize(text: string): string[] {
    const words: string[] = [];
    let current = '';
    for (const ch of text) {
      if (isWhitespace(ch)) { if (current) words.push(current); current = ''; }
      else if (isPunctuation(ch)) { if (current) words.push(current); words.push(ch); current = ''; }
      else current += ch;
    }
    if (current) words.push(current);
    return words;
  }

  wordPiece(word: string): number[] {
    const chars = Array.from(word);
    const unkId = this.vocab.get(this.unk)!;
    if (chars.length > this.maxChars) return [unkId];
    const ids: number[] = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let found: number | undefined;
      while (start < end) {
        let piece = chars.slice(start, end).join('');
        if (start > 0) piece = this.prefix + piece;
        found = this.vocab.get(piece);
        if (found !== undefined) break;
        end--;
      }
      if (found === undefined) return [unkId];
      ids.push(found);
      start = end;
    }
    return ids;
  }

  encode(text: string): Encoding {
    const pieces = this.preTokenize(this.normalize(text)).flatMap(w => this.wordPiece(w));
    const inputIds = [this.clsId, ...pieces.slice(0, this.maxLength - 2), this.sepId];
    return { inputIds, attentionMask: inputIds.map(() => 1) };
  }
}
