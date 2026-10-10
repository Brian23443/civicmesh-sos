"""Writes tests/fixtures/parity_stage2.jsonl: Python Stage 2 (INT8, one message at a time) on the 50
K5 sentences — decoded heads, head scores and the full confirmation line — for the website's
classifier-path parity test (web/src/inference/model.parity.test.ts).

    python3 -m stage1.make_stage2_fixtures --model-dir models/triage-minilm
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from src.models.triage_classifier import FinetunedTriageExtractor
from stage1.make_fixtures import SENTENCES, check_not_from_test_set

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "fixtures" / "parity_stage2.jsonl"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--onnx", type=Path, default=ROOT / "web" / "public" / "model" / "classifier.onnx.gz")
    args = parser.parse_args()
    check_not_from_test_set()
    ext = FinetunedTriageExtractor(args.model_dir, onnx_path=args.onnx)
    with OUT.open("w", encoding="utf-8") as f:
        for text, r in zip(SENTENCES, ext.classify_many(SENTENCES)):
            row = {"text": text, "stage2": {k: r[k] for k in ("priority", "hazard", "status", "scores")},
                   "medical_probs": r["medicalProbs"], "third_party_prob": r["thirdPartyProb"],
                   "stage2_summary": ext.to_slots(text, r).summary(),
                   "third_party": ext.to_slots(text, r).is_third_party_report}
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"wrote {OUT} ({len(SENTENCES)} rows)")


if __name__ == "__main__":
    main()
