"""Shared training helpers (MASTER_PROMPT §4, §6, contract K6).

Label vocabularies and descriptions, the version-2 labeling rules, JSONL helpers
and the OpenRouter client. The generator prompt, the checker's questions and the
chatbot prompts all use the same COUNT_RULE / THIRD_PARTY_RULE text.
"""

from __future__ import annotations

import json
import os
import random
import time
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

from src.schema import HazardClass, MedicalFlags, RescueStatus, TriagePriority

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SYNTHETIC_DIR = DATA_DIR / "synthetic"
RAW_PATH = SYNTHETIC_DIR / "raw.jsonl"
SCORED_PATH = SYNTHETIC_DIR / "scored.jsonl"
BENCHMARK_PATH = DATA_DIR / "benchmark_dataset.jsonl"  # Appendix A — NEVER train or tune on it
ARTIFACTS_DIR = ROOT / "artifacts"

# --- §4 labeling rules (version 2) ----------------------------------------------

LABEL_VERSION = 2

COUNT_RULE = (
    "count the people at the scene of the emergency, including the writer if the writer is there: "
    "the people responders would find on arrival, including anyone deceased. Pets don't count. "
    "If no number is given, count the people the message mentions; a writer alone at the scene is 1 adult."
)

THIRD_PARTY_RULE = (
    "true only when the writer is NOT at the scene, so the phone's location is not where help is needed "
    "(e.g. a relative who phoned them, an incident seen from blocks away). A writer at the scene reporting "
    "about someone next to them is NOT a third party (\"my husband is pinned\", \"found a man in the ditch\")."
)

# --- Vocabularies (JSONL label strings, in enum order) ------------------------------

PRIORITY_LABELS = [p.label for p in TriagePriority]          # Minor, Delayed, Immediate, Deceased
HAZARD_NAMES = [h.name for h in HazardClass]                  # NONE ... OTHER (16)
STATUS_LABELS = [s.label for s in RescueStatus]               # Sheltered, Exposed, Trapped, Unknown
MEDICAL_NAMES = [MedicalFlags(1 << b).name for b in range(8)]  # INSULIN ... BURNS
LANGUAGES = ["English", "Spanish", "mixed English and Spanish"]
LOCATION_TYPES = ["DIRECT_ON_SCENE", "PROXIMATE_OFFSET", "LANDMARK_POI", "EXPLICIT_ADDRESS"]

# --- §2 descriptions -------------------------------------------------------------

PRIORITY_DESCRIPTIONS = {
    "Minor": "Safe, or only minor injuries; walking wounded; needs supplies or information, not rescue",
    "Delayed": "Serious but stable; injured or stranded but not in immediate danger of dying; "
               "rescue can wait hours",
    "Immediate": "Life-threatening right now: severe bleeding, can't breathe, unconscious, or trapped with a "
                 "rising hazard (water, fire, gas, collapse)",
    "Deceased": "Dead, or unresponsive with no signs of life",
}
PRIORITY_COLORS = {"Minor": "GREEN", "Delayed": "YELLOW", "Immediate": "RED", "Deceased": "BLACK"}

HAZARD_DESCRIPTIONS = {
    "NONE": "no hazard mentioned",
    "FLOOD": "flooding, rising water, submerged roads or homes",
    "FIRE_SMOKE": "fire, flames, smoke, wildfire",
    "STRUCTURAL_COLLAPSE": "building, roof, wall, stairwell or bridge collapse; rubble",
    "HAZMAT_GAS": "gas leak, chemical spill, toxic fumes",
    "ELECTRICAL_POWER": "downed power lines, sparking, electrocution risk",
    "EXTREME_WEATHER": "tornado, hurricane winds, hail, severe storm",
    "MEDICAL_CRISIS": "a medical emergency is the main problem, with no environmental hazard",
    "ACTIVE_VIOLENCE": "shooter, assault, looting, hostile people",
    "TSUNAMI_SURGE": "tsunami, storm surge, ocean water coming inland",
    "LANDSLIDE": "landslide, mudslide, debris flow",
    "HYPOTHERMIA_FREEZE": "extreme cold, blizzard, freezing conditions",
    "HEAT_STROKE": "extreme heat, heat stroke, no cooling",
    "SINKHOLE_SUBSIDENCE": "sinkhole, ground giving way",
    "CONTAMINATED_WATER": "unsafe or contaminated drinking water, no clean water",
    "OTHER": "a hazard that fits none of the other categories",
}

STATUS_DESCRIPTIONS = {
    "Sheltered": "inside a secure building or shelter, not trapped",
    "Exposed": "outdoors or exposed to the elements: on a roof, in water, in a car, on the street",
    "Trapped": "cannot get out: pinned, stuck in an attic, under rubble, in a vehicle, cut off",
    "Unknown": "the message does not say where the victims are or whether they can move",
}

# Bits 0-7; also the checker's question text: "Does the message indicate that <meaning>?"
MEDICAL_DESCRIPTIONS = {
    "INSULIN": "someone is diabetic or needs insulin",
    "OXYGEN": "someone has trouble breathing or depends on oxygen",
    "BLEEDING": "someone is bleeding heavily or has a serious wound",
    "HYPOTHERMIA": "someone is dangerously cold, hypothermic, or soaked in cold water",
    "MOBILITY_IMPAIRED": "someone cannot walk: wheelchair, broken leg or pelvis, elderly and immobile, pinned",
    "CARDIAC": "someone has chest pain, a heart attack, or a heart condition flaring up",
    "PREGNANCY_INFANT": "someone is pregnant or in labor, or a newborn or infant needs care",
    "BURNS": "someone has burns",
}

# --- Label conversion ----------------------------------------------------------------


def priority_index(label: str) -> int:
    return PRIORITY_LABELS.index(label)


def hazard_index(name: str) -> int:
    return HAZARD_NAMES.index(name)


def status_index(label: str) -> int:
    return STATUS_LABELS.index(label)


def medical_vector(names: Iterable[str]) -> list[int]:
    """8-element 0/1 vector in flag-bit order."""
    names = set(names)
    return [1 if n in names else 0 for n in MEDICAL_NAMES]


def medical_mask(names: Iterable[str]) -> int:
    return sum(1 << MEDICAL_NAMES.index(n) for n in set(names))


def validate_row(row: dict[str, Any]) -> list[str]:
    """Returns a list of problems with a §4-format row (empty if valid)."""
    problems = []
    if not isinstance(row.get("id"), str) or not row["id"]:
        problems.append("id must be a non-empty string")
    if not isinstance(row.get("text"), str) or not row["text"].strip():
        problems.append("text must be a non-empty string")
    if row.get("triage_priority") not in PRIORITY_LABELS:
        problems.append(f"triage_priority {row.get('triage_priority')!r} not in {PRIORITY_LABELS}")
    if row.get("hazard_class") not in HAZARD_NAMES:
        problems.append(f"hazard_class {row.get('hazard_class')!r} is not a HazardClass name")
    if row.get("rescue_status") not in STATUS_LABELS:
        problems.append(f"rescue_status {row.get('rescue_status')!r} not in {STATUS_LABELS}")
    for key in ("adult_count", "pediatric_count"):
        v = row.get(key)
        if not isinstance(v, int) or isinstance(v, bool) or not 0 <= v <= 15:
            problems.append(f"{key} must be an int 0-15, got {v!r}")
    meds = row.get("medical_flags")
    if not isinstance(meds, list) or any(m not in MEDICAL_NAMES for m in meds):
        problems.append(f"medical_flags must be a list of {MEDICAL_NAMES}, got {meds!r}")
    if not isinstance(row.get("is_third_party"), bool):
        problems.append(f"is_third_party must be a bool, got {row.get('is_third_party')!r}")
    if "language" in row and row["language"] not in LANGUAGES:
        problems.append(f"language {row['language']!r} not in {LANGUAGES}")
    return problems


# --- JSONL helpers -----------------------------------------------------------------


def iter_jsonl(path: str | Path) -> Iterator[dict[str, Any]]:
    path = Path(path)
    if not path.exists():
        return
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    return list(iter_jsonl(path))


def append_jsonl(path: str | Path, rows: Iterable[dict[str, Any]]) -> int:
    """Appends rows and flushes, so an interrupted run loses nothing. Returns the count written."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with path.open("a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
        f.flush()
    return n


def write_jsonl(path: str | Path, rows: Iterable[dict[str, Any]]) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        n = 0
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return n


def load_benchmark() -> list[dict[str, Any]]:
    """Appendix A. For evaluation and the importer's similarity check ONLY."""
    return read_jsonl(BENCHMARK_PATH)


# --- OpenRouter client (§6) ------------------------------------------------------------

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
RETRY_STATUSES = {408, 429, 500, 502, 503, 524, 529}
MAX_ATTEMPTS = 5


class OpenRouterError(RuntimeError):
    def __init__(self, status: int, body: str):
        super().__init__(f"OpenRouter HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


def load_env(path: str | Path = ROOT / ".env") -> None:
    """Minimal .env loader (KEY=VALUE lines); existing environment variables win."""
    path = Path(path)
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _post_with_deadline(url: str, payload: dict, headers: dict, deadline_s: float,
                        read_timeout_s: float) -> tuple[int, bytes]:
    """POST, reading the body in chunks so a total deadline applies. Returns (status, body).

    `requests`' timeout is per socket read, and OpenRouter keeps slow requests alive by
    trickling whitespace — so a stalled upstream can otherwise hang a thread forever
    (seen on a 5,000-row run: 3 requests stuck for 16+ minutes).
    """
    import requests  # noqa: PLC0415

    start = time.monotonic()
    resp = requests.post(url, json=payload, headers=headers, timeout=(15, read_timeout_s), stream=True)
    try:
        chunks = []
        for chunk in resp.iter_content(chunk_size=8192):
            chunks.append(chunk)
            if time.monotonic() - start > deadline_s:
                raise requests.Timeout(f"no complete response within {deadline_s:.0f}s")
        return resp.status_code, b"".join(chunks)
    finally:
        resp.close()


def openrouter_post(path: str, payload: dict[str, Any], timeout: float = 180) -> dict[str, Any]:
    """POSTs to OpenRouter with the §6 retry policy.

    Up to 5 attempts with backoff min(30, 2^attempt + rand) on network errors and on
    HTTP 408, 429, 500, 502, 503, 524, 529. Any other error status raises immediately.
    `timeout` is a total deadline per attempt (a stalled attempt counts as a network error).
    """
    import requests  # noqa: PLC0415 — only needed for API calls

    load_env()
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY is not set (put it in .env)")
    url = OPENROUTER_BASE + "/" + path.lstrip("/")
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            status, body = _post_with_deadline(url, payload, headers, deadline_s=timeout, read_timeout_s=60)
        except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError) as exc:
            last_error = exc
        else:
            if status < 400:
                return json.loads(body)
            text = body.decode("utf-8", errors="replace")
            if status not in RETRY_STATUSES:
                raise OpenRouterError(status, text)
            last_error = OpenRouterError(status, text)
        if attempt < MAX_ATTEMPTS - 1:
            time.sleep(min(30, 2 ** attempt + random.random()))
    assert last_error is not None
    raise last_error


def strip_code_fences(text: str) -> str:
    """Removes ``` fences around a model's JSON reply."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    return text.strip()
