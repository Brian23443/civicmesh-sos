"""Training data generation (MASTER_PROMPT §6).

Labels are sampled first (§6.3); a writer model is then asked to write a message conveying
exactly those facts (§6.4), so every row is labeled by construction.

    python3 -m training.generate --probe              # ONE call per writer model (§16) — run first
    python3 -m training.generate --n 200              # then read ~20 rows by hand
    python3 -m training.generate --n 5000 --workers 30

Resumable: --n counts only rows in data/synthetic/raw.jsonl written by the two writer models.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from training.common import (
    COUNT_RULE,
    HAZARD_NAMES,
    LABEL_VERSION,
    MEDICAL_NAMES,
    RAW_PATH,
    THIRD_PARTY_RULE,
    OpenRouterError,
    append_jsonl,
    iter_jsonl,
    load_env,
    openrouter_post,
    strip_code_fences,
)

# --- §6.1 writers ------------------------------------------------------------------

load_env()
WRITER_MAIN = os.environ.get("WRITER_MAIN", "deepseek/deepseek-v4-flash-0731")
WRITER_ALT = os.environ.get("WRITER_ALT", "xiaomi/mimo-v2.6-flash")
WRITER_SHARES = {WRITER_MAIN: 0.65, WRITER_ALT: 0.35}

SPECS_PER_REQUEST = 10
MAX_TEXT_CHARS = 600

# --- §6.3 spec sampling (exact) ------------------------------------------------------

PRIORITY_W = {"Immediate": 0.38, "Delayed": 0.25, "Minor": 0.27, "Deceased": 0.10}
HAZARD_W = {
    "NONE": .03, "FLOOD": .16, "FIRE_SMOKE": .12, "STRUCTURAL_COLLAPSE": .11, "HAZMAT_GAS": .06,
    "ELECTRICAL_POWER": .05, "EXTREME_WEATHER": .08, "MEDICAL_CRISIS": .09, "ACTIVE_VIOLENCE": .04,
    "TSUNAMI_SURGE": .03, "LANDSLIDE": .04, "HYPOTHERMIA_FREEZE": .05, "HEAT_STROKE": .04,
    "SINKHOLE_SUBSIDENCE": .02, "CONTAMINATED_WATER": .05, "OTHER": .03,
}
MINOR_NONE_P = 0.25
STATUS_W = {  # Trapped, Exposed, Sheltered, Unknown — depends on priority
    "Immediate": {"Trapped": .50, "Exposed": .30, "Sheltered": .10, "Unknown": .10},
    "Delayed": {"Trapped": .25, "Exposed": .25, "Sheltered": .35, "Unknown": .15},
    "Minor": {"Trapped": .03, "Exposed": .12, "Sheltered": .70, "Unknown": .15},
    "Deceased": {"Trapped": .40, "Exposed": .30, "Sheltered": .10, "Unknown": .20},
}
ADULT_W = [3, 40, 25, 12, 8, 5, 3, 2, 2]  # 0–8
ADULT_LARGE_P = 0.02                       # uniform 9–15 instead
CHILD_W = [60, 20, 12, 5, 3]              # 0–4
N_MEDICAL_W = {  # 0, 1, 2 flags — depends on priority
    "Immediate": [.30, .50, .20], "Delayed": [.45, .45, .10], "Minor": [.90, .10, 0], "Deceased": [.80, .20, 0],
}
HAZARD_POOL_P = 0.6
HAZARD_POOLS = {
    "FIRE_SMOKE": ["BURNS", "OXYGEN"], "STRUCTURAL_COLLAPSE": ["BLEEDING", "MOBILITY_IMPAIRED"],
    "FLOOD": ["HYPOTHERMIA", "INSULIN"], "TSUNAMI_SURGE": ["HYPOTHERMIA", "BLEEDING"],
    "HYPOTHERMIA_FREEZE": ["HYPOTHERMIA"], "HAZMAT_GAS": ["OXYGEN"], "ELECTRICAL_POWER": ["BURNS", "CARDIAC"],
    "ACTIVE_VIOLENCE": ["BLEEDING"], "HEAT_STROKE": ["CARDIAC"], "LANDSLIDE": ["MOBILITY_IMPAIRED", "BLEEDING"],
}
CHILD_INFANT_P = 0.1
THIRD_PARTY_P = {"Deceased": 0.50, "other": 0.18}
LANGUAGE_W = {"English": .88, "Spanish": .06, "mixed English and Spanish": .06}
LENGTH_W = {"5-15 words": .35, "15-40 words": .45, "40-80 words": .20}
STYLES = [
    "panicked text message, ALL CAPS, typos, no punctuation",
    "panicked text message with typos and autocorrect errors",
    "SMS shorthand (u, ppl, pls, rn, asap), lowercase",
    "calm, factual, complete sentences",
    "very short fragment, under 10 words",
    "rambling, run-on, emotional, details out of order",
    "elderly person, polite and formal, slightly confused",
    "teenager, casual slang",
    "exhausted and terse after hours of waiting",
    "someone relaying what they heard from a neighbor or family member on the phone",
    "mentions a street address, intersection, or landmark",
    "downplays the situation even though it is serious",
    "exaggerates and is dramatic even though it is minor",
    "includes irrelevant details (pets, belongings, the weather) mixed with the important ones",
    "uses negation, e.g. says what is NOT happening as well as what is",
    "describes something that already happened and is now over, plus the current situation",
]
RELAYING_STYLE = STYLES[9]


def _pick(rng: random.Random, weights: dict[str, float]) -> str:
    return rng.choices(list(weights), weights=list(weights.values()))[0]


def sample_spec(rng: random.Random) -> dict[str, Any]:
    """One label spec, exactly as §6.3 describes."""
    priority = _pick(rng, PRIORITY_W)
    hazard = _pick(rng, HAZARD_W)
    if priority == "Minor" and rng.random() < MINOR_NONE_P:
        hazard = "NONE"
    status = _pick(rng, STATUS_W[priority])

    if rng.random() < ADULT_LARGE_P:
        adults = rng.randint(9, 15)
    else:
        adults = rng.choices(range(9), weights=ADULT_W)[0]
    children = rng.choices(range(5), weights=CHILD_W)[0]

    n_medical = rng.choices([0, 1, 2], weights=N_MEDICAL_W[priority])[0]
    medical: list[str] = []
    for _ in range(n_medical):
        pool = [m for m in HAZARD_POOLS.get(hazard, []) if m not in medical]
        if pool and rng.random() < HAZARD_POOL_P:
            medical.append(rng.choice(pool))
        else:
            medical.append(rng.choice([m for m in MEDICAL_NAMES if m not in medical]))
    if children and "PREGNANCY_INFANT" not in medical and rng.random() < CHILD_INFANT_P:
        medical.append("PREGNANCY_INFANT")

    style = rng.choice(STYLES)
    third_party = rng.random() < THIRD_PARTY_P["Deceased" if priority == "Deceased" else "other"]
    if style == RELAYING_STYLE:
        third_party = True

    if adults + children == 0:
        adults = 1
    if not third_party and adults == 0:
        adults = 1  # the writer is counted

    return {
        "id": uuid.UUID(int=rng.getrandbits(128)).hex[:10],
        "priority": priority, "hazard": hazard, "status": status,
        "adults": adults, "children": children,
        "medical": sorted(medical, key=MEDICAL_NAMES.index),
        "third_party": third_party, "style": style,
        "language": _pick(rng, LANGUAGE_W), "length": _pick(rng, LENGTH_W),
    }


# --- §6.4 writer system prompt (verbatim) ------------------------------------------------

SYSTEM_PROMPT = """You write realistic emergency distress messages for training a disaster-triage classifier.
People type these on phones during floods, fires, earthquakes and storms, often scared, hurried, and misspelling things.

For each spec you get, write ONE message that conveys exactly the facts in the spec and nothing that contradicts it:
- priority: how urgent the situation really is. Convey it through the facts described, never with words like "red", "immediate", "priority", "triage".
- hazard: the main danger. NONE means no environmental hazard.
- status: Sheltered / Exposed / Trapped. If "Unknown", do NOT reveal where the victims are or whether they can move.
- adults / children: the exact number of adults and children at the scene: {COUNT_RULE} Imply counts naturally ("me and my 2 kids" = 1 adult, 2 children). 0 children means don't mention any children at the scene.
- medical: every listed need must be clearly implied; do not imply any need that isn't listed.
- third_party: {THIRD_PARTY_RULE} When false, the writer is at the scene and counted in adults.
- Follow the style, language and length exactly. Vary names, places and wording; never reuse phrasing across messages.

Return JSON: {"messages": [{"id": "<spec id>", "text": "<message>"}, ...]} with one entry per spec, in order."""


def system_prompt() -> str:
    # COUNT_RULE is written as a clause ("count the people …"); capitalise it after the colon.
    return SYSTEM_PROMPT.replace("{COUNT_RULE}", COUNT_RULE[0].upper() + COUNT_RULE[1:]).replace(
        "{THIRD_PARTY_RULE}", THIRD_PARTY_RULE[0].upper() + THIRD_PARTY_RULE[1:])


# --- requests --------------------------------------------------------------------------

# §16 OPEN: whether each writer accepts `reasoning` and `response_format`. A 400 that names one
# of them drops that field for that writer for the rest of the run (and is reported).
_dropped: dict[str, set[str]] = {}
_dropped_lock = threading.Lock()
OPTIONAL_FIELDS = ("reasoning", "response_format")


def build_payload(model: str, specs: list[dict]) -> dict[str, Any]:
    payload = {
        "model": model,
        "temperature": 1.0,
        "response_format": {"type": "json_object"},
        "reasoning": {"enabled": False},
        "messages": [
            {"role": "system", "content": system_prompt()},
            {"role": "user", "content": "Specs:\n" + "\n".join(json.dumps(s) for s in specs)},
        ],
    }
    for field in _dropped.get(model, ()):
        payload.pop(field, None)
    return payload


def call_writer(model: str, specs: list[dict]) -> tuple[dict, dict]:
    """Returns (id → text, usage). Drops an unsupported optional field once and retries."""
    while True:
        try:
            resp = openrouter_post("chat/completions", build_payload(model, specs))
            break
        except OpenRouterError as exc:
            bad = [f for f in OPTIONAL_FIELDS if exc.status == 400 and f in exc.body
                   and f not in _dropped.get(model, set())]
            if not bad:
                raise
            with _dropped_lock:
                _dropped.setdefault(model, set()).update(bad)
    content = resp["choices"][0]["message"]["content"] or ""
    parsed = json.loads(strip_code_fences(content))
    messages = parsed.get("messages", []) if isinstance(parsed, dict) else []
    texts = {str(m.get("id")): str(m.get("text", "")).strip() for m in messages if isinstance(m, dict)}
    return texts, resp.get("usage", {})


def rows_from(specs: list[dict], texts: dict[str, str], writer: str) -> list[dict]:
    rows = []
    for s in specs:
        text = texts.get(s["id"], "")
        if not text or len(text) > MAX_TEXT_CHARS:
            continue
        rows.append({
            "id": "syn_" + s["id"], "text": text,
            "triage_priority": s["priority"], "hazard_class": s["hazard"], "rescue_status": s["status"],
            "adult_count": s["adults"], "pediatric_count": s["children"], "medical_flags": s["medical"],
            "is_third_party": s["third_party"], "style": s["style"], "language": s["language"],
            "writer": writer, "label_version": LABEL_VERSION,
        })
    return rows


def existing_count() -> int:
    return sum(1 for r in iter_jsonl(RAW_PATH) if r.get("writer") in WRITER_SHARES)


# --- modes -------------------------------------------------------------------------------


def probe() -> None:
    """§16: one call per writer with the exact payload, before any batch run."""
    rng = random.Random()
    for model in WRITER_SHARES:
        specs = [sample_spec(rng) for _ in range(2)]
        try:
            texts, usage = call_writer(model, specs)
        except Exception as exc:  # noqa: BLE001 — report and keep probing the other writer
            print(f"✗ {model}: {exc}")
            continue
        dropped = sorted(_dropped.get(model, ()))
        print(f"✓ {model}: {len(texts)}/2 messages, usage {usage}"
              + (f"; REJECTED and dropped: {dropped}" if dropped else "; accepted reasoning + response_format"))
        for s in specs:
            print(f"    [{s['priority']}/{s['hazard']}/{s['status']}/{s['adults']}+{s['children']}/"
                  f"{s['medical']}/tp={s['third_party']}] {texts.get(s['id'], '<missing>')!r}")


def generate(n: int, workers: int, seed: int | None) -> None:
    from tqdm import tqdm  # noqa: PLC0415

    have = existing_count()
    if have >= n:
        print(f"{have} writer rows already in {RAW_PATH} (≥ {n}); nothing to do")
        return
    rng = random.Random(seed)
    lock = threading.Lock()
    stats = {"rows": have, "failed": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost": 0.0}
    print(f"{have} writer rows exist; generating to {n} with {workers} workers "
          f"({WRITER_MAIN} {WRITER_SHARES[WRITER_MAIN]:.0%} / {WRITER_ALT} {WRITER_SHARES[WRITER_ALT]:.0%})")

    def job(model: str, specs: list[dict]) -> int:
        texts, usage = call_writer(model, specs)
        rows = rows_from(specs, texts, model)
        with lock:
            append_jsonl(RAW_PATH, rows)
            stats["prompt_tokens"] += usage.get("prompt_tokens", 0) or 0
            stats["completion_tokens"] += usage.get("completion_tokens", 0) or 0
            stats["cost"] += usage.get("cost", 0) or 0
        return len(rows)

    bar = tqdm(total=n, initial=have, unit="row")
    with ThreadPoolExecutor(max_workers=workers) as pool:
        pending = set()

        def submit() -> None:
            model = _pick(rng, WRITER_SHARES)
            pending.add(pool.submit(job, model, [sample_spec(rng) for _ in range(SPECS_PER_REQUEST)]))

        # Keep enough batches in flight to reach n, topping up as rows land (some get dropped).
        while stats["rows"] < n:
            while len(pending) < workers and stats["rows"] + SPECS_PER_REQUEST * len(pending) < n + SPECS_PER_REQUEST:
                submit()
            done = next(as_completed(pending))
            pending.discard(done)
            try:
                got = done.result()
                stats["rows"] += got
                bar.update(got)
            except Exception as exc:  # noqa: BLE001
                stats["failed"] += 1
                tqdm.write(f"batch failed: {str(exc)[:200]}")
            bar.set_postfix(failed=stats["failed"])
        for f in pending:  # let in-flight batches finish (their rows still count)
            try:
                bar.update(f.result())
            except Exception:  # noqa: BLE001
                stats["failed"] += 1
    bar.close()
    dropped = {m: sorted(f) for m, f in _dropped.items() if f}
    print(f"done: {existing_count()} writer rows, {stats['failed']} failed batches, "
          f"{stats['prompt_tokens']:,} prompt + {stats['completion_tokens']:,} completion tokens"
          + (f", reported cost ${stats['cost']:.2f}" if stats["cost"] else "")
          + (f"; dropped unsupported fields: {dropped}" if dropped else ""))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate labeled synthetic distress messages (§6)")
    parser.add_argument("--n", type=int, help="target number of writer rows in raw.jsonl")
    parser.add_argument("--workers", type=int, default=30)
    parser.add_argument("--seed", type=int, help="spec sampling seed (default: random)")
    parser.add_argument("--probe", action="store_true", help="one call per writer model, then exit")
    args = parser.parse_args()
    if args.probe:
        probe()
    elif args.n:
        generate(args.n, args.workers, args.seed)
    else:
        parser.error("use --probe or --n N")


if __name__ == "__main__":
    main()
