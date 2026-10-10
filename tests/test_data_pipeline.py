"""Offline tests for training/generate.py (§6) and training/verify.py (§7). No API calls."""

import json
import random
from collections import Counter

import pytest

from training import generate as G
from training import verify as V
from training.common import HAZARD_NAMES, MEDICAL_NAMES, PRIORITY_LABELS, STATUS_LABELS, validate_row

N = 20000


@pytest.fixture(scope="module")
def specs():
    rng = random.Random(0)
    return [G.sample_spec(rng) for _ in range(N)]


def share(items, key) -> float:
    return sum(1 for x in items if x == key) / len(items)


# --- generate: §6.3 sampling ---------------------------------------------------------------


def test_priority_and_language_weights(specs):
    for label, w in G.PRIORITY_W.items():
        assert share([s["priority"] for s in specs], label) == pytest.approx(w, abs=0.015)
    for label, w in G.LANGUAGE_W.items():
        assert share([s["language"] for s in specs], label) == pytest.approx(w, abs=0.015)
    for label, w in G.LENGTH_W.items():
        assert share([s["length"] for s in specs], label) == pytest.approx(w, abs=0.015)


def test_minor_hazard_none_boost(specs):
    minor = [s["hazard"] for s in specs if s["priority"] == "Minor"]
    expected = 0.25 + 0.75 * G.HAZARD_W["NONE"]
    assert share(minor, "NONE") == pytest.approx(expected, abs=0.03)


def test_status_depends_on_priority(specs):
    for prio, weights in G.STATUS_W.items():
        sub = [s["status"] for s in specs if s["priority"] == prio]
        for status, w in weights.items():
            assert share(sub, status) == pytest.approx(w, abs=0.04)


def test_medical_counts_and_rules(specs):
    for s in specs:
        assert len(set(s["medical"])) == len(s["medical"])  # no duplicates
        assert set(s["medical"]) <= set(MEDICAL_NAMES)
        base = len(s["medical"]) - ("PREGNANCY_INFANT" in s["medical"] and s["children"] > 0)
        if s["priority"] in ("Minor", "Deceased"):
            assert len(s["medical"]) <= 2 and base <= 1
    imm = [s for s in specs if s["priority"] == "Immediate" and s["children"] == 0]
    counts = Counter(len(s["medical"]) for s in imm)
    for k, w in enumerate(G.N_MEDICAL_W["Immediate"]):
        assert counts[k] / len(imm) == pytest.approx(w, abs=0.03)


def test_third_party_and_headcount_rules(specs):
    relaying = [s for s in specs if s["style"] == G.RELAYING_STYLE]
    assert relaying and all(s["third_party"] for s in relaying)
    for s in specs:
        assert s["adults"] + s["children"] >= 1
        if not s["third_party"]:
            assert s["adults"] >= 1  # the writer is counted
        assert 0 <= s["adults"] <= 15 and 0 <= s["children"] <= 4
    deceased = [s for s in specs if s["priority"] == "Deceased" and s["style"] != G.RELAYING_STYLE]
    assert share([s["third_party"] for s in deceased], True) == pytest.approx(0.50, abs=0.04)


def test_spec_json_keys(specs):
    assert set(specs[0]) == {"id", "priority", "hazard", "status", "adults", "children", "medical",
                             "third_party", "style", "language", "length"}
    assert len(specs[0]["id"]) == 10 and int(specs[0]["id"], 16) >= 0


def test_system_prompt_has_the_rules():
    p = G.system_prompt()
    assert "{COUNT_RULE}" not in p and "{THIRD_PARTY_RULE}" not in p
    assert "including anyone deceased" in p and "NOT at the scene" in p
    assert p.endswith("with one entry per spec, in order.")


def test_rows_from_reply_joins_by_id_and_drops_bad_texts():
    rng = random.Random(1)
    specs = [G.sample_spec(rng) for _ in range(3)]
    texts = {specs[0]["id"]: "water in the attic, 2 of us", specs[1]["id"]: "", specs[2]["id"]: "x" * 601}
    rows = G.rows_from(specs, texts, "deepseek/deepseek-v4-flash-0731")
    assert len(rows) == 1 and rows[0]["id"] == "syn_" + specs[0]["id"]
    assert validate_row(rows[0]) == [] and rows[0]["label_version"] == 2


def test_call_writer_parses_fenced_json_and_drops_rejected_field(monkeypatch):
    rng = random.Random(2)
    specs = [G.sample_spec(rng) for _ in range(2)]
    calls = []

    def fake_post(path, payload, timeout=120):
        calls.append(payload)
        if "reasoning" in payload:
            raise G.OpenRouterError(400, '{"error": "unsupported parameter: reasoning"}')
        body = {"messages": [{"id": s["id"], "text": f"msg {i}"} for i, s in enumerate(specs)]}
        return {"choices": [{"message": {"content": "```json\n" + json.dumps(body) + "\n```"}}], "usage": {}}

    monkeypatch.setattr(G, "openrouter_post", fake_post)
    monkeypatch.setattr(G, "_dropped", {})
    texts, _ = G.call_writer("test/model", specs)
    assert texts == {specs[0]["id"]: "msg 0", specs[1]["id"]: "msg 1"}
    assert "reasoning" in calls[0] and "reasoning" not in calls[1]
    assert calls[1]["response_format"] == {"type": "json_object"}  # only the rejected field is dropped


# --- verify: §7 questions and keep rule ------------------------------------------------------


def test_fourteen_questions():
    q = V.questions()
    assert len(q) == 14
    assert list(q["priority"]["criteria"]) == PRIORITY_LABELS
    assert q["priority"]["criteria"]["Immediate"].startswith("RED: ")
    assert list(q["hazard"]["criteria"]) == HAZARD_NAMES
    assert list(q["status"]["criteria"]) == STATUS_LABELS
    assert list(q["adults"]["criteria"]) == [str(i) for i in range(16)] and q["adults"]["criteria"]["15"] == "15 or more"
    assert q["third_party"]["type"] == "noul" and "criteria" not in q["med_INSULIN"]


def fake_response(priority="Immediate", hazard="FLOOD", status="Trapped", adults="2", children="0",
                  tp=0.1, medical=None):
    medical = medical or {}

    def choice(options, pick):
        probs = {o: (0.9 if o == pick else 0.1 / (len(options) - 1)) for o in options}
        return {"type": "choice", "choice": pick, "probabilities": probs, "confidence": 0.9}

    answers = {"priority": choice(PRIORITY_LABELS, priority), "hazard": choice(HAZARD_NAMES, hazard),
               "status": choice(STATUS_LABELS, status), "adults": choice([str(i) for i in range(16)], adults),
               "children": choice([str(i) for i in range(16)], children),
               "third_party": {"type": "noul", "noul": tp}}
    for m in MEDICAL_NAMES:
        answers[f"med_{m}"] = {"type": "noul", "noul": medical.get(m, 0.05)}
    return {"model": V.MODEL, "answers": answers, "usage": {"input_tokens": 1, "output_tokens": 1}}


def gold_row(**kw):
    row = {"id": "syn_x", "text": "t", "triage_priority": "Immediate", "hazard_class": "FLOOD",
           "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["INSULIN"],
           "is_third_party": False, "writer": "w", "label_version": 2}
    row.update(kw)
    return row


def test_parse_answers_orders_probabilities():
    p = V.parse_answers(fake_response(medical={"INSULIN": 0.8}))
    assert p["jev_priority"][PRIORITY_LABELS.index("Immediate")] == pytest.approx(0.9)
    assert len(p["jev_hazard"]) == 16 and len(p["jev_status"]) == 4 and len(p["jev_medical"]) == 8
    assert (p["jev_adults"], p["jev_children"]) == (2, 0) and p["jev_medical"][0] == pytest.approx(0.8)


@pytest.mark.parametrize("change,reason", [
    ({"priority": "Minor"}, "priority"),
    ({"hazard": "FIRE_SMOKE"}, "hazard"),
    ({"status": "Sheltered"}, "status"),
    ({"medical": {"INSULIN": 0.2}}, "medical_missing:INSULIN"),
    ({"medical": {"INSULIN": 0.8, "BURNS": 0.7}}, "medical_extra:BURNS"),
    ({"tp": 0.9, "medical": {"INSULIN": 0.8}}, "third_party_false_but_high"),
])
def test_keep_rule_rejections(change, reason):
    row = {**gold_row(), **V.parse_answers(fake_response(**({"medical": {"INSULIN": 0.8}} | change)))}
    keep, reasons = V.judge(row)
    assert not keep and reason in reasons


def test_keep_rule_accepts_and_third_party_true():
    row = {**gold_row(), **V.parse_answers(fake_response(medical={"INSULIN": 0.8}))}
    assert V.judge(row) == (True, [])
    row = {**gold_row(is_third_party=True), **V.parse_answers(fake_response(tp=0.1, medical={"INSULIN": 0.8}))}
    assert "third_party_true_but_low" in V.judge(row)[1]


def test_old_rule_rows_are_relabeled(monkeypatch):
    monkeypatch.setattr(V, "call_jev", lambda text: fake_response(adults="3", children="1", tp=0.7,
                                                                  medical={"INSULIN": 0.8}))
    out = V.score_row(gold_row(label_version=1))
    assert out["legacy_labels"] == {"adult_count": 2, "pediatric_count": 0, "is_third_party": False}
    assert (out["adult_count"], out["pediatric_count"], out["is_third_party"]) == (3, 1, True)
    assert out["label_version"] == 2 and "keep" in out and "reject_reasons" in out


# --- prompt versions -------------------------------------------------------------------------


def test_prompt_v1_is_the_spec_prompt_and_v2_adds_the_checker_definitions():
    from training.common import MEDICAL_DESCRIPTIONS, PRIORITY_DESCRIPTIONS, STATUS_DESCRIPTIONS
    v1, v2 = G.system_prompt("v1"), G.system_prompt("v2")
    assert "Label definitions" not in v1 and v1 == G.system_prompt()
    for text in [*PRIORITY_DESCRIPTIONS.values(), *STATUS_DESCRIPTIONS.values(), *MEDICAL_DESCRIPTIONS.values()]:
        assert text in v2
    assert "if MOBILITY_IMPAIRED is not listed" in v2 and "For Deceased" in v2
    assert v2.endswith("with one entry per spec, in order.")  # the JSON contract stays last


def test_rows_record_the_prompt_version(monkeypatch):
    monkeypatch.setattr(G, "PROMPT_VERSION", "v2")
    spec = G.sample_spec(random.Random(3))
    row = G.rows_from([spec], {spec["id"]: "water rising"}, "w")[0]
    assert row["prompt_version"] == "v2"
