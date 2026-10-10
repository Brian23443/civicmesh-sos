// @vitest-environment node
/** WordPiece tokenizer vs Python's Hugging Face tokenizers (python3 -m stage1.make_tokenizer_reference). */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WordPieceTokenizer } from './tokenizer';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const reference = JSON.parse(readFileSync(here('../../../tests/fixtures/tokenizer_reference.json'), 'utf8')) as
  { texts: string[]; bge: number[][]; minilm: number[][] };
const TOKENIZERS = {
  bge: here('../../public/model/tokenizer.json'),                      // Stage 1 (main)
  minilm: process.env.MINILM_TOKENIZER ?? here('../../../models/triage-minilm/tokenizer.json'),  // Stage 2
};

describe.each(Object.entries(TOKENIZERS))('%s tokenizer matches Python', (key, path) => {
  const available = existsSync(path);
  it.runIf(available).each(reference.texts.map((t, i) => [i, t] as const))('#%i %j', (i, text) => {
    const tok = new WordPieceTokenizer(JSON.parse(readFileSync(path, 'utf8')));
    expect(tok.encode(text).inputIds).toEqual(reference[key as 'bge' | 'minilm'][i]);
  });
});
