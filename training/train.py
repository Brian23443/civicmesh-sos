"""Fine-tunes the Stage 2 classifier (MASTER_PROMPT §9).

    python3 -m training.train --val-writer chatbot --base-model BAAI/bge-small-en-v1.5 --out models/triage-bge-small
    python3 -m training.train --val-writer chatbot --out models/triage-minilm      # default base: MiniLM-L6
    python3 -m training.train --unverified [--writer X] --out models/scratch     # quick experiments only

Data: kept rows of data/synthetic/scored.jsonl. With --val-writer chatbot every chatbot row
is held out for validation (it picks the best epoch and tunes every threshold); without
it, a 10% md5-hash split. Appendix A is read only at the very end, for the "never trained
on" test metrics.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import random
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from src.models.embedder import MAX_LENGTH
from src.models.triage_classifier import HEADS, RED, TriageClassifier, sigmoid, softmax
from training.common import (
    BENCHMARK_PATH,
    HAZARD_NAMES,
    MEDICAL_NAMES,
    PRIORITY_LABELS,
    RAW_PATH,
    SCORED_PATH,
    STATUS_LABELS,
    hazard_index,
    medical_vector,
    priority_index,
    read_jsonl,
    status_index,
)

DEFAULT_BASE = "sentence-transformers/all-MiniLM-L6-v2"
HYPERPARAMS = {
    "encoder_lr": 5e-5, "heads_lr": 1e-3, "weight_decay": 0.01, "warmup": 0.06, "grad_clip": 1.0,
    "batch_size": 32, "dropout": 0.1, "max_length": MAX_LENGTH, "seed": 0,
    "soft_target": {"one_hot": 0.7, "jev": 0.3},
    "priority_class_weights": [1.0, 1.0, 2.0, 1.0],  # Minor, Delayed, Immediate, Deceased
    "loss_weights": {"priority": 2.0, "hazard": 1.0, "status": 1.0, "medical": 1.0, "third_party": 0.5},
    "pos_weight_clamp": [1.0, 4.0],
}
SMALL_DATA_ROWS = 1000  # §9: 4 epochs for ~5,000 rows; 15 for a few hundred


# --- data -------------------------------------------------------------------------


def md5_val(row_id: str, pct: int = 10) -> bool:
    return int(hashlib.md5(row_id.encode()).hexdigest(), 16) % 100 < pct


def load_data(args: argparse.Namespace) -> tuple[list[dict], list[dict]]:
    if args.unverified:
        rows = read_jsonl(RAW_PATH)
        if args.writer:
            rows = [r for r in rows if r.get("writer") == args.writer or r.get("writer") == args.val_writer]
    else:
        rows = [r for r in read_jsonl(args.scored) if r.get("keep")]
    if args.val_writer:
        # Every row from the validation writer is held out — even ones the checker didn't score.
        val_ids = {r["id"] for r in read_jsonl(RAW_PATH) if r.get("writer") == args.val_writer}
        val = [r for r in read_jsonl(RAW_PATH) if r["id"] in val_ids]
        train = [r for r in rows if r.get("writer") != args.val_writer and r["id"] not in val_ids]
    else:
        train = [r for r in rows if not md5_val(r["id"])]
        val = [r for r in rows if md5_val(r["id"])]
    bench = {r["text"] for r in read_jsonl(BENCHMARK_PATH)}
    leaked = [r["id"] for r in train if r["text"] in bench]
    if leaked:
        raise SystemExit(f"refusing to train: {len(leaked)} training rows are Appendix A messages: {leaked[:5]}")
    return train, val


def _normalize(p: list[float]) -> np.ndarray:
    a = np.asarray(p, dtype=np.float32)
    s = a.sum()
    return a / s if s > 0 else a


def targets(row: dict) -> dict[str, np.ndarray]:
    """§9 soft targets: 0.7 × one_hot(intended) + 0.3 × Jev's probabilities (normalised).
    Rows without Jev scores use the hard label."""
    w1, w2 = HYPERPARAMS["soft_target"]["one_hot"], HYPERPARAMS["soft_target"]["jev"]

    def soft(n: int, idx: int, jev: list[float] | None) -> np.ndarray:
        one_hot = np.eye(n, dtype=np.float32)[idx]
        return one_hot if jev is None else _normalize(list(w1 * one_hot + w2 * _normalize(jev)))

    med = np.asarray(medical_vector(row["medical_flags"]), dtype=np.float32)
    if row.get("jev_medical") is not None:
        med = w1 * med + w2 * np.asarray(row["jev_medical"], dtype=np.float32)
    tp = float(row["is_third_party"])
    if row.get("jev_third_party") is not None:
        tp = w1 * tp + w2 * float(row["jev_third_party"])
    return {
        "priority": soft(4, priority_index(row["triage_priority"]), row.get("jev_priority")),
        "hazard": soft(16, hazard_index(row["hazard_class"]), row.get("jev_hazard")),
        "status": soft(4, status_index(row["rescue_status"]), row.get("jev_status")),
        "medical": med,
        "third_party": np.float32(tp),
    }


def hard_labels(rows: list[dict]) -> dict[str, np.ndarray]:
    return {
        "priority": np.array([priority_index(r["triage_priority"]) for r in rows]),
        "hazard": np.array([hazard_index(r["hazard_class"]) for r in rows]),
        "status": np.array([status_index(r["rescue_status"]) for r in rows]),
        "medical": np.array([medical_vector(r["medical_flags"]) for r in rows], dtype=np.float32),
        "third_party": np.array([float(r["is_third_party"]) for r in rows], dtype=np.float32),
    }


def pos_weights(rows: list[dict]) -> tuple[torch.Tensor, torch.Tensor]:
    """pos_weight = clamp((N − positives) / positives, 1, 4), per label, from the training rows."""
    lo, hi = HYPERPARAMS["pos_weight_clamp"]
    labels = hard_labels(rows)
    n = len(rows)

    def pw(pos: np.ndarray) -> np.ndarray:
        return np.clip((n - pos) / np.maximum(pos, 1), lo, hi)

    med = pw(labels["medical"].sum(axis=0))
    tp = pw(np.array([labels["third_party"].sum()]))
    return torch.tensor(med, dtype=torch.float32), torch.tensor(tp, dtype=torch.float32)


# --- loss ---------------------------------------------------------------------------


def soft_ce(logits: torch.Tensor, target: torch.Tensor, class_weights: torch.Tensor | None = None) -> torch.Tensor:
    """−Σ target · w · log_softmax, averaged over the batch."""
    logp = F.log_softmax(logits, dim=-1)
    w = class_weights if class_weights is not None else torch.ones(logits.shape[-1], device=logits.device)
    return -(target * w * logp).sum(dim=-1).mean()


def total_loss(logits: dict[str, torch.Tensor], tgt: dict[str, torch.Tensor], pw_med: torch.Tensor,
               pw_tp: torch.Tensor) -> tuple[torch.Tensor, dict[str, float]]:
    cw = torch.tensor(HYPERPARAMS["priority_class_weights"], device=logits["priority"].device)
    parts = {
        "priority": soft_ce(logits["priority"], tgt["priority"], cw),
        "hazard": soft_ce(logits["hazard"], tgt["hazard"]),
        "status": soft_ce(logits["status"], tgt["status"]),
        "medical": F.binary_cross_entropy_with_logits(logits["medical"], tgt["medical"], pos_weight=pw_med),
        "third_party": F.binary_cross_entropy_with_logits(logits["third_party"], tgt["third_party"],
                                                          pos_weight=pw_tp),
    }
    lw = HYPERPARAMS["loss_weights"]
    total = sum(lw[k] * v for k, v in parts.items())
    return total, {k: v.item() for k, v in parts.items()}


# --- evaluation helpers ------------------------------------------------------------------


@torch.no_grad()
def predict_logits(model: TriageClassifier, tokenizer, texts: list[str], device: str,
                   batch_size: int = 64) -> dict[str, np.ndarray]:
    model.eval()
    out: dict[str, list[np.ndarray]] = {k: [] for k in HEADS}
    for i in range(0, len(texts), batch_size):
        enc = tokenizer(texts[i:i + batch_size], truncation=True, max_length=MAX_LENGTH, padding=True,
                        return_tensors="pt")
        res = model(enc["input_ids"].to(device), enc["attention_mask"].to(device))
        for k in HEADS:
            out[k].append(res[k].float().cpu().numpy())
    return {k: np.concatenate(v) for k, v in out.items()}


def f1(y: np.ndarray, p: np.ndarray) -> float | None:
    tp = float((y * p).sum())
    fp = float(((1 - y) * p).sum())
    fn = float((y * (1 - p)).sum())
    return 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else None


def epoch_metrics(logits: dict[str, np.ndarray], labels: dict[str, np.ndarray]) -> dict[str, Any]:
    """Validation metrics at threshold 0.5 (§9 best-epoch score)."""
    pri = softmax(logits["priority"]).argmax(-1)
    red_gold = labels["priority"] == RED
    m = {
        "priority_acc": float((pri == labels["priority"]).mean()),
        "red_recall": float((pri[red_gold] == RED).mean()) if red_gold.any() else 0.0,
        "hazard_acc": float((logits["hazard"].argmax(-1) == labels["hazard"]).mean()),
        "status_acc": float((logits["status"].argmax(-1) == labels["status"]).mean()),
        "medical_f1": f1(labels["medical"], (sigmoid(logits["medical"]) >= 0.5).astype(np.float32)) or 0.0,
    }
    m["score"] = float(np.mean([m["priority_acc"], m["red_recall"], m["hazard_acc"], m["status_acc"],
                                m["medical_f1"]]))
    return m


def tune_red_threshold(logits: dict[str, np.ndarray], labels: dict[str, np.ndarray]) -> tuple[float, float]:
    """Highest t in 0.05…0.50 (step 0.01) with validation Red recall ≥ 0.95; else 0.05."""
    p_red = softmax(logits["priority"])[:, RED]
    gold = labels["priority"] == RED
    if not gold.any():
        return 0.05, float("nan")
    for t in [round(x, 2) for x in np.arange(0.50, 0.0499, -0.01)]:
        recall = float((p_red[gold] >= t).mean())
        if recall >= 0.95:
            return float(t), recall
    return 0.05, float((p_red[gold] >= 0.05).mean())


def tune_binary_threshold(probs: np.ndarray, gold: np.ndarray) -> float:
    """t in 0.10…0.90 (step 0.05) with the best F1; ties → closest to 0.5; 0.5 if < 3 positives."""
    if gold.sum() < 3:
        return 0.5
    best_t, best_f1 = 0.5, -1.0
    for t in [round(x, 2) for x in np.arange(0.10, 0.9001, 0.05)]:
        score = f1(gold, (probs >= t).astype(np.float32)) or 0.0
        if score > best_f1 + 1e-12 or (abs(score - best_f1) <= 1e-12 and abs(t - 0.5) < abs(best_t - 0.5)):
            best_t, best_f1 = t, score
    return float(best_t)


# --- training ------------------------------------------------------------------------------


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def collate(rows: list[dict], tokenizer, device: str) -> tuple[torch.Tensor, torch.Tensor, dict[str, torch.Tensor]]:
    enc = tokenizer([r["text"] for r in rows], truncation=True, max_length=MAX_LENGTH, padding=True,
                    return_tensors="pt")
    tg = [targets(r) for r in rows]
    tgt = {k: torch.tensor(np.stack([t[k] for t in tg]), dtype=torch.float32, device=device) for k in HEADS}
    return enc["input_ids"].to(device), enc["attention_mask"].to(device), tgt


def train(args: argparse.Namespace) -> Path:
    from transformers import AutoTokenizer, get_linear_schedule_with_warmup  # noqa: PLC0415

    seed_everything(HYPERPARAMS["seed"])
    train_rows, val_rows = load_data(args)
    if not train_rows or not val_rows:
        raise SystemExit(f"need training and validation rows (train={len(train_rows)}, val={len(val_rows)})")
    epochs = args.epochs or (15 if len(train_rows) < SMALL_DATA_ROWS else 4)
    device = args.device or pick_device()
    print(f"train {len(train_rows)} rows, val {len(val_rows)} rows "
          f"({'writer=' + args.val_writer if args.val_writer else '10% md5 split'}), {epochs} epochs on {device}")

    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    model = TriageClassifier(args.base_model, dropout=HYPERPARAMS["dropout"]).to(device)
    pw_med, pw_tp = (t.to(device) for t in pos_weights(train_rows))

    head_params = [p for n, p in model.named_parameters() if n.startswith("heads.")]
    enc_params = [p for n, p in model.named_parameters() if not n.startswith("heads.")]
    opt = torch.optim.AdamW([
        {"params": enc_params, "lr": HYPERPARAMS["encoder_lr"]},
        {"params": head_params, "lr": HYPERPARAMS["heads_lr"]},
    ], weight_decay=HYPERPARAMS["weight_decay"])
    bs = HYPERPARAMS["batch_size"]
    steps = epochs * ((len(train_rows) + bs - 1) // bs)
    sched = get_linear_schedule_with_warmup(opt, int(HYPERPARAMS["warmup"] * steps), steps)

    val_texts = [r["text"] for r in val_rows]
    val_labels = hard_labels(val_rows)
    best: dict[str, Any] = {"score": -1.0}
    rng = random.Random(HYPERPARAMS["seed"])
    for epoch in range(1, epochs + 1):
        model.train()
        order = train_rows[:]
        rng.shuffle(order)
        t0, running = time.time(), 0.0
        for i in range(0, len(order), bs):
            ids, mask, tgt = collate(order[i:i + bs], tokenizer, device)
            loss, _ = total_loss(model(ids, mask), tgt, pw_med, pw_tp)
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), HYPERPARAMS["grad_clip"])
            opt.step()
            sched.step()
            running += float(loss) * len(order[i:i + bs])
        m = epoch_metrics(predict_logits(model, tokenizer, val_texts, device), val_labels)
        print(f"epoch {epoch}/{epochs}  loss {running / len(order):.4f}  val score {m['score']:.4f}  "
              f"priority {m['priority_acc']:.3f}  Red recall {m['red_recall']:.3f}  hazard {m['hazard_acc']:.3f}  "
              f"status {m['status_acc']:.3f}  medical F1 {m['medical_f1']:.3f}  ({time.time() - t0:.0f}s)")
        if m["score"] > best["score"]:
            best = {"score": m["score"], "epoch": epoch, "metrics": m,
                    "state": {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}}

    model.load_state_dict(best["state"])
    model.to(device)
    print(f"best epoch {best['epoch']} (val score {best['score']:.4f})")

    # Thresholds, all tuned on validation with the best weights.
    val_logits = predict_logits(model, tokenizer, val_texts, device)
    red_t, red_recall = tune_red_threshold(val_logits, val_labels)
    med_probs = sigmoid(val_logits["medical"])
    med_t = [tune_binary_threshold(med_probs[:, i], val_labels["medical"][:, i]) for i in range(8)]
    tp_t = tune_binary_threshold(sigmoid(val_logits["third_party"]), val_labels["third_party"])
    print(f"red_threshold {red_t} (val Red recall {red_recall:.3f}), medical_thresholds {med_t}, "
          f"third_party_threshold {tp_t}")

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    torch.save(best["state"], out / "model.pt")
    tokenizer.save_pretrained(str(out))
    model.encoder.config.save_pretrained(str(out / "encoder"))
    cfg = {
        "base_model": args.base_model,
        "red_threshold": red_t,
        "medical_thresholds": med_t,
        "third_party_threshold": tp_t,
        "labels": {"priority": PRIORITY_LABELS, "hazard": HAZARD_NAMES, "status": STATUS_LABELS,
                   "medical": MEDICAL_NAMES},
        "train_rows": len(train_rows),
        "val_rows": len(val_rows),
        "best_epoch": best["epoch"],
        "hyperparams": {**HYPERPARAMS, "epochs": epochs, "device": device, "val_writer": args.val_writer,
                        "unverified": args.unverified},
        "val_metrics": {}, "test_metrics": {},
    }
    (out / "config.json").write_text(json.dumps(cfg, indent=2) + "\n")

    # Final metrics through the real extractor (decoding + resolvers), like evaluate_dataset.
    from benchmark.evaluate_dataset import compute  # noqa: PLC0415
    from src.models.triage_classifier import FinetunedTriageExtractor  # noqa: PLC0415

    extractor = FinetunedTriageExtractor(out)
    val_m = compute(val_rows, extractor.extract_many(val_texts))
    bench_rows = read_jsonl(BENCHMARK_PATH)
    test_m = compute(bench_rows, extractor.extract_many([r["text"] for r in bench_rows]))
    keep = ("n", "red_recall", "red_precision", "whole_summary_acc", "priority_acc", "hazard_acc", "status_acc",
            "headcount_exact", "medical_exact_set", "medical_f1_micro", "third_party_acc")
    cfg["val_metrics"] = {k: val_m[k] for k in keep}
    cfg["test_metrics"] = {k: test_m[k] for k in keep}
    (out / "config.json").write_text(json.dumps(cfg, indent=2) + "\n")

    def show(name: str, m: dict) -> None:
        def p(x):
            return "n/a" if x is None else f"{100 * x:.1f}%"
        print(f"{name}: n={m['n']}  Red recall {p(m['red_recall'])}  Red precision {p(m['red_precision'])}  "
              f"whole-summary {p(m['whole_summary_acc'])}  priority {p(m['priority_acc'])}  hazard {p(m['hazard_acc'])}  "
              f"status {p(m['status_acc'])}  headcount {p(m['headcount_exact'])}  medical set {p(m['medical_exact_set'])}  "
              f"third-party {p(m['third_party_acc'])}")

    show("validation", val_m)
    show("TEST (Appendix A, never trained on)", test_m)
    print(f"saved {out}")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune the Stage 2 triage classifier (§9)")
    parser.add_argument("--base-model", default=DEFAULT_BASE)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--val-writer", help="hold out every row from this writer for validation (use: chatbot)")
    parser.add_argument("--unverified", action="store_true", help="train on raw.jsonl without the checker")
    parser.add_argument("--writer", help="with --unverified: only this writer's rows")
    parser.add_argument("--scored", type=Path, default=SCORED_PATH)
    parser.add_argument("--epochs", type=int, help="default: 4 for ≥1,000 rows, 15 for fewer")
    parser.add_argument("--device", choices=["mps", "cuda", "cpu"])
    train(parser.parse_args())


if __name__ == "__main__":
    main()
