"""Tunes Stage 1's `unknown_margin` on the chatbot validation rows (MASTER_PROMPT §5.0).

Status is UNKNOWN when (top status similarity − second) < unknown_margin. The margin is
chosen to maximise status accuracy on the chatbot rows — NEVER on Appendix A.
Ties go to the margin closest to the spec's starting value (0.02).

    python3 -m stage1.tune_unknown_margin            # report + write model.json
    python3 -m stage1.tune_unknown_margin --dry-run  # report only
"""

from __future__ import annotations

import argparse
import json

import numpy as np

from src.models.prototype_classifier import DEFAULT_MODEL_DIR, PrototypeClassifier, onnx_embed_fn
from src.schema import RescueStatus
from training.common import ARTIFACTS_DIR, RAW_PATH, read_jsonl, status_index

START = 0.02
GRID = [round(x, 4) for x in np.arange(0.0, 0.1001, 0.0025)]
UNKNOWN = int(RescueStatus.UNKNOWN)


def sweep(clf: PrototypeClassifier, embeddings: np.ndarray, gold: list[int]) -> list[dict]:
    results = []
    for m in GRID:
        pred = [clf.decode(e, unknown_margin=m)["status"] for e in embeddings]
        tp = sum(p == UNKNOWN and g == UNKNOWN for p, g in zip(pred, gold))
        n_pred, n_gold = sum(p == UNKNOWN for p in pred), sum(g == UNKNOWN for g in gold)
        results.append({
            "margin": m,
            "status_acc": sum(p == g for p, g in zip(pred, gold)) / len(gold),
            "unknown_recall": tp / n_gold if n_gold else None,
            "unknown_precision": tp / n_pred if n_pred else None,
            "predicted_unknown": n_pred,
        })
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--backend", choices=["onnx", "torch"], default="onnx",
                        help="embed with the shipped INT8 graph (default) or PyTorch")
    args = parser.parse_args()

    rows = [r for r in read_jsonl(RAW_PATH) if r.get("writer") == "chatbot"]
    if not rows:
        raise SystemExit("no chatbot rows in data/synthetic/raw.jsonl — import them first")
    embed = onnx_embed_fn(DEFAULT_MODEL_DIR) if args.backend == "onnx" else None
    clf = PrototypeClassifier(DEFAULT_MODEL_DIR, embed_fn=embed)
    embeddings = clf.embed([r["text"] for r in rows])
    gold = [status_index(r["rescue_status"]) for r in rows]

    results = sweep(clf, embeddings, gold)
    best_acc = max(r["status_acc"] for r in results)
    best = min((r for r in results if r["status_acc"] == best_acc), key=lambda r: abs(r["margin"] - START))

    def fmt(x):
        return "  n/a" if x is None else f"{100 * x:5.1f}"

    print(f"{len(rows)} chatbot rows, {sum(g == UNKNOWN for g in gold)} gold Unknown ({args.backend} embeddings)")
    print(" margin  status acc  Unknown recall  Unknown precision  #pred Unknown")
    for r in results:
        mark = " ←" if r is best else (" (start)" if r["margin"] == START else "")
        print(f" {r['margin']:.4f}  {fmt(r['status_acc'])}%      {fmt(r['unknown_recall'])}%          "
              f"{fmt(r['unknown_precision'])}%            {r['predicted_unknown']:3d}{mark}")
    print(f"best unknown_margin = {best['margin']} (status accuracy {100 * best['status_acc']:.1f}%)")

    ARTIFACTS_DIR.mkdir(exist_ok=True)
    (ARTIFACTS_DIR / "unknown_margin_sweep.json").write_text(
        json.dumps({"rows": len(rows), "backend": args.backend, "best": best, "sweep": results}, indent=2) + "\n")
    if not args.dry_run:
        path = DEFAULT_MODEL_DIR / "model.json"
        cfg = json.loads(path.read_text())
        cfg["unknown_margin"] = best["margin"]
        path.write_text(json.dumps(cfg, indent=2) + "\n")
        print(f"wrote unknown_margin={best['margin']} to {path}")


if __name__ == "__main__":
    main()
