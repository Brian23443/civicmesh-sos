"""Writes tests/fixtures/tokenizer_reference.json: Python token ids for the website's tokenizer test.

Both shipped models' Hugging Face tokenizers (bge-small for Stage 1, MiniLM for Stage 2) on every
resolver reference sentence plus edge cases (accents, CJK, emoji, control characters, very long
words, > 128 tokens).

    python3 -m stage1.make_tokenizer_reference
"""

from __future__ import annotations

import json
from pathlib import Path

from transformers import AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "fixtures" / "tokenizer_reference.json"
MODELS = {"bge": "BAAI/bge-small-en-v1.5", "minilm": "sentence-transformers/all-MiniLM-L6-v2"}
EDGE_CASES = [
    "", "   ", "HELP!!! 911?!", "Ça va? Niño, mamá — ¡auxilio!", "naïve café résumé", "火事です 助けて",
    "flood 🌊🌊 trapped 🙏", "tab\there\nnewline\r\nend", "zero​width nbsp", "ﬁre ﬂood (ligatures)",
    "a" * 120, "supercalifragilisticexpialidocious-ish", "x" * 99 + " ok", "don't won't can't it's",
    "e-mail me@example.com at 3:45pm, ok?", "COVID-19 #help @team $20 100% 50/50",
    " ".join(["water rising fast"] * 60),
]


def main() -> None:
    reference = json.loads((ROOT / "tests" / "fixtures" / "resolver_reference.json").read_text(encoding="utf-8"))
    texts = list(dict.fromkeys([r["text"] for r in reference] + EDGE_CASES))
    out = {"texts": texts}
    for key, name in MODELS.items():
        tok = AutoTokenizer.from_pretrained(name)
        out[key] = [tok(t, truncation=True, max_length=128)["input_ids"] for t in texts]
    OUT.write_text(json.dumps(out, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(texts)} texts × {len(MODELS)} tokenizers)")


if __name__ == "__main__":
    main()
