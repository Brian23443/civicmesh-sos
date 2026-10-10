"""Writes tests/fixtures/resolver_reference.json: Python resolver output on every sentence we have.

The website's TypeScript resolvers (web/src/resolvers/) are a port of src/models/resolvers.py;
web/src/resolvers/reference.test.ts requires identical output on every sentence here:
the 50 K5 parity sentences, Track 1's resolver test sentences, and the website's own test sentences.

    python3 -m stage1.make_js_reference
"""

from __future__ import annotations

import difflib
import json
import re
from pathlib import Path

from src.models.resolvers import resolve_headcount, resolve_location, resolve_medical, resolve_status
from stage1.make_fixtures import SENTENCES
from training.common import load_benchmark

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "fixtures" / "resolver_reference.json"
WEB_TEST_FILES = [ROOT / "web" / "src" / "resolvers" / "resolvers.test.ts"]
WEB_SENTENCE_FILES = [ROOT / "web" / "src" / "resolvers" / "fixtures" / "mock_sentences.json"]


def python_test_sentences() -> list[str]:
    from tests import test_resolvers as t  # noqa: PLC0415

    return ([s for s, _ in t.HEADCOUNT_CASES] + [s for s, _ in t.MEDICAL_CASES]
            + [s for s, _, _ in t.LOCATION_CASES] + [s for s, _ in t.STATUS_CASES])


def web_test_sentences() -> list[str]:
    out: list[str] = []
    for path in WEB_TEST_FILES:
        if path.exists():  # first string of each it.each row: ['text', ...] or ["text", ...]
            src = path.read_text(encoding="utf-8")
            out += [m.group(2).encode().decode("unicode_escape").encode("latin-1").decode("utf-8")
                    for m in re.finditer(r"\[\s*(['\"])((?:\\.|(?!\1).)*)\1\s*,", src)]
    for path in WEB_SENTENCE_FILES:
        if path.exists():
            out += [row["text"] for row in json.loads(path.read_text(encoding="utf-8"))]
    return out


def main() -> None:
    texts = list(dict.fromkeys(SENTENCES + python_test_sentences() + web_test_sentences()))
    test_set = [r["text"].lower() for r in load_benchmark()]
    rows = []
    for text in texts:
        if test_set and max(difflib.SequenceMatcher(None, text.lower(), m).ratio() for m in test_set) >= 0.55:
            continue  # never carry anything resembling Appendix A
        adults, children = resolve_headcount(text)
        loc_type, loc_text, flags = resolve_location(text)
        status = resolve_status(text)
        rows.append({"text": text, "adults": adults, "children": children, "medical": int(resolve_medical(text)),
                     "location": {"type": int(loc_type), "text": loc_text, "flags": int(flags)},
                     "status": None if status is None else int(status)})
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(rows)} sentences)")


if __name__ == "__main__":
    main()
