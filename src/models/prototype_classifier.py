"""Stage 1 Python reference: zero-shot prototype matching (MASTER_PROMPT §5.0).

Same interface as the Stage 2 `FinetunedTriageExtractor`:
    classify(text) -> K4 result dict {priority, hazard, status, medicalProbs, thirdPartyProb, scores}
    extract(text)  -> TriageSlotResult (classify + the §5.4 resolvers)

The browser (web/src/lib/) implements the same decoding and is parity-tested against this.
"""

from __future__ import annotations

import gzip
import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np

from src.models.resolvers import resolve_headcount, resolve_location, resolve_medical
from src.schema import HazardClass, LocationConfidenceType, RescueStatus, TriagePriority, TriageSlotResult

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_DIR = ROOT / "web" / "public" / "model"
DEFAULT_UNKNOWN_MARGIN = 0.02

PRIORITY_NAMES = [p.name for p in TriagePriority]
HAZARD_NAMES = [h.name for h in HazardClass]
STATUS_NAMES = [s.name for s in RescueStatus]

EmbedFn = Callable[[list[str]], np.ndarray]  # texts -> [n, dim] unit vectors


def torch_embed_fn(base_model: str | None = None) -> EmbedFn:
    from src.models.embedder import BASE_MODEL, TextEmbedder  # noqa: PLC0415

    emb = TextEmbedder(base_model or BASE_MODEL)
    return lambda texts: emb.embed(texts).numpy()


def onnx_embed_fn(model_dir: Path, onnx_path: Path | None = None) -> EmbedFn:
    """Embeds with the exported (INT8) ONNX graph + the tokenizer files in model_dir."""
    import onnxruntime as ort  # noqa: PLC0415
    from transformers import AutoTokenizer  # noqa: PLC0415

    path = onnx_path or (model_dir / "embedder.onnx.gz")
    data = gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    session = ort.InferenceSession(data, opts, providers=["CPUExecutionProvider"])
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))

    def embed(texts: list[str]) -> np.ndarray:
        out = []
        for i in range(0, len(texts), 32):
            enc = tokenizer(texts[i:i + 32], truncation=True, max_length=128, padding=True, return_tensors="np")
            feeds = {"input_ids": enc["input_ids"].astype(np.int64),
                     "attention_mask": enc["attention_mask"].astype(np.int64)}
            out.append(session.run(["embedding"], feeds)[0])
        return np.concatenate(out) if out else np.zeros((0, 384), dtype=np.float32)

    return embed


class PrototypeClassifier:
    def __init__(
        self,
        model_dir: str | Path = DEFAULT_MODEL_DIR,
        embed_fn: EmbedFn | None = None,
        unknown_margin: float | None = None,
    ):
        self.model_dir = Path(model_dir)
        protos = json.loads((self.model_dir / "prototypes.json").read_text())
        cfg_path = self.model_dir / "model.json"
        cfg = json.loads(cfg_path.read_text()) if cfg_path.exists() else {}
        self.unknown_margin = (unknown_margin if unknown_margin is not None
                               else cfg.get("unknown_margin", DEFAULT_UNKNOWN_MARGIN))
        self.embed_fn = embed_fn or torch_embed_fn(protos.get("base_model"))

        def matrix(field: str, names: list[str]) -> tuple[np.ndarray, list[int]]:
            idx = [i for i, n in enumerate(names) if n in protos[field]]
            return np.array([protos[field][names[i]] for i in idx], dtype=np.float32), idx

        self.p_mat, self.p_idx = matrix("priority", PRIORITY_NAMES)
        self.h_mat, self.h_idx = matrix("hazard", HAZARD_NAMES)
        self.s_mat, self.s_idx = matrix("status", STATUS_NAMES)

    # --- decoding (§5.0) ----------------------------------------------------------

    def decode(self, emb: np.ndarray, unknown_margin: float | None = None) -> dict[str, Any]:
        """Decodes one unit-length embedding into the K4 classify() result."""
        margin = self.unknown_margin if unknown_margin is None else unknown_margin

        def scores(mat: np.ndarray, idx: list[int], n: int) -> list[float | None]:
            full: list[float | None] = [None] * n
            for j, s in zip(idx, (mat @ emb).tolist()):
                full[j] = s
            return full

        sp = scores(self.p_mat, self.p_idx, 4)
        sh = scores(self.h_mat, self.h_idx, 16)
        ss = scores(self.s_mat, self.s_idx, 4)

        def argmax(xs: list[float | None]) -> int:
            return max((i for i, x in enumerate(xs) if x is not None), key=lambda i: xs[i])

        ranked = sorted((x for x in ss if x is not None), reverse=True)
        status = int(RescueStatus.UNKNOWN) if ranked[0] - ranked[1] < margin else argmax(ss)
        return {
            "priority": argmax(sp),
            "hazard": argmax(sh),
            "status": status,
            "medicalProbs": None,
            "thirdPartyProb": None,
            "scores": {"priority": sp, "hazard": sh, "status": ss},
        }

    def embed(self, texts: list[str]) -> np.ndarray:
        return self.embed_fn(texts)

    def classify(self, text: str) -> dict[str, Any]:
        return self.decode(self.embed([text])[0])

    def classify_many(self, texts: list[str]) -> list[dict[str, Any]]:
        return [self.decode(e) for e in self.embed(texts)]

    # --- full extraction ------------------------------------------------------------

    def to_slots(self, text: str, result: dict[str, Any], latency_ms: float | None = None) -> TriageSlotResult:
        adults, children = resolve_headcount(text)
        loc_type, loc_text, _ = resolve_location(text)
        return TriageSlotResult(
            priority=TriagePriority(result["priority"]),
            hazard=HazardClass(result["hazard"]),
            rescue_status=RescueStatus(result["status"]),
            adult_count=adults,
            pediatric_count=children,
            medical_flags=resolve_medical(text),
            # Stage 1 has no third-party model; the website asks the user. This is the
            # location resolver's suggestion, so evaluation can still score it.
            is_third_party_report=loc_type != LocationConfidenceType.DIRECT_ON_SCENE,
            location_type=loc_type,
            extracted_location_text=loc_text,
            confidence=float(result["scores"]["priority"][result["priority"]]),
            raw_text=text,
            extraction_latency_ms=latency_ms,
        )

    def extract(self, text: str) -> TriageSlotResult:
        start = time.perf_counter()
        result = self.classify(text)
        return self.to_slots(text, result, (time.perf_counter() - start) * 1000)

    def extract_many(self, texts: list[str]) -> list[TriageSlotResult]:
        return [self.to_slots(t, r) for t, r in zip(texts, self.classify_many(texts))]
