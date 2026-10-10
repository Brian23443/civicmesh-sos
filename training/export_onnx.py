"""Export to the browser (MASTER_PROMPT §11).

    python3 -m training.export_onnx --stage 1            # §11.1 embedder for the Stage 1 demo
    python3 -m training.export_onnx --stage 1 --per-channel
    python3 -m training.export_onnx --stage 2 --model-dir models/triage-bge-small   # §11.2 (Phase B)

Stage 1 output (web/public/model/): embedder.onnx.gz, tokenizer files, prototypes.json
(from stage1.build_prototypes), model.json. Parity is checked on the chatbot rows
(writer == "chatbot" in data/synthetic/raw.jsonl); until they exist it falls back to the
50 parity sentences and says so.
"""

from __future__ import annotations

import argparse
import gzip
import json
import shutil
import tempfile
import time
from pathlib import Path

import numpy as np
import torch

from src.models.embedder import BASE_MODEL, MAX_LENGTH, PooledEmbedder
from src.schema import HazardClass, MedicalFlags, RescueStatus, TriagePriority
from training.common import ARTIFACTS_DIR, RAW_PATH, read_jsonl

ROOT = Path(__file__).resolve().parents[1]
WEB_MODEL_DIR = ROOT / "web" / "public" / "model"
OPSET = 17
SIZE_BUDGET_MB = 30
TOKENIZER_FILES = ["tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt"]


def labels() -> dict:
    return {
        "priority": [p.name for p in TriagePriority],
        "hazard": [h.name for h in HazardClass],
        "status": [s.name for s in RescueStatus],
        "medical": [MedicalFlags(1 << b).name for b in range(8)],
    }


def export_graph(module: torch.nn.Module, path: Path, output_names: list[str], tokenizer) -> None:
    enc = tokenizer(["export sample text", "a second, longer sample sentence for the batch"],
                    padding=True, truncation=True, max_length=MAX_LENGTH, return_tensors="pt")
    dyn = {"input_ids": {0: "batch", 1: "seq"}, "attention_mask": {0: "batch", 1: "seq"}}
    for name in output_names:
        dyn[name] = {0: "batch"}
    torch.onnx.export(
        module, (enc["input_ids"], enc["attention_mask"]), str(path),
        input_names=["input_ids", "attention_mask"], output_names=output_names,
        dynamic_axes=dyn, opset_version=OPSET, do_constant_folding=True, dynamo=False,
    )
    import onnx  # noqa: PLC0415

    onnx.checker.check_model(str(path))


def quantize(fp32: Path, int8: Path, per_channel: bool) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic  # noqa: PLC0415

    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8, per_channel=per_channel)


def gzip_file(src: Path, dst: Path) -> None:
    """gzip -9 with no name/timestamp in the header, so an unchanged model gives identical bytes
    (otherwise every re-export adds another ~27 MB file to git history)."""
    if dst.exists() and gzip.decompress(dst.read_bytes()) == src.read_bytes():
        return
    with src.open("rb") as f_in, dst.open("wb") as raw, \
            gzip.GzipFile(filename="", mode="wb", compresslevel=9, fileobj=raw, mtime=0) as f_out:
        shutil.copyfileobj(f_in, f_out)


def parity_texts() -> tuple[list[dict], str]:
    """Chatbot rows (with labels) if imported, else the parity sentences (no labels)."""
    chatbot = [r for r in read_jsonl(RAW_PATH) if r.get("writer") == "chatbot"]
    if chatbot:
        return chatbot, f"chatbot rows ({len(chatbot)})"
    from stage1.make_fixtures import SENTENCES  # noqa: PLC0415

    return [{"text": t} for t in SENTENCES], (
        f"FALLBACK: {len(SENTENCES)} parity sentences — chatbot rows not imported yet; rerun after Track 3 imports"
    )


def red_recall(rows: list[dict], preds: list[dict]) -> float | None:
    gold = [r.get("triage_priority") == "Immediate" for r in rows]
    if not any(gold):
        return None
    return sum(g and p["priority"] == int(TriagePriority.IMMEDIATE) for g, p in zip(gold, preds)) / sum(gold)


def export_stage1(args: argparse.Namespace) -> None:
    from transformers import AutoModel, AutoTokenizer  # noqa: PLC0415

    from src.models.prototype_classifier import PrototypeClassifier, onnx_embed_fn, torch_embed_fn  # noqa

    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    if not (out_dir / "prototypes.json").exists():
        raise SystemExit("prototypes.json missing: run python3 -m stage1.build_prototypes first")

    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    module = PooledEmbedder(AutoModel.from_pretrained(args.base_model)).eval()

    with tempfile.TemporaryDirectory() as tmp:
        fp32, int8 = Path(tmp) / "embedder.fp32.onnx", Path(tmp) / "embedder.int8.onnx"
        t0 = time.time()
        export_graph(module, fp32, ["embedding"], tokenizer)
        quantize(fp32, int8, args.per_channel)
        gz = out_dir / "embedder.onnx.gz"
        gzip_file(int8, gz)
        sizes = {"fp32_mb": fp32.stat().st_size / 1e6, "int8_mb": int8.stat().st_size / 1e6,
                 "int8_gz_mb": gz.stat().st_size / 1e6}
        print(f"exported in {time.time() - t0:.0f}s: fp32 {sizes['fp32_mb']:.1f} MB → int8 {sizes['int8_mb']:.1f} MB "
              f"→ gzip {sizes['int8_gz_mb']:.1f} MB (budget {SIZE_BUDGET_MB} MB)")

    tokenizer.save_pretrained(str(out_dir))
    for extra in out_dir.iterdir():  # keep only what the browser needs
        if extra.name.endswith(".json") and extra.name not in TOKENIZER_FILES + ["prototypes.json", "model.json"]:
            extra.unlink()

    prev = json.loads((out_dir / "model.json").read_text()) if (out_dir / "model.json").exists() else {}
    # Keep the settings stage1.tune_stage1 chose on the validation rows.
    model_json = {"kind": "prototype", "base_model": args.base_model, "max_length": MAX_LENGTH,
                  "unknown_margin": prev.get("unknown_margin", 0.02), "red_margin": prev.get("red_margin", 0.0),
                  "status_backstop": prev.get("status_backstop", False), "labels": labels()}
    (out_dir / "model.json").write_text(json.dumps(model_json, indent=2) + "\n")

    # --- parity: PyTorch vs INT8 (§11.1 step 4) and quantization cost (step 5) ---
    rows, source = parity_texts()
    texts = [r["text"] for r in rows]
    torch_fn, onnx_fn = torch_embed_fn(args.base_model), onnx_embed_fn(out_dir)
    e_t, e_q = torch_fn(texts), onnx_fn(texts)
    cos = (e_t * e_q).sum(axis=1) / (np.linalg.norm(e_t, axis=1) * np.linalg.norm(e_q, axis=1))

    clf = PrototypeClassifier(out_dir, embed_fn=lambda t: np.zeros((len(t), 384)))
    p_t, p_q = [clf.decode(e) for e in e_t], [clf.decode(e) for e in e_q]
    fields = ("priority", "hazard", "status")
    match = sum(a[k] == b[k] for a, b in zip(p_t, p_q) for k in fields) / (len(rows) * len(fields))

    t1 = time.perf_counter()
    for t in texts[:50]:
        onnx_fn([t])
    latency_ms = (time.perf_counter() - t1) * 1000 / min(50, len(texts))

    report = {
        "parity_source": source, "n": len(rows), **{k: round(v, 2) for k, v in sizes.items()},
        "mean_cosine": float(cos.mean()), "min_cosine": float(cos.min()),
        "decoded_field_match": match, "per_channel": args.per_channel,
        "cpu_latency_ms_per_message_1_thread": round(latency_ms, 1),
        "red_recall_pytorch": red_recall(rows, p_t), "red_recall_int8": red_recall(rows, p_q),
    }
    ok_cos, ok_match = report["mean_cosine"] >= 0.99, match >= 0.98
    ok_size = sizes["int8_gz_mb"] <= SIZE_BUDGET_MB
    rr_t, rr_q = report["red_recall_pytorch"], report["red_recall_int8"]
    report["passed"] = ok_cos and ok_match and ok_size
    ARTIFACTS_DIR.mkdir(exist_ok=True)
    (ARTIFACTS_DIR / "export_stage1.json").write_text(json.dumps(report, indent=2) + "\n")

    print(f"parity on {source}")
    print(f"  mean cosine {report['mean_cosine']:.4f} (min {report['min_cosine']:.4f})  "
          f"{'PASS' if ok_cos else 'FAIL'} (≥ 0.99)")
    print(f"  decoded fields match {100 * match:.1f}%  {'PASS' if ok_match else 'FAIL'} (≥ 98%)")
    print(f"  size {sizes['int8_gz_mb']:.1f} MB gzipped  {'PASS' if ok_size else 'FAIL'} (≤ {SIZE_BUDGET_MB} MB)")
    print(f"  CPU latency {latency_ms:.1f} ms/message (1 thread, this Mac — phones will be slower)")
    if rr_t is None:
        print("  quantization cost on Red recall: not measured (no labels in the parity set)")
    else:
        lost = 100 * (rr_t - rr_q)
        print(f"  Red recall PyTorch {100 * rr_t:.1f}% vs INT8 {100 * rr_q:.1f}% "
              f"({'OK' if lost <= 3 else 'LOSES > 3 points: try --per-channel or ship FP16'})")
    print(f"  → {ARTIFACTS_DIR / 'export_stage1.json'}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export models to the browser (§11)")
    parser.add_argument("--stage", type=int, choices=[1, 2], required=True)
    parser.add_argument("--base-model", default=BASE_MODEL)
    parser.add_argument("--model-dir", type=Path, help="Stage 2 model directory")
    parser.add_argument("--out", type=Path, default=WEB_MODEL_DIR)
    parser.add_argument("--per-channel", action="store_true", help="per-channel INT8 quantization")
    args = parser.parse_args()
    if args.stage == 1:
        export_stage1(args)
    else:
        raise SystemExit("Stage 2 export (§11.2) is Phase B — implemented with training/train.py")


if __name__ == "__main__":
    main()
