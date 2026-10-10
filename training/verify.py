"""Label checking with TypeSafe Jev (MASTER_PROMPT §7).

    python3 -m training.verify --probe       # ONE call (§16: the endpoint is OPEN) — run first
    python3 -m training.verify --benchmark   # score the checker itself on Appendix A (run before batches)
    python3 -m training.verify               # score raw.jsonl → scored.jsonl (resumable)
    python3 -m training.verify --refilter    # re-apply the keep thresholds, no API calls

Endpoint: OpenRouter `POST /api/v1/systemone` by default. If that path is wrong, set
JEV_ENDPOINT=typesafe and TYPESAFE_API_KEY to use TypeSafe's own `https://api.typesafe.ai/v1/systemone`.
"""

from __future__ import annotations

import argparse
import json
import os
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from training.common import (
    ARTIFACTS_DIR,
    COUNT_RULE,
    HAZARD_DESCRIPTIONS,
    HAZARD_NAMES,
    LABEL_VERSION,
    MEDICAL_DESCRIPTIONS,
    MEDICAL_NAMES,
    PRIORITY_COLORS,
    PRIORITY_DESCRIPTIONS,
    PRIORITY_LABELS,
    RAW_PATH,
    SCORED_PATH,
    STATUS_DESCRIPTIONS,
    STATUS_LABELS,
    THIRD_PARTY_RULE,
    append_jsonl,
    iter_jsonl,
    load_benchmark,
    load_env,
    openrouter_post,
    write_jsonl,
)

MODEL = "typesafe/jev-1.13"
TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone"

# §7 keep thresholds
MIN_P_PRIORITY = 0.35
MIN_P_HAZARD = 0.25
MIN_P_STATUS = 0.25
MIN_P_LISTED_MEDICAL = 0.40
MAX_P_UNLISTED_MEDICAL = 0.60
THIRD_PARTY_TRUE_MIN = 0.20
THIRD_PARTY_FALSE_MAX = 0.80

COUNT_OPTIONS = {str(i): None for i in range(15)} | {"15": "15 or more"}


def questions() -> dict[str, dict]:
    """The 14 questions of §7, asked in one request per message."""
    q: dict[str, dict] = {
        "priority": {
            "type": "choice",
            "instructions": "Using START/FEMA disaster triage, how urgent is the situation described in this "
                            "distress message?",
            "criteria": {lab: f"{PRIORITY_COLORS[lab]}: {PRIORITY_DESCRIPTIONS[lab]}" for lab in PRIORITY_LABELS},
        },
        "hazard": {
            "type": "choice",
            "instructions": "What is the main environmental hazard endangering the people in this message?",
            "criteria": {name: HAZARD_DESCRIPTIONS[name] for name in HAZARD_NAMES},
        },
        "status": {
            "type": "choice",
            "instructions": "What is the physical situation of the victims?",
            "criteria": {lab: STATUS_DESCRIPTIONS[lab] for lab in STATUS_LABELS},
        },
        "adults": {
            "type": "choice",
            "instructions": f"How many adults are at the scene? Count adults only, using this rule: {COUNT_RULE}",
            "criteria": dict(COUNT_OPTIONS),
        },
        "children": {
            "type": "choice",
            "instructions": "How many children or infants are at the scene of the emergency? 0 if none are mentioned.",
            "criteria": dict(COUNT_OPTIONS),
        },
        "third_party": {
            "type": "noul",
            "instructions": "Is the writer somewhere other than the scene of the emergency?",
            "criteria": {"true": f"Third-party report: {THIRD_PARTY_RULE}",
                         "false": "The writer is at the scene of the emergency"},
        },
    }
    for name in MEDICAL_NAMES:
        q[f"med_{name}"] = {"type": "noul",
                            "instructions": f"Does the message indicate that {MEDICAL_DESCRIPTIONS[name]}?"}
    return q


def call_jev(text: str) -> dict[str, Any]:
    payload = {"model": MODEL, "state": {"distress_message": text}, "questions": questions()}
    load_env()
    if os.environ.get("JEV_ENDPOINT", "openrouter") == "typesafe":
        import requests  # noqa: PLC0415

        key = os.environ.get("TYPESAFE_API_KEY")
        if not key:
            raise RuntimeError("JEV_ENDPOINT=typesafe needs TYPESAFE_API_KEY in .env")
        resp = requests.post(TYPESAFE_URL, json=payload, headers={"Authorization": f"Bearer {key}"}, timeout=120)
        resp.raise_for_status()
        return resp.json()
    return openrouter_post("systemone", payload)


def probs_in_order(answer: dict, options: list[str]) -> list[float]:
    p = answer.get("probabilities", {})
    return [float(p.get(o, 0.0)) for o in options]


def parse_answers(resp: dict) -> dict[str, Any]:
    """§7 stored fields from a Jev response."""
    a = resp["answers"]
    count_opts = list(COUNT_OPTIONS)

    def count(answer: dict) -> int:
        probs = probs_in_order(answer, count_opts)
        return int(count_opts[max(range(len(probs)), key=probs.__getitem__)]) if any(probs) else int(answer["choice"])

    return {
        "jev_priority": probs_in_order(a["priority"], PRIORITY_LABELS),
        "jev_hazard": probs_in_order(a["hazard"], HAZARD_NAMES),
        "jev_status": probs_in_order(a["status"], STATUS_LABELS),
        "jev_adults": count(a["adults"]),
        "jev_children": count(a["children"]),
        "jev_third_party": float(a["third_party"]["noul"]),
        "jev_medical": [float(a[f"med_{m}"]["noul"]) for m in MEDICAL_NAMES],
    }


def judge(row: dict) -> tuple[bool, list[str]]:
    """§7 keep rule. Returns (keep, reject_reasons)."""
    reasons = []
    if row["jev_priority"][PRIORITY_LABELS.index(row["triage_priority"])] < MIN_P_PRIORITY:
        reasons.append("priority")
    if row["jev_hazard"][HAZARD_NAMES.index(row["hazard_class"])] < MIN_P_HAZARD:
        reasons.append("hazard")
    if row["jev_status"][STATUS_LABELS.index(row["rescue_status"])] < MIN_P_STATUS:
        reasons.append("status")
    listed = set(row["medical_flags"])
    for name, p in zip(MEDICAL_NAMES, row["jev_medical"]):
        if name in listed and p < MIN_P_LISTED_MEDICAL:
            reasons.append(f"medical_missing:{name}")
        if name not in listed and p > MAX_P_UNLISTED_MEDICAL:
            reasons.append(f"medical_extra:{name}")
    tp = row["jev_third_party"]
    if row["is_third_party"] and tp < THIRD_PARTY_TRUE_MIN:
        reasons.append("third_party_true_but_low")
    if not row["is_third_party"] and tp > THIRD_PARTY_FALSE_MAX:
        reasons.append("third_party_false_but_high")
    return not reasons, reasons


def score_row(row: dict) -> dict:
    out = dict(row)
    out.update(parse_answers(call_jev(row["text"])))
    if out.get("label_version", 0) < LABEL_VERSION:
        # Old-rule rows: keep the old values, replace counts and third-party with Jev's answers.
        out["legacy_labels"] = {k: row.get(k) for k in ("adult_count", "pediatric_count", "is_third_party")}
        out["adult_count"], out["pediatric_count"] = out["jev_adults"], out["jev_children"]
        out["is_third_party"] = out["jev_third_party"] >= 0.5
        out["label_version"] = LABEL_VERSION
    out["keep"], out["reject_reasons"] = judge(out)
    return out


# --- reports -----------------------------------------------------------------------------


def report(rows: list[dict]) -> None:
    kept = [r for r in rows if r.get("keep")]
    print(f"kept {len(kept)}/{len(rows)} ({100 * len(kept) / max(1, len(rows)):.1f}%)")
    by_writer: dict[str, list[int]] = {}
    for r in rows:
        k = by_writer.setdefault(r.get("writer", "?"), [0, 0])
        k[0] += bool(r.get("keep"))
        k[1] += 1
    for w, (k, n) in sorted(by_writer.items()):
        print(f"  {w}: {k}/{n} ({100 * k / n:.1f}%)")
    reasons = Counter(x.split(":")[0] if x.startswith("medical") else x for r in rows for x in r.get("reject_reasons", []))
    detail = Counter(x for r in rows for x in r.get("reject_reasons", []) if x.startswith("medical"))
    print("rejection reasons:", dict(reasons.most_common()))
    if detail:
        print("  medical detail:", dict(detail.most_common()))
    mix = Counter(r["triage_priority"] for r in kept)
    print("priority mix of kept rows:", {p: f"{mix[p]} ({100 * mix[p] / max(1, len(kept)):.0f}%)" for p in PRIORITY_LABELS})


def benchmark(workers: int) -> None:
    """Scores Jev on Appendix A — a check on the checker. Nothing is tuned on it."""
    rows = load_benchmark()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        scored = list(pool.map(lambda r: {**r, **parse_answers(call_jev(r["text"]))}, rows))

    def argmax(xs):
        return max(range(len(xs)), key=xs.__getitem__)

    n = len(scored)
    pri = [(PRIORITY_LABELS.index(r["triage_priority"]), argmax(r["jev_priority"])) for r in scored]
    red_gold = [p for g, p in pri if g == 2]
    m = {
        "n": n,
        "priority_acc": sum(g == p for g, p in pri) / n,
        "red_recall": sum(p == 2 for p in red_gold) / len(red_gold),
        "hazard_acc": sum(HAZARD_NAMES.index(r["hazard_class"]) == argmax(r["jev_hazard"]) for r in scored) / n,
        "status_acc": sum(STATUS_LABELS.index(r["rescue_status"]) == argmax(r["jev_status"]) for r in scored) / n,
        "adults_acc": sum(r["adult_count"] == r["jev_adults"] for r in scored) / n,
        "children_acc": sum(r["pediatric_count"] == r["jev_children"] for r in scored) / n,
        "third_party_acc": sum(r["is_third_party"] == (r["jev_third_party"] >= 0.5) for r in scored) / n,
    }
    tp = fp = fn = 0
    for r in scored:
        gold = set(r["medical_flags"])
        for name, p in zip(MEDICAL_NAMES, r["jev_medical"]):
            tp += name in gold and p >= 0.5
            fp += name not in gold and p >= 0.5
            fn += name in gold and p < 0.5
    m["medical_f1"] = 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else None
    confusion = [[0] * 4 for _ in range(4)]
    for g, p in pri:
        confusion[g][p] += 1
    m["priority_confusion"] = {"labels": PRIORITY_LABELS, "rows_gold_cols_pred": confusion}
    ARTIFACTS_DIR.mkdir(exist_ok=True)
    (ARTIFACTS_DIR / "jev_benchmark.json").write_text(json.dumps(m, indent=2) + "\n")
    for k, v in m.items():
        if k != "priority_confusion":
            print(f"  {k}: {v if isinstance(v, int) else f'{100 * v:.1f}%' if v is not None else 'n/a'}")
    print("  priority confusion (rows gold, cols predicted):", PRIORITY_LABELS)
    for lab, row in zip(PRIORITY_LABELS, confusion):
        print(f"    {lab:9s} {row}")
    print(f"  → {ARTIFACTS_DIR / 'jev_benchmark.json'}")


def verify(workers: int, raw_path=RAW_PATH, scored_path=SCORED_PATH) -> None:
    from tqdm import tqdm  # noqa: PLC0415

    done = {r["id"] for r in iter_jsonl(scored_path)}
    todo = [r for r in iter_jsonl(raw_path) if r["id"] not in done]
    print(f"{len(done)} rows already scored; scoring {len(todo)} more with {workers} workers")
    lock, failed = threading.Lock(), 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(score_row, r): r["id"] for r in todo}
        for f in tqdm(as_completed(futures), total=len(futures), unit="row"):
            try:
                row = f.result()
            except Exception as exc:  # noqa: BLE001
                failed += 1
                tqdm.write(f"{futures[f]} failed: {str(exc)[:200]}")
                continue
            with lock:
                append_jsonl(scored_path, [row])
    if failed:
        print(f"{failed} rows failed; rerun to retry them (resumable)")
    report(list(iter_jsonl(scored_path)))


def refilter() -> None:
    rows = list(iter_jsonl(SCORED_PATH))
    for r in rows:
        r["keep"], r["reject_reasons"] = judge(r)
    write_jsonl(SCORED_PATH, rows)
    report(rows)


def probe() -> None:
    text = "water coming in under the door, me and my dad, he uses a wheelchair"
    resp = call_jev(text)
    print("raw response keys:", sorted(resp))
    print("usage:", resp.get("usage"))
    parsed = parse_answers(resp)
    print("parsed:", json.dumps({k: (v if not isinstance(v, list) else [round(x, 3) for x in v])
                                 for k, v in parsed.items()}))


def main() -> None:
    parser = argparse.ArgumentParser(description="Check labels with TypeSafe Jev (§7)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--probe", action="store_true", help="one call, then exit")
    mode.add_argument("--benchmark", action="store_true", help="score Jev on Appendix A")
    mode.add_argument("--refilter", action="store_true", help="re-apply thresholds without API calls")
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--input", type=Path, default=RAW_PATH, help="rows to score (default raw.jsonl)")
    parser.add_argument("--output", type=Path, default=SCORED_PATH, help="scored rows (default scored.jsonl)")
    args = parser.parse_args()
    if args.probe:
        probe()
    elif args.benchmark:
        benchmark(args.workers)
    elif args.refilter:
        refilter()
    else:
        verify(args.workers, args.input, args.output)


if __name__ == "__main__":
    main()
