import io
import json
from pathlib import Path

import pytest

from training import import_chatbot as importer


def valid_row(**overrides):
    row = {
        "id": "chatA_001",
        "text": "Two adults need help near the library",
        "triage_priority": "Minor",
        "hazard_class": "NONE",
        "rescue_status": "Sheltered",
        "adult_count": 2,
        "pediatric_count": 0,
        "medical_flags": [],
        "is_third_party": False,
        "language": "English",
    }
    row.update(overrides)
    return row


def write_lines(path: Path, *lines: str) -> None:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_skips_non_json_lines_and_code_fences(tmp_path):
    source = tmp_path / "chat.txt"
    write_lines(
        source,
        "Here are the records:",
        "\x60\x60\x60json",
        json.dumps(valid_row()),
        "\x60\x60\x60",
        "Hope this helps.",
    )

    rows, input_lines, invalid_lines = importer.parse_files([source])

    assert input_lines == 5
    assert invalid_lines == 0
    assert [row["id"] for row in rows] == ["chat_chatbot_chatA_001"]


def test_reports_malformed_line_as_file_and_line(tmp_path):
    source = tmp_path / "broken.txt"
    write_lines(source, "ordinary prose", "{not valid json}")
    errors = io.StringIO()

    rows, _, invalid_lines = importer.parse_files(
        [source], error_stream=errors
    )

    assert rows == []
    assert invalid_lines == 1
    assert f"{source}:2:" in errors.getvalue()
    assert "malformed JSON" in errors.getvalue()


@pytest.mark.parametrize(
    ("changes", "field"),
    [
        ({"triage_priority": "Critical"}, "triage_priority"),
        ({"hazard_class": "VOLCANO"}, "hazard_class"),
        ({"rescue_status": "Safe"}, "rescue_status"),
        ({"language": "French"}, "language"),
        ({"adult_count": -1}, "adult_count"),
        ({"pediatric_count": 16}, "pediatric_count"),
        ({"adult_count": True}, "adult_count"),
        ({"is_third_party": 1}, "is_third_party"),
        ({"medical_flags": ["NOT_A_FLAG"]}, "medical_flags"),
        ({"medical_flags": "INSULIN"}, "medical_flags"),
    ],
)
def test_rejects_bad_vocab_counts_and_boolean(
    tmp_path, changes, field
):
    source = tmp_path / "invalid.txt"
    write_lines(source, json.dumps(valid_row(**changes)))
    errors = io.StringIO()

    rows, _, invalid_lines = importer.parse_files(
        [source], error_stream=errors
    )

    assert rows == []
    assert invalid_lines == 1
    assert f"{source}:1:" in errors.getvalue()
    assert field in errors.getvalue()


def test_prefixes_ids_sets_metadata_and_skips_batch_duplicates(tmp_path):
    source = tmp_path / "duplicates.txt"
    row = json.dumps(valid_row())
    write_lines(source, row, row)

    rows, _, invalid_lines = importer.parse_files(
        [source], writer="reviewer", label_version=7
    )

    assert invalid_lines == 0
    assert len(rows) == 1
    assert rows[0]["id"] == "chat_reviewer_chatA_001"
    assert rows[0]["writer"] == "reviewer"
    assert rows[0]["label_version"] == 7


def test_skips_id_already_in_raw_jsonl(tmp_path):
    source = tmp_path / "chat.txt"
    output = tmp_path / "raw.jsonl"
    write_lines(source, json.dumps(valid_row()))
    write_lines(output, json.dumps({"id": "chat_chatbot_chatA_001"}))
    output_before = output.read_text(encoding="utf-8")

    rows, invalid_lines = importer.import_files(
        [source], output_path=output
    )

    assert rows == []
    assert invalid_lines == 0
    assert output.read_text(encoding="utf-8") == output_before


def test_sorts_and_deduplicates_medical_flags(tmp_path):
    source = tmp_path / "flags.txt"
    write_lines(
        source,
        json.dumps(
            valid_row(
                medical_flags=["OXYGEN", "INSULIN", "OXYGEN"]
            )
        ),
    )

    rows, _, invalid_lines = importer.parse_files([source])

    assert invalid_lines == 0
    assert rows[0]["medical_flags"] == ["INSULIN", "OXYGEN"]


def test_check_mode_writes_report_but_not_raw_jsonl(tmp_path):
    source = tmp_path / "chat.txt"
    output = tmp_path / "raw.jsonl"
    report = io.StringIO()
    write_lines(source, "prose", json.dumps(valid_row()))

    rows, invalid_lines = importer.import_files(
        [source],
        check=True,
        output_path=output,
        benchmark_path=tmp_path / "missing.jsonl",
        output_stream=report,
    )

    assert invalid_lines == 0
    assert len(rows) == 1
    assert not output.exists()
    assert "Valid rows: 1 / 2 input lines" in report.getvalue()
    assert "Label mix:" in report.getvalue()
    assert "Word-count spread:" in report.getvalue()


def test_identifies_similarity_above_appendix_a_threshold(tmp_path):
    benchmark = tmp_path / "benchmark_dataset.jsonl"
    benchmark_text = (
        "We are trapped under fallen concrete beside the school"
    )
    write_lines(
        benchmark,
        json.dumps(
            {
                "id": "appendix-a-1",
                "text": benchmark_text,
            }
        ),
    )
    rows = [
        valid_row(
            id="candidate",
            text="We are trapped under fallen concrete beside school",
        )
    ]

    matches = importer.find_benchmark_contamination(rows, benchmark)

    assert len(matches) == 1
    assert matches[0][0] == "candidate"
    assert matches[0][1] == "appendix-a-1"
    assert matches[0][2] > 0.55


def test_compares_with_every_benchmark_test_message(tmp_path):
    benchmark = tmp_path / "benchmark_dataset.jsonl"
    write_lines(
        benchmark,
        json.dumps({"id": "one", "text": "completely unrelated"}),
        json.dumps(
            {
                "id": "two",
                "text": "smoke filling room cannot breathe",
            }
        ),
    )
    rows = [
        valid_row(
            id="candidate",
            text="smoke filling the room cannot breathe",
        )
    ]

    matches = importer.find_benchmark_contamination(rows, benchmark)

    assert [match[1] for match in matches] == ["two"]


def test_appendix_a_threshold_is_strict(tmp_path, monkeypatch):
    benchmark = tmp_path / "benchmark_dataset.jsonl"
    write_lines(
        benchmark, json.dumps({"id": "test-1", "text": "benchmark"})
    )
    monkeypatch.setattr(
        importer, "similarity_ratio", lambda _left, _right: 0.55
    )

    assert importer.find_benchmark_contamination(
        [valid_row()], benchmark
    ) == []


def test_reports_intra_batch_near_duplicates():
    rows = [
        valid_row(id="first", text="water rising fast in the attic"),
        valid_row(id="second", text="water rising fast in attic"),
    ]

    matches = importer.find_near_duplicates(rows)

    assert len(matches) == 1
    assert matches[0][2] > 0.70
