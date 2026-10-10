"""Tunes Stage 1's settings on the chatbot validation rows — NEVER on Appendix A.

- unknown_margin (§5.0): status is UNKNOWN when (top status similarity − second) < margin.
  Chosen to maximise status accuracy; ties go to the margin closest to the spec's 0.02.
- red_margin: predict IMMEDIATE when its score is within red_margin of the top score.
  Like Stage 2's red_threshold (§9): the most conservative (smallest) margin whose
  validation Red recall is >= 0.95.
- status_backstop: the status keyword backstop (resolvers.resolve_status) is switched on
  only if it raises validation status accuracy.

    python3 -m stage1.tune_stage1            # report + write web/public/model/model.json
    python3 -m stage1.tune_stage1 --dry-run  # report only
"""

from __future__ import annotations

import argparse
import json

import numpy as np

from src.models.prototype_classifier import DEFAULT_MODEL_DIR, PrototypeClassifier, onnx_embed_fn
from src.models.resolvers import resolve_status
from src.schema import RescueStatus, TriagePriority
from training.common import ARTIFACTS_DIR, RAW_PATH, priority_index, read_jsonl, status_index

START = 0.02
GRID = [round(x, 4) for x in np.arange(0.0, 0.1001, 0.0025)]
UNKNOWN = int(RescueStatus.UNKNOWN)
RED = int(TriagePriority.IMMEDIATE)
RED_GRID = [round(x, 4) for x in np.arange(0.0, 0.0501, 0.0025)]
RED_TARGET = 0.95


def tune_red(clf: PrototypeClassifier, embeddings: np.ndarray, gold: list[int]) -> tuple[float, list[dict]]:
    results = []
    for m in RED_GRID:
        pred = [clf.decode(e, red_margin=m)["priority"] for e in embeddings]
        tp = sum(p == RED and g == RED for p, g in zip(pred, gold))
        n_gold, n_pred = sum(g == RED for g in gold), sum(p == RED for p in pred)
        results.append({"red_margin": m, "red_recall": tp / n_gold, "red_precision": tp / n_pred if n_pred else None,
                        "priority_acc": sum(p == g for p, g in zip(pred, gold)) / len(gold)})
    ok = [r for r in results if r["red_recall"] >= RED_TARGET]
    best = ok[0]["red_margin"] if ok else RED_GRID[-1]
    return best, results


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

    # --- Red margin ---
    gold_p = [priority_index(r["triage_priority"]) for r in rows]
    red_margin, red_results = tune_red(clf, embeddings, gold_p)
    print("\n red_margin  Red recall  Red precision  priority acc")
    for r in red_results:
        mark = " ←" if r["red_margin"] == red_margin else ""
        print(f"  {r['red_margin']:.4f}    {fmt(r['red_recall'])}%      {fmt(r['red_precision'])}%       "
              f"{fmt(r['priority_acc'])}%{mark}")
    print(f"red_margin = {red_margin} (smallest with validation Red recall >= {RED_TARGET:.0%})")

    # --- status keyword backstop ---
    base = [clf.decode(e, unknown_margin=best["margin"])["status"] for e in embeddings]
    with_bs = [resolve_status(r["text"]) for r in rows]
    with_bs = [int(k) if k is not None else b for k, b in zip(with_bs, base)]
    acc_off = sum(p == g for p, g in zip(base, gold)) / len(gold)
    acc_on = sum(p == g for p, g in zip(with_bs, gold)) / len(gold)
    status_backstop = acc_on > acc_off
    print(f"\nstatus keyword backstop: status accuracy {100 * acc_off:.1f}% → {100 * acc_on:.1f}% "
          f"→ {'ON' if status_backstop else 'OFF'}")

    ARTIFACTS_DIR.mkdir(exist_ok=True)
    (ARTIFACTS_DIR / "stage1_tuning.json").write_text(json.dumps({
        "rows": len(rows), "backend": args.backend,
        "unknown_margin": {"best": best, "sweep": results},
        "red_margin": {"best": red_margin, "target_recall": RED_TARGET, "sweep": red_results},
        "status_backstop": {"enabled": status_backstop, "status_acc_off": acc_off, "status_acc_on": acc_on},
    }, indent=2) + "\n")
    if not args.dry_run:
        path = DEFAULT_MODEL_DIR / "model.json"
        cfg = json.loads(path.read_text())
        cfg.update(unknown_margin=best["margin"], red_margin=red_margin, status_backstop=status_backstop)
        path.write_text(json.dumps(cfg, indent=2) + "\n")
        print(f"wrote unknown_margin={best['margin']}, red_margin={red_margin}, "
              f"status_backstop={status_backstop} to {path}")


if __name__ == "__main__":
    main()
