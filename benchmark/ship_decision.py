"""Stage 2 ship decision (MASTER_PROMPT §5.1, §5.0, §15).

1. Among the fine-tuned candidates (each exported with `training.export_onnx --stage 2`), pick the
   one with the higher Red recall on Appendix A, then the higher whole-summary accuracy, as long
   as classifier.onnx.gz is ≤ 30 MB (§5.1).
2. Ship it only if it BEATS the shipped Stage 1 model on Red recall AND whole-summary accuracy,
   on Appendix A AND on the chatbot validation rows (§15). Otherwise keep Stage 1.

Both sides are scored as they run in the browser: INT8 ONNX + the same decoding and resolvers.

    python3 -m benchmark.ship_decision --candidates models/triage-bge-small models/triage-minilm
    python3 -m benchmark.ship_decision --candidates models/triage-bge-small --apply   # on a phaseb/* branch
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

from benchmark.evaluate_dataset import compute, load_rows
from src.models.prototype_classifier import DEFAULT_MODEL_DIR, PrototypeClassifier, onnx_embed_fn
from src.models.triage_classifier import FinetunedTriageExtractor
from training.common import ARTIFACTS_DIR, BENCHMARK_PATH, RAW_PATH

SIZE_BUDGET_MB = 30
DATASETS = {"Appendix A (test)": (BENCHMARK_PATH, None), "chatbot validation": (RAW_PATH, "chatbot")}
STAGE2_FILES = ["classifier.onnx.gz", "model.json", "tokenizer.json", "tokenizer_config.json",
                "special_tokens_map.json", "vocab.txt"]
STAGE1_ONLY_FILES = ["embedder.onnx.gz", "prototypes.json"]


def score(model, datasets=DATASETS) -> dict[str, dict]:
    out = {}
    for name, (path, writer) in datasets.items():
        rows = load_rows(path, writer)
        m = compute(rows, model.extract_many([r["text"] for r in rows]))
        out[name] = {"red_recall": m["red_recall"], "red_precision": m["red_precision"],
                     "whole_summary_acc": m["whole_summary_acc"], "n": m["n"]}
    return out


def pct(x: float | None) -> str:
    return "n/a" if x is None else f"{100 * x:.1f}%"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--candidates", nargs="+", type=Path, required=True,
                        help="trained model dirs, each with web/classifier.onnx.gz from export_onnx --stage 2")
    parser.add_argument("--apply", action="store_true",
                        help="if Stage 2 wins, copy its files into web/public/model (phaseb/* branch only)")
    args = parser.parse_args()

    stage1_cfg = json.loads((DEFAULT_MODEL_DIR / "model.json").read_text())
    if stage1_cfg.get("kind") != "prototype":
        raise SystemExit("web/public/model is not the Stage 1 model; restore it from main before comparing")
    stage1 = score(PrototypeClassifier(DEFAULT_MODEL_DIR, embed_fn=onnx_embed_fn(DEFAULT_MODEL_DIR)))

    cands = []
    for d in args.candidates:
        gz = d / "web" / "classifier.onnx.gz"
        if not gz.exists():
            raise SystemExit(f"{gz} missing: run python3 -m training.export_onnx --stage 2 --model-dir {d}")
        size = gz.stat().st_size / 1e6
        report = json.loads((d / "web" / "export_report.json").read_text()) if (d / "web" / "export_report.json").exists() else {}
        cands.append({"dir": d, "size_mb": size, "parity": report.get("decoded_field_match"),
                      "scores": score(FinetunedTriageExtractor(d, onnx_path=gz))})

    test = "Appendix A (test)"
    eligible = [c for c in cands if c["size_mb"] <= SIZE_BUDGET_MB]
    winner = max(eligible, key=lambda c: (c["scores"][test]["red_recall"] or 0, c["scores"][test]["whole_summary_acc"]),
                 default=None)

    checks = []
    if winner:
        for ds in DATASETS:
            for metric in ("red_recall", "whole_summary_acc"):
                s1, s2 = stage1[ds][metric] or 0.0, winner["scores"][ds][metric] or 0.0
                checks.append({"dataset": ds, "metric": metric, "stage1": s1, "stage2": s2, "beats": s2 > s1})
    ship = bool(winner) and all(c["beats"] for c in checks)

    lines = ["# Stage 2 ship decision", "",
             "Rule (§15): ship Stage 2 only if it beats Stage 1 on Red recall **and** whole-summary accuracy, "
             "on Appendix A **and** the chatbot validation rows. Both sides scored as INT8 browser models.", "",
             "## Candidates (§5.1: higher Red recall on Appendix A, then whole-summary; ≤ 30 MB)", "",
             "| Model | gz MB | INT8 parity | " + " | ".join(f"{ds} Red recall | {ds} whole-summary" for ds in DATASETS) + " |",
             "|---|---|---|" + "---|---|" * len(DATASETS)]
    lines.append("| **Stage 1 (shipped)** | — | — | " + " | ".join(
        f"{pct(stage1[ds]['red_recall'])} | {pct(stage1[ds]['whole_summary_acc'])}" for ds in DATASETS) + " |")
    for c in cands:
        name = f"{c['dir'].name}{' ← winner' if c is winner else ''}"
        lines.append(f"| {name} | {c['size_mb']:.1f} | {pct(c['parity'])} | " + " | ".join(
            f"{pct(c['scores'][ds]['red_recall'])} | {pct(c['scores'][ds]['whole_summary_acc'])}" for ds in DATASETS) + " |")
    lines += ["", "## Decision", ""]
    if not winner:
        lines.append("No candidate fits the 30 MB budget → **keep Stage 1**.")
    else:
        for c in checks:
            lines.append(f"- {c['dataset']}, {c['metric']}: Stage 1 {pct(c['stage1'])} vs {winner['dir'].name} "
                         f"{pct(c['stage2'])} → {'beats ✓' if c['beats'] else 'does not beat ✗'}")
        lines += ["", f"**{'SHIP ' + winner['dir'].name if ship else 'KEEP STAGE 1'}**"]
        if not ship:
            lines.append("Say so on the slides: Stage 2 did not beat the zero-shot model on every required metric.")
    text = "\n".join(lines) + "\n"
    ARTIFACTS_DIR.mkdir(exist_ok=True)
    (ARTIFACTS_DIR / "ship_decision.md").write_text(text)
    print(text)

    if args.apply and ship:
        branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True).stdout.strip()
        if not branch.startswith("phaseb/"):
            raise SystemExit(f"--apply only on a phaseb/* branch (current: {branch}); §15: swap on a branch")
        src = winner["dir"] / "web"
        for name in STAGE2_FILES:
            if (src / name).exists():
                shutil.copy2(src / name, DEFAULT_MODEL_DIR / name)
        for name in STAGE1_ONLY_FILES:  # don't make phones download a model the app no longer uses
            (DEFAULT_MODEL_DIR / name).unlink(missing_ok=True)
        print(f"applied: web/public/model now serves {winner['dir'].name} (kind=classifier). "
              "Rerun the demo script 5/5 before merging; `git checkout main -- web/public/model` undoes it.")
    elif args.apply:
        print("not applied: Stage 1 stays.")


if __name__ == "__main__":
    main()
