"""Stage 2: fine-tuned multi-head classifier (MASTER_PROMPT §5.1–5.3).

    TriageClassifier(base_model)       encoder + masked mean pooling + dropout 0.1 + 5 linear heads
    FinetunedTriageExtractor(model_dir) loads config.json, the tokenizer and model.pt; same interface
                                        as the Stage 1 PrototypeClassifier (classify / extract).
"""

from __future__ import annotations

import gzip
import json
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn

from src.models.embedder import MAX_LENGTH, mean_pool
from src.models.resolvers import resolve_headcount, resolve_location, resolve_medical
from src.schema import (
    HazardClass,
    LocationConfidenceType,
    MedicalFlags,
    RescueStatus,
    TriagePriority,
    TriageSlotResult,
)

HEADS = {"priority": 4, "hazard": 16, "status": 4, "medical": 8, "third_party": 1}
HEAD_ORDER = list(HEADS)  # ONNX output order: priority, hazard, status, medical, third_party
RED = int(TriagePriority.IMMEDIATE)


class TriageClassifier(nn.Module):
    def __init__(self, base_model: str, dropout: float = 0.1, encoder: nn.Module | None = None):
        super().__init__()
        if encoder is None:
            from transformers import AutoModel  # noqa: PLC0415

            encoder = AutoModel.from_pretrained(base_model)
        self.encoder = encoder
        hidden = self.encoder.config.hidden_size
        self.dropout = nn.Dropout(dropout)
        self.heads = nn.ModuleDict({name: nn.Linear(hidden, n) for name, n in HEADS.items()})

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> dict[str, torch.Tensor]:
        out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        pooled = self.dropout(mean_pool(out.last_hidden_state, attention_mask))
        logits = {name: head(pooled) for name, head in self.heads.items()}
        logits["third_party"] = logits["third_party"].squeeze(-1)
        return logits


class ExportWrapper(nn.Module):
    """Returns the 5 logit tensors as a tuple, in HEAD_ORDER, for ONNX export (§11.2)."""

    def __init__(self, model: TriageClassifier):
        super().__init__()
        self.model = model

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor):
        logits = self.model(input_ids, attention_mask)
        return tuple(logits[name] for name in HEAD_ORDER)


# --- decoding (§5.3) ---------------------------------------------------------------


def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def decode_logits(logits: dict[str, np.ndarray], cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Batch logits → K4 classify() results, using the thresholds in config.json / model.json."""
    p_pri = softmax(logits["priority"])
    p_haz = softmax(logits["hazard"])
    p_sta = softmax(logits["status"])
    p_med = sigmoid(logits["medical"])
    p_tp = sigmoid(logits["third_party"].reshape(-1))
    out = []
    for i in range(len(p_pri)):
        if p_pri[i, RED] >= cfg["red_threshold"]:
            priority = RED
        else:
            others = [k for k in range(4) if k != RED]
            priority = max(others, key=lambda k: p_pri[i, k])
        out.append({
            "priority": int(priority),
            "hazard": int(p_haz[i].argmax()),
            "status": int(p_sta[i].argmax()),
            "medicalProbs": [float(x) for x in p_med[i]],
            "thirdPartyProb": float(p_tp[i]),
            "scores": {"priority": [float(x) for x in p_pri[i]], "hazard": [float(x) for x in p_haz[i]],
                       "status": [float(x) for x in p_sta[i]]},
        })
    return out


class FinetunedTriageExtractor:
    """Loads models/triage-<name>/ (config.json, tokenizer, model.pt), or an exported
    classifier.onnx(.gz) via `onnx_path`, and decodes per §5.3."""

    def __init__(self, model_dir: str | Path, onnx_path: str | Path | None = None, device: str = "cpu"):
        from transformers import AutoConfig, AutoModel, AutoTokenizer  # noqa: PLC0415

        self.model_dir = Path(model_dir)
        self.cfg = json.loads((self.model_dir / "config.json").read_text())
        self.tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir))
        self.device = device
        self.session = None
        if onnx_path is not None:
            import onnxruntime as ort  # noqa: PLC0415

            p = Path(onnx_path)
            data = gzip.decompress(p.read_bytes()) if p.suffix == ".gz" else p.read_bytes()
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1
            self.session = ort.InferenceSession(data, opts, providers=["CPUExecutionProvider"])
        else:
            # train.py saves the encoder's config under encoder/, so no download is needed.
            encoder = AutoModel.from_config(AutoConfig.from_pretrained(str(self.model_dir / "encoder")))
            self.model = TriageClassifier(self.cfg["base_model"], encoder=encoder)
            self.model.load_state_dict(torch.load(self.model_dir / "model.pt", map_location="cpu"))
            self.model.eval().to(device)

    @torch.no_grad()
    def logits(self, texts: list[str], batch_size: int = 32) -> dict[str, np.ndarray]:
        if self.session is not None:
            batch_size = 1  # INT8 dynamic quantization is batch-dependent; the phone runs one message
        chunks: dict[str, list[np.ndarray]] = {k: [] for k in HEAD_ORDER}
        for i in range(0, len(texts), batch_size):
            enc = self.tokenizer(texts[i:i + batch_size], truncation=True, max_length=MAX_LENGTH, padding=True,
                                 return_tensors="np" if self.session else "pt")
            if self.session is not None:
                feeds = {"input_ids": enc["input_ids"].astype(np.int64),
                         "attention_mask": enc["attention_mask"].astype(np.int64)}
                outs = dict(zip(HEAD_ORDER, self.session.run(HEAD_ORDER, feeds)))
            else:
                res = self.model(enc["input_ids"].to(self.device), enc["attention_mask"].to(self.device))
                outs = {k: v.float().cpu().numpy() for k, v in res.items()}
            for k in HEAD_ORDER:
                chunks[k].append(outs[k])
        return {k: np.concatenate(v) for k, v in chunks.items()}

    def classify_many(self, texts: list[str]) -> list[dict[str, Any]]:
        return decode_logits(self.logits(texts), self.cfg) if texts else []

    def classify(self, text: str) -> dict[str, Any]:
        return self.classify_many([text])[0]

    def to_slots(self, text: str, r: dict[str, Any], latency_ms: float | None = None) -> TriageSlotResult:
        medical = MedicalFlags.NONE
        for bit, (p, t) in enumerate(zip(r["medicalProbs"], self.cfg["medical_thresholds"])):
            if p >= t:
                medical |= MedicalFlags(1 << bit)
        medical |= resolve_medical(text)  # keyword backstop is OR'd in (§5.3)
        third_party = r["thirdPartyProb"] >= self.cfg["third_party_threshold"]  # model only
        adults, children = resolve_headcount(text)
        loc_type, loc_text, _ = resolve_location(text)
        return TriageSlotResult(
            priority=TriagePriority(r["priority"]),
            hazard=HazardClass(r["hazard"]),
            rescue_status=RescueStatus(r["status"]),
            adult_count=adults,
            pediatric_count=children,
            medical_flags=medical,
            is_third_party_report=third_party,
            location_type=loc_type if loc_type is not None else LocationConfidenceType.DIRECT_ON_SCENE,
            extracted_location_text=loc_text,
            confidence=float(r["scores"]["priority"][r["priority"]]),
            raw_text=text,
            extraction_latency_ms=latency_ms,
        )

    def extract(self, text: str) -> TriageSlotResult:
        start = time.perf_counter()
        r = self.classify(text)
        return self.to_slots(text, r, (time.perf_counter() - start) * 1000)

    def extract_many(self, texts: list[str]) -> list[TriageSlotResult]:
        return [self.to_slots(t, r) for t, r in zip(texts, self.classify_many(texts))]
