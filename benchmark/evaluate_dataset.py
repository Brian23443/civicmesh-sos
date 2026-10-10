"""Evaluates models on a labeled dataset (MASTER_PROMPT §9 "Evaluation script", §10).

    python3 -m benchmark.evaluate_dataset --data data/benchmark_dataset.jsonl --models stage1
    python3 -m benchmark.evaluate_dataset --data data/synthetic/raw.jsonl --writer chatbot --models stage1
    python3 -m benchmark.evaluate_dataset --data ... --models stage1 stage1-onnx models/triage-bge-small

Model keys: `stage1` (PyTorch embedder), `stage1-onnx` (the exported INT8 graph in
web/public/model/), or a Stage 2 model directory. Writes artifacts/eval_<data>_<model>.md.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from src.schema import HazardClass, RescueStatus, TriagePriority, TriageSlotResult, medical_names, summary_line
from training.common import (
    ARTIFACTS_DIR,
    HAZARD_NAMES,
    MEDICAL_NAMES,
    PRIORITY_LABELS,
    STATUS_LABELS,
    hazard_index,
    medical_mask,
    priority_index,
    read_jsonl,
    status_index,
)

RED = int(TriagePriority.IMMEDIATE)


# --- loading ---------------------------------------------------------------------


def load_rows(path: Path, writer: str | None = None) -> list[dict[str, Any]]:
    rows = json.loads(path.read_text()) if path.suffix == ".json" else read_jsonl(path)
    if writer:
        rows = [r for r in rows if r.get("writer") == writer]
    return rows


def load_model(key: str):
    """Returns an object with extract_many(texts) -> list[TriageSlotResult]."""
    if key == "stage1":
        from src.models.prototype_classifier import PrototypeClassifier  # noqa: PLC0415

        return PrototypeClassifier()
    if key == "stage1-onnx":
        from src.models.prototype_classifier import DEFAULT_MODEL_DIR, PrototypeClassifier, onnx_embed_fn  # noqa

        return PrototypeClassifier(embed_fn=onnx_embed_fn(DEFAULT_MODEL_DIR))
    path = Path(key)
    if path.is_dir():
        from src.models.triage_classifier import FinetunedTriageExtractor  # noqa: PLC0415

        return FinetunedTriageExtractor(path)
    raise SystemExit(f"unknown model {key!r}: use stage1, stage1-onnx or a model directory")


# --- metrics ---------------------------------------------------------------------


def gold(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "priority": priority_index(row["triage_priority"]),
        "hazard": hazard_index(row["hazard_class"]),
        "status": status_index(row["rescue_status"]),
        "adults": row["adult_count"],
        "children": row["pediatric_count"],
        "medical": medical_mask(row["medical_flags"]),
        "third_party": bool(row["is_third_party"]),
    }


def pred(s: TriageSlotResult) -> dict[str, Any]:
    return {
        "priority": int(s.priority),
        "hazard": int(s.hazard),
        "status": int(s.rescue_status),
        "adults": s.adult_count,
        "children": s.pediatric_count,
        "medical": int(s.medical_flags) & 0xFF,
        "third_party": s.is_third_party_report,
    }


def summary_of(d: dict[str, Any]) -> str:
    return summary_line(d["priority"], d["hazard"], d["status"], d["adults"], d["children"], d["medical"])


def whole_summary_right(g: dict[str, Any], p: dict[str, Any]) -> bool:
    """Every field of the confirmation line right (third-party is reported separately)."""
    return all(g[k] == p[k] for k in ("priority", "hazard", "status", "adults", "children", "medical"))


def pct(n: int, d: int) -> str:
    return f"{100 * n / d:.1f}% ({n}/{d})" if d else "n/a (0/0)"


def compute(rows: list[dict[str, Any]], preds: list[TriageSlotResult]) -> dict[str, Any]:
    G = [gold(r) for r in rows]
    P = [pred(s) for s in preds]
    n = len(rows)
    m: dict[str, Any] = {"n": n}

    def acc(key):
        return sum(g[key] == p[key] for g, p in zip(G, P))

    m["priority_acc"] = acc("priority") / n
    red_gold = sum(g["priority"] == RED for g in G)
    red_pred = sum(p["priority"] == RED for p in P)
    red_tp = sum(g["priority"] == RED and p["priority"] == RED for g, p in zip(G, P))
    m["red_recall"] = red_tp / red_gold if red_gold else None
    m["red_precision"] = red_tp / red_pred if red_pred else None
    m["red_counts"] = {"tp": red_tp, "gold": red_gold, "predicted": red_pred}
    m["hazard_acc"] = acc("hazard") / n
    m["status_acc"] = acc("status") / n
    m["headcount_exact"] = sum(g["adults"] == p["adults"] and g["children"] == p["children"] for g, p in zip(G, P)) / n
    m["adults_exact"] = acc("adults") / n
    m["children_exact"] = acc("children") / n
    m["medical_exact_set"] = acc("medical") / n
    m["third_party_acc"] = acc("third_party") / n
    m["whole_summary_acc"] = sum(whole_summary_right(g, p) for g, p in zip(G, P)) / n

    flags = {}
    tp_all = fp_all = fn_all = 0
    for bit, name in enumerate(MEDICAL_NAMES):
        tp = sum(bool(g["medical"] >> bit & 1) and bool(p["medical"] >> bit & 1) for g, p in zip(G, P))
        fp = sum(not (g["medical"] >> bit & 1) and bool(p["medical"] >> bit & 1) for g, p in zip(G, P))
        fn = sum(bool(g["medical"] >> bit & 1) and not (p["medical"] >> bit & 1) for g, p in zip(G, P))
        tp_all, fp_all, fn_all = tp_all + tp, fp_all + fp, fn_all + fn
        flags[name] = {"tp": tp, "missed": fn, "false_alarms": fp,
                       "recall": tp / (tp + fn) if tp + fn else None,
                       "precision": tp / (tp + fp) if tp + fp else None}
    m["medical_flags"] = flags
    m["medical_f1_micro"] = 2 * tp_all / (2 * tp_all + fp_all + fn_all) if tp_all + fp_all + fn_all else None

    def confusion(key, size):
        mat = [[0] * size for _ in range(size)]
        for g, p in zip(G, P):
            mat[g[key]][p[key]] += 1
        return mat

    m["priority_confusion"] = confusion("priority", 4)
    m["status_confusion"] = confusion("status", 4)
    m["hazard_confusions"] = Counter(
        (HAZARD_NAMES[g["hazard"]], HAZARD_NAMES[p["hazard"]]) for g, p in zip(G, P) if g["hazard"] != p["hazard"]
    ).most_common(10)
    return m


# --- report ----------------------------------------------------------------------


def fmt(x: float | None) -> str:
    return "n/a" if x is None else f"{100 * x:.1f}%"


def matrix_md(mat: list[list[int]], labels: list[str]) -> str:
    lines = ["| gold \\ predicted | " + " | ".join(labels) + " |", "|---" * (len(labels) + 1) + "|"]
    for label, row in zip(labels, mat):
        lines.append(f"| **{label}** | " + " | ".join(str(x) for x in row) + " |")
    return "\n".join(lines)


def report(data_name: str, model_key: str, rows, preds, m: dict[str, Any], n_examples: int) -> str:
    G = [gold(r) for r in rows]
    P = [pred(s) for s in preds]
    rc = m["red_counts"]
    out = [
        f"# Evaluation — `{model_key}` on `{data_name}`", "",
        f"{m['n']} rows. On a 54-row set, one message ≈ 1.9 points of accuracy and one Red ≈ 3.6 points of "
        "Red recall — don't over-read small differences.", "",
        "## Headline", "",
        "| Metric | Value |", "|---|---|",
        f"| **Red recall** | **{fmt(m['red_recall'])}** ({rc['tp']}/{rc['gold']}) |",
        f"| **Red precision** | **{fmt(m['red_precision'])}** ({rc['tp']}/{rc['predicted']}) |",
        f"| **Whole-summary accuracy** | **{fmt(m['whole_summary_acc'])}** |",
        f"| Priority accuracy | {fmt(m['priority_acc'])} |",
        f"| Hazard accuracy | {fmt(m['hazard_acc'])} |",
        f"| Status accuracy | {fmt(m['status_acc'])} |",
        f"| Exact headcounts (adults and children) | {fmt(m['headcount_exact'])} |",
        f"| Exact adults / exact children | {fmt(m['adults_exact'])} / {fmt(m['children_exact'])} |",
        f"| Exact medical set | {fmt(m['medical_exact_set'])} |",
        f"| Medical F1 (micro) | {fmt(m['medical_f1_micro'])} |",
        f"| Third-party accuracy | {fmt(m['third_party_acc'])} |", "",
        "## Priority confusion", "", matrix_md(m["priority_confusion"], PRIORITY_LABELS), "",
        "## Status confusion", "", matrix_md(m["status_confusion"], STATUS_LABELS), "",
        "## Medical flags", "",
        "| Flag | Recall | Precision | Hits | Missed | False alarms |", "|---|---|---|---|---|---|",
    ]
    for name, f in m["medical_flags"].items():
        out.append(f"| {name} | {fmt(f['recall'])} | {fmt(f['precision'])} | {f['tp']} | {f['missed']} | "
                   f"{f['false_alarms']} |")
    out += ["", "## Top hazard confusions", "", "| Gold | Predicted | Count |", "|---|---|---|"]
    out += [f"| {g} | {p} | {c} |" for (g, p), c in m["hazard_confusions"]] or ["| — | — | 0 |"]

    names = {"priority": PRIORITY_LABELS, "hazard": HAZARD_NAMES, "status": STATUS_LABELS}
    out += ["", f"## Example errors (up to {n_examples} per field)"]
    for key in ("priority", "hazard", "status", "adults", "children", "medical", "third_party"):
        errs = [(r, g, p) for r, g, p in zip(rows, G, P) if g[key] != p[key]][:n_examples]
        out += ["", f"### {key} ({sum(g[key] != p[key] for g, p in zip(G, P))} wrong)", ""]
        for r, g, p in errs:
            def show(d):
                if key in names:
                    return names[key][d[key]]
                if key == "medical":
                    return ", ".join(medical_names(d[key])) or "none"
                return str(d[key])
            out.append(f"- `{r.get('id', '?')}` gold **{show(g)}**, predicted **{show(p)}** — {r['text'][:160]}")

    out += ["", "## Summary-line examples", "", "| id | Gold | Predicted | ✓ |", "|---|---|---|---|"]
    for r, g, p in list(zip(rows, G, P))[:15]:
        out.append(f"| `{r.get('id', '?')}` | {summary_of(g)} | {summary_of(p)} | "
                   f"{'✓' if whole_summary_right(g, p) else '✗'} |")
    return "\n".join(out) + "\n"


def evaluate(data: Path, model_key: str, writer: str | None = None, n_examples: int = 25,
             model=None) -> dict[str, Any]:
    rows = load_rows(data, writer)
    if not rows:
        raise SystemExit(f"no rows in {data}" + (f" with writer={writer}" if writer else ""))
    model = model or load_model(model_key)
    preds = model.extract_many([r["text"] for r in rows])
    m = compute(rows, preds)
    data_name = data.stem + (f"_{writer}" if writer else "")
    model_name = Path(model_key).name if Path(model_key).is_dir() else model_key
    ARTIFACTS_DIR.mkdir(exist_ok=True)
    out = ARTIFACTS_DIR / f"eval_{data_name}_{model_name}.md"
    out.write_text(report(data_name, model_key, rows, preds, m, n_examples))
    m["report"] = str(out)
    return m


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate triage models on a labeled dataset")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--models", nargs="+", default=["stage1"])
    parser.add_argument("--writer")
    parser.add_argument("--examples", type=int, default=25)
    args = parser.parse_args()
    for key in args.models:
        m = evaluate(args.data, key, args.writer, args.examples)
        rc = m["red_counts"]
        print(f"{key} on {args.data.name}{' (' + args.writer + ')' if args.writer else ''}: n={m['n']}  "
              f"Red recall {fmt(m['red_recall'])} ({rc['tp']}/{rc['gold']})  Red precision {fmt(m['red_precision'])}  "
              f"whole-summary {fmt(m['whole_summary_acc'])}  priority {fmt(m['priority_acc'])}  "
              f"hazard {fmt(m['hazard_acc'])}  status {fmt(m['status_acc'])}  headcount {fmt(m['headcount_exact'])}  "
              f"medical set {fmt(m['medical_exact_set'])}  third-party {fmt(m['third_party_acc'])}")
        print(f"  → {m['report']}")


if __name__ == "__main__":
    main()
