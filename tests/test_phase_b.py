"""Phase B pipeline tests (MASTER_PROMPT §5.2–5.3, §9, §11.2) on a tiny random BERT.

The tiny model has random weights, so these check plumbing and the §9 rules, not accuracy.
"""

import argparse
import json
import random

import numpy as np
import pytest
import torch

from src.schema import TriageSlotResult
from training import train as T
from training.common import HAZARD_NAMES, MEDICAL_NAMES, PRIORITY_LABELS, STATUS_LABELS

BASE = "BAAI/bge-small-en-v1.5"


@pytest.fixture(scope="module")
def tiny_base(tmp_path_factory):
    """A 2-layer, 32-hidden BERT with bge-small's tokenizer, saved like a Hugging Face model."""
    transformers = pytest.importorskip("transformers")
    try:
        tok = transformers.AutoTokenizer.from_pretrained(BASE, local_files_only=True)
    except OSError:
        pytest.skip("bge-small tokenizer not in the local Hugging Face cache")
    path = tmp_path_factory.mktemp("tiny-bert")
    cfg = transformers.BertConfig(vocab_size=tok.vocab_size, hidden_size=32, num_hidden_layers=2,
                                  num_attention_heads=2, intermediate_size=64, max_position_embeddings=512)
    torch.manual_seed(0)
    transformers.BertModel(cfg).save_pretrained(str(path))
    tok.save_pretrained(str(path))
    return str(path)


def make_row(i: int, writer: str, rng: random.Random, jev: bool) -> dict:
    meds = rng.sample(MEDICAL_NAMES, rng.choice([0, 0, 1, 2]))
    row = {
        "id": f"{writer}_{i:03d}", "text": f"message {i} from {writer}: water rising, {i % 5} people, help",
        "triage_priority": rng.choice(PRIORITY_LABELS), "hazard_class": rng.choice(HAZARD_NAMES),
        "rescue_status": rng.choice(STATUS_LABELS), "adult_count": 1 + i % 4, "pediatric_count": i % 2,
        "medical_flags": meds, "is_third_party": i % 4 == 0, "writer": writer, "label_version": 2,
    }
    if i % 7 == 0:
        row["triage_priority"] = "Immediate"
    if jev:
        row.update(jev_priority=list(np.random.default_rng(i).dirichlet(np.ones(4))),
                   jev_hazard=list(np.random.default_rng(i).dirichlet(np.ones(16))),
                   jev_status=list(np.random.default_rng(i).dirichlet(np.ones(4))),
                   jev_medical=list(np.random.default_rng(i).uniform(size=8)),
                   jev_third_party=float(np.random.default_rng(i).uniform()), keep=True)
    return row


# --- §9 rules -----------------------------------------------------------------------------


def test_soft_targets_mix_one_hot_and_jev():
    row = make_row(1, "w", random.Random(0), jev=True)
    t = T.targets(row)
    for head, n in (("priority", 4), ("hazard", 16), ("status", 4)):
        assert t[head].shape == (n,) and abs(t[head].sum() - 1) < 1e-5
    idx = PRIORITY_LABELS.index(row["triage_priority"])
    assert t["priority"][idx] >= 0.7  # 0.7 one-hot + 0.3 × Jev's probability
    hard = {k: v for k, v in row.items() if not k.startswith("jev_")}
    assert T.targets(hard)["priority"][idx] == 1.0  # rows without Jev scores use the hard label


def test_pos_weight_is_clamped_1_to_4():
    rng = random.Random(0)
    rows = [make_row(i, "w", rng, jev=False) for i in range(40)]
    for r in rows:
        r["medical_flags"] = []
    rows[0]["medical_flags"] = ["INSULIN"]                  # 1/40 positive → 39 → clamp to 4
    for r in rows[:30]:
        r["medical_flags"] = r["medical_flags"] + ["OXYGEN"]  # 30/40 → 0.33 → clamp to 1
    med, tp = T.pos_weights(rows)
    assert med[0] == pytest.approx(4.0) and med[1] == pytest.approx(1.0)
    assert 1.0 <= float(tp[0]) <= 4.0


def test_red_threshold_is_highest_t_reaching_95_recall():
    # 20 gold Reds with P(Red) spread 0.06..0.98; one non-Red.
    p_red = np.r_[np.linspace(0.06, 0.98, 20), 0.9]
    logits = {"priority": np.log(np.c_[(1 - p_red) / 3, (1 - p_red) / 3, p_red, (1 - p_red) / 3])}
    labels = {"priority": np.r_[np.full(20, 2), 0]}
    t, recall = T.tune_red_threshold(logits, labels)
    assert recall >= 0.95
    assert (p_red[:20] >= round(t + 0.01, 2)).mean() < 0.95 or t == 0.50  # the next step up would fail


def test_binary_threshold_rules():
    gold = np.array([1, 1, 0, 0, 0, 0], dtype=np.float32)
    assert T.tune_binary_threshold(np.array([0.9, 0.8, 0.1, 0.2, 0.3, 0.1]), gold) == 0.5  # < 3 positives
    gold = np.array([1, 1, 1, 0, 0, 0], dtype=np.float32)
    probs = np.array([0.95, 0.9, 0.85, 0.05, 0.05, 0.05])
    assert T.tune_binary_threshold(probs, gold) == 0.5  # every t in 0.10…0.80 ties at F1 1 → closest to 0.5


def test_loss_weights_double_missed_reds():
    logits = {"priority": torch.zeros(1, 4), "hazard": torch.zeros(1, 16), "status": torch.zeros(1, 4),
              "medical": torch.zeros(1, 8), "third_party": torch.zeros(1)}
    def tgt(prio):
        return {"priority": torch.eye(4)[[prio]], "hazard": torch.eye(16)[[0]], "status": torch.eye(4)[[0]],
                "medical": torch.zeros(1, 8), "third_party": torch.zeros(1)}
    ones = torch.ones(8), torch.ones(1)
    _, red = T.total_loss(logits, tgt(2), *ones)
    _, minor = T.total_loss(logits, tgt(0), *ones)
    assert red["priority"] == pytest.approx(2 * minor["priority"])


# --- end to end: train → extractor → export → ship decision inputs --------------------------------


@pytest.fixture
def data_files(tmp_path, monkeypatch):
    rng = random.Random(0)
    synth = [make_row(i, "deepseek", rng, jev=True) for i in range(48)]
    chat = [make_row(i, "chatbot", rng, jev=False) for i in range(20)]
    raw, scored = tmp_path / "raw.jsonl", tmp_path / "scored.jsonl"
    raw.write_text("".join(json.dumps(r) + "\n" for r in synth + chat))
    scored.write_text("".join(json.dumps(r) + "\n" for r in synth))
    monkeypatch.setattr(T, "RAW_PATH", raw)
    import training.export_onnx as E
    monkeypatch.setattr(E, "RAW_PATH", raw)
    return scored


def test_train_extract_and_export(tiny_base, data_files, tmp_path):
    out = tmp_path / "triage-tiny"
    args = argparse.Namespace(base_model=tiny_base, out=out, val_writer="chatbot", unverified=False, writer=None,
                              scored=data_files, epochs=2, device="cpu")
    T.train(args)

    cfg = json.loads((out / "config.json").read_text())
    assert cfg["train_rows"] == 48 and cfg["val_rows"] == 20  # every chatbot row held out
    assert 0.05 <= cfg["red_threshold"] <= 0.50
    assert len(cfg["medical_thresholds"]) == 8
    assert cfg["test_metrics"]["n"] == 54  # Appendix A scored at the end, "never trained on"
    assert (out / "model.pt").exists() and (out / "encoder" / "config.json").exists()

    from src.models.triage_classifier import FinetunedTriageExtractor
    ext = FinetunedTriageExtractor(out)
    slots = ext.extract("Water is rising fast, 2 of us trapped in attic, mom needs insulin")
    assert isinstance(slots, TriageSlotResult) and slots.medical_flags & 1  # keyword backstop OR'd in
    r = ext.classify("anything")
    assert len(r["medicalProbs"]) == 8 and 0 <= r["thirdPartyProb"] <= 1

    from training import export_onnx as E
    E.export_stage2(argparse.Namespace(model_dir=out, out=E.WEB_MODEL_DIR, per_channel=True))
    web = out / "web"
    mj = json.loads((web / "model.json").read_text())
    assert mj["kind"] == "classifier" and mj["red_threshold"] == cfg["red_threshold"]
    assert (web / "classifier.onnx.gz").exists() and (web / "tokenizer.json").exists()
    q = FinetunedTriageExtractor(out, onnx_path=web / "classifier.onnx.gz")
    assert q.classify("anything")["priority"] in range(4)
    report = json.loads((web / "export_report.json").read_text())
    assert report["n"] == 20 and 0 <= report["decoded_field_match"] <= 1


def test_refuses_to_train_on_the_test_set(tiny_base, data_files, tmp_path):
    from training.common import load_benchmark, read_jsonl
    rows = read_jsonl(data_files)
    rows[0]["text"] = load_benchmark()[0]["text"]
    data_files.write_text("".join(json.dumps(r) + "\n" for r in rows))
    args = argparse.Namespace(base_model=tiny_base, out=tmp_path / "x", val_writer="chatbot", unverified=False,
                              writer=None, scored=data_files, epochs=1, device="cpu")
    with pytest.raises(SystemExit, match="Appendix A"):
        T.train(args)
