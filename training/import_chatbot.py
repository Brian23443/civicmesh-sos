"""Import chatbot-authored SOS examples into the synthetic training JSONL.

Usage:
    python3 -m training.import_chatbot FILES... --writer chatbot
    python3 -m training.import_chatbot FILES... --writer chatbot --check
"""

from __future__ import annotations

import argparse
import difflib
import json
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Sequence, TextIO

try:
    from training import common as _common
except ImportError:
    _common = None


def _names(value: Any) -> tuple[str, ...]:
    """Normalize a shared vocabulary supplied as a sequence or mapping."""
    return tuple(value.keys() if isinstance(value, Mapping) else value)


if _common is not None:
    LABEL_VERSION = _common.LABEL_VERSION
    COUNT_RULE = _common.COUNT_RULE
    THIRD_PARTY_RULE = _common.THIRD_PARTY_RULE
    PRIORITY_LABELS = _names(_common.PRIORITY_LABELS)
    STATUS_LABELS = _names(_common.STATUS_LABELS)
    MEDICAL_NAMES = _names(_common.MEDICAL_NAMES)
    LANGUAGES = _names(_common.LANGUAGES)
    _hazards = getattr(_common, "HAZRAM_NAMES", None)
    if _hazards is None:
        _hazards = _common.HAZARD_DESCRIPTIONS
    HAZRAM_NAMES = _names(_hazards)
    HAZARD_DESCRIPTIONS = getattr(
        _common, "HAZARD_DESCRIPTIONS", HAZRAM_NAMES
    )
else:
    # TODO(K6): replace these local definitions with training.common imports once
    # Track 1's shared module is available on this branch.
    LABEL_VERSION = 2
    COUNT_RULE = (
        "Count the people responders would find at the scene, including the "
        "writer when present and anyone deceased; pets do not count."
    )
    THIRD_PARTY_RULE = (
        "True only when the writer is not at the emergency scene, so the "
        "phone's location is not where help is needed."
    )
    PRIORITY_LABELS = ("Minor", "Delayed", "Immediate", "Deceased")
    HAZRAM_NAMES = (
        "NONE",
        "FLOOD",
        "FIRE_SMOKE",
        "STRUCTURAL_COLLAPSE",
        "HAZMAT_GAS",
        "ELECTRICAL_POWER",
        "EXTREME_WEATHER",
        "MEDICAL_CRISIS",
        "ACTIVE_VIOLENCE",
        "TSUNAMI_SURGE",
        "LANDSLIDE",
        "HYPOTHERMIA_FREEZE",
        "HEAT_STROKE",
        "SINKHOLE_SUBSIDENCE",
        "CONTAMINATED_WATER",
        "OTHER",
    )
    HAZARD_DESCRIPTIONS = HAZRAM_NAMES
    STATUS_LABELS = ("Sheltered", "Exposed", "Trapped", "Unknown")
    MEDICAL_NAMES = (
        "INSULIN",
        "OXYGEN",
        "BLEEDING",
        "HYPOTHERMIA",
        "MOBILITY_IMPAIRED",
        "CARDIAC",
        "PREGNANCY_INFANT",
        "BURNS",
    )
    LANGUAGES = ("English", "Spanish", "mixed English and Spanish")


RAW_JSONL = Path("data/synthetic/raw.jsonl")
BENCHMARK_JSONL = Path("data/benchmark_dataset.jsonl")
REQUIRED_FIELDS = (
    "id",
    "text",
    "triage_priority",
    "hazard_class",
    "rescue_status",
    "adult_count",
    "pediatric_count",
    "medical_flags",
    "is_third_party",
    "language",
)


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    """Read JSON objects, delegating to training.common when available."""
    helper = getattr(_common, "read_jsonl", None) if _common else None
    if helper is not None:
        yield from helper(path)
        return
    if not path.exists():
        return
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number}: expected a JSON object")
            yield value


def append_jsonl(path: Path, rows: Iterable[Mapping[str, Any]]) -> None:
    """Append objects, delegating to training.common when available."""
    materialized = [dict(row) for row in rows]
    helper = getattr(_common, "append_jsonl", None) if _common else None
    if helper is not None:
        helper(path, materialized)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as stream:
        for row in materialized:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def validate_record(record: Any) -> list[str]:
    """Return every schema/vocabulary error in one decoded candidate."""
    if not isinstance(record, dict):
        return ["expected a JSON object"]

    errors: list[str] = []
    missing = [field for field in REQUIRED_FIELDS if field not in record]
    if missing:
        errors.append("missing required field(s): " + ", ".join(missing))

    for field in ("id", "text"):
        if field in record and (
            not isinstance(record[field], str) or not record[field].strip()
        ):
            errors.append(f"{field} must be a non-empty string")

    for field, vocabulary in (
        ("triage_priority", PRIORITY_LABELS),
        ("hazard_class", HAZRAM_NAMES),
        ("rescue_status", STATUS_LABELS),
        ("language", LANGUAGES),
    ):
        if field in record and record[field] not in vocabulary:
            errors.append(f"{field} must be one of {list(vocabulary)!r}")

    for field in ("adult_count", "pediatric_count"):
        if field not in record:
            continue
        value = record[field]
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 15:
            errors.append(f"{field} must be an integer between 0 and 15")

    if "medical_flags" in record:
        flags = record["medical_flags"]
        if not isinstance(flags, list):
            errors.append("medical_flags must be a list")
        else:
            invalid = sorted(
                {repr(flag) for flag in flags if flag not in MEDICAL_NAMES}
            )
            if invalid:
                errors.append(
                    "medical_flags contains invalid value(s): " + ", ".join(invalid)
                )

    if (
        "is_third_party" in record
        and type(record["is_third_party"]) is not bool
    ):
        errors.append("is_third_party must be a boolean")
    return errors


def transform_record(
    record: Mapping[str, Any], writer: str, label_version: int
) -> dict[str, Any]:
    transformed = dict(record)
    transformed["id"] = f"chat_{writer}_{record['id']}"
    transformed["medical_flags"] = sorted(set(record["medical_flags"]))
    transformed["writer"] = writer
    transformed["label_version"] = label_version
    return transformed


def parse_files(
    files: Sequence[Path],
    *,
    writer: str = "chatbot",
    label_version: int = LABEL_VERSION,
    existing_ids: Iterable[str] = (),
    error_stream: TextIO = sys.stderr,
) -> tuple[list[dict[str, Any]], int, int]:
    """Return (valid unique rows, physical input lines, invalid line count)."""
    rows: list[dict[str, Any]] = []
    seen = set(existing_ids)
    input_lines = 0
    invalid_lines = 0

    for source in files:
        try:
            stream = source.open(encoding="utf-8-sig")
        except OSError as exc:
            print(f"{source}:0: {exc}", file=error_stream)
            invalid_lines += 1
            continue

        with stream:
            for line_number, line in enumerate(stream, 1):
                input_lines += 1
                stripped = line.lstrip()
                if not stripped.startswith("{"):
                    continue
                try:
                    candidate = json.loads(stripped)
                except json.JSONDecodeError as exc:
                    print(
                        f"{source}:{line_number}: malformed JSON: {exc.msg}",
                        file=error_stream,
                    )
                    invalid_lines += 1
                    continue

                errors = validate_record(candidate)
                if errors:
                    for message in errors:
                        print(f"{source}:{line_number}: {message}", file=error_stream)
                    invalid_lines += 1
                    continue

                transformed = transform_record(candidate, writer, label_version)
                if transformed["id"] in seen:
                    continue
                seen.add(transformed["id"])
                rows.append(transformed)

    return rows, input_lines, invalid_lines


def similarity_ratio(left: str, right: str) -> float:
    return difflib.SequenceMatcher(
        None, left.casefold(), right.casefold()
    ).ratio()


def find_near_duplicates(
    rows: Sequence[Mapping[str, Any]], threshold: float = 0.70
) -> list[tuple[str, str, float]]:
    matches: list[tuple[str, str, float]] = []
    for index, left in enumerate(rows):
        for right in rows[index + 1 :]:
            ratio = similarity_ratio(str(left["text"]), str(right["text"]))
            if ratio > threshold:
                matches.append((str(left["id"]), str(right["id"]), ratio))
    return matches


def benchmark_texts(path: Path) -> list[tuple[str, str]]:
    messages: list[tuple[str, str]] = []
    for index, row in enumerate(read_jsonl(path), 1):
        if "split" in row and str(row["split"]).casefold() != "test":
            continue
        text = row.get("text")
        if isinstance(text, str):
            messages.append((str(row.get("id", f"benchmark:{index}")), text))
    return messages


def find_benchmark_contamination(
    rows: Sequence[Mapping[str, Any]],
    benchmark_path: Path = BENCHMARK_JSONL,
    threshold: float = 0.55,
) -> list[tuple[str, str, float]]:
    """Compare every candidate with every Appendix A test message."""
    if not benchmark_path.exists():
        return []
    reference = benchmark_texts(benchmark_path)
    matches: list[tuple[str, str, float]] = []
    for row in rows:
        for benchmark_id, benchmark_text in reference:
            ratio = similarity_ratio(str(row["text"]), benchmark_text)
            if ratio > threshold:
                matches.append((str(row["id"]), benchmark_id, ratio))
    return matches


def _word_bucket(count: int) -> str:
    if count < 5:
        return "0-4"
    if count <= 15:
        return "5-15"
    if count <= 40:
        return "16-40"
    if count <= 80:
        return "41-80"
    return "81+"


def build_check_report(
    rows: Sequence[Mapping[str, Any]],
    input_lines: int,
    benchmark_path: Path = BENCHMARK_JSONL,
) -> str:
    total = len(rows)
    lines = [
        "Pre-import check",
        f"Valid rows: {total} / {input_lines} input lines",
        "Label mix:",
    ]
    label_groups = (
        ("priorities", "triage_priority", PRIORITY_LABELS),
        ("hazards", "hazard_class", HAZRAM_NAMES),
        ("status", "rescue_status", STATUS_LABELS),
        ("languages", "language", LANGUAGES),
    )
    for heading, field, vocabulary in label_groups:
        counts = Counter(str(row[field]) for row in rows)
        lines.append(f"  {heading}:")
        for label in vocabulary:
            count = counts[label]
            percent = 100.0 * count / total if total else 0.0
            lines.append(f"    {label}: {count} ({percent:.1f}%)")

    counts = [len(str(row["text"]).split()) for row in rows]
    if counts:
        spread = (
            f"min={min(counts)} median={statistics.median(counts):g} "
            f"max={max(counts)}"
        )
    else:
        spread = "min=0 median=0 max=0"
    buckets = Counter(_word_bucket(count) for count in counts)
    bucket_order = ("0-4", "5-15", "16-40", "41-80", "81+")
    lines.extend(
        [
            "Word-count spread:",
            f"  {spread}",
            "  histogram: "
            + ", ".join(f"{bucket}={buckets[bucket]}" for bucket in bucket_order),
        ]
    )

    duplicates = find_near_duplicates(rows)
    lines.append(f"Intra-batch near-duplicates (> 0.70): {len(duplicates)}")
    lines.extend(
        f"  {left} <> {right}: {ratio:.3f}"
        for left, right, ratio in duplicates
    )

    contamination = find_benchmark_contamination(rows, benchmark_path)
    lines.append(
        f"Appendix A anti-contamination matches (> 0.55): {len(contamination)}"
    )
    lines.extend(
        f"  {row_id} <> {benchmark_id}: {ratio:.3f}"
        for row_id, benchmark_id, ratio in contamination
    )
    return "\n".join(lines)


def import_files(
    files: Sequence[Path],
    *,
    writer: str = "chatbot",
    label_version: int = LABEL_VERSION,
    check: bool = False,
    output_path: Path = RAW_JSONL,
    benchmark_path: Path = BENCHMARK_JSONL,
    output_stream: TextIO = sys.stdout,
    error_stream: TextIO = sys.stderr,
) -> tuple[list[dict[str, Any]], int]:
    existing_ids: set[str] = set()
    if output_path.exists():
        try:
            existing_ids = {
                str(row["id"]) for row in read_jsonl(output_path) if "id" in row
            }
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            print(f"{output_path}: {exc}", file=error_stream)
            return [], 1

    rows, input_lines, invalid_lines = parse_files(
        files,
        writer=writer,
        label_version=label_version,
        existing_ids=existing_ids,
        error_stream=error_stream,
    )
    if check:
        print(
            build_check_report(rows, input_lines, benchmark_path),
            file=output_stream,
        )
    else:
        append_jsonl(output_path, rows)
        print(
            f"Imported {len(rows)} valid rows from {input_lines} input lines "
            f"into {output_path}",
            file=output_stream,
        )
    return rows, invalid_lines


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--writer", default="chatbot")
    parser.add_argument("--label-version", type=int, default=LABEL_VERSION)
    parser.add_argument(
        "--check",
        action="store_true",
        help="print validation/statistics only; never write raw.jsonl",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.writer.strip():
        print("--writer must be non-empty", file=sys.stderr)
        return 2
    _, invalid_lines = import_files(
        args.files,
        writer=args.writer,
        label_version=args.label_version,
        check=args.check,
    )
    return 1 if invalid_lines else 0


if __name__ == "__main__":
    raise SystemExit(main())
