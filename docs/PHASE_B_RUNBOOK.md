# Phase B runbook — Stage 2 fine-tuning (Track 1)

**Only after the `demo-freeze` tag** (MASTER_PROMPT §0 rule 1, §15). Every step below is already
implemented and tested on a tiny model (`tests/test_phase_b.py`); this is the order to run them.

## 0. Inputs (Track 3, hours 15–17)

- `data/synthetic/scored.jsonl` from `training/generate.py` + `training/verify.py` (§6, §7).
  **Not written yet** — Track 3 owns them. They need `OPENROUTER_API_KEY` in `.env` (~$2), and the
  OPEN items in §16 verified with one call each: `reasoning`/`response_format` on both writer models,
  and the Jev `/systemone` endpoint (fallback: TypeSafe's direct API).
- The 309 chatbot rows already in `data/synthetic/raw.jsonl` (validation writer).

Sanity-check the data before training:

```bash
.venv/bin/python -c "from training.common import *; r=read_jsonl(SCORED_PATH); k=[x for x in r if x.get('keep')]; print(len(r),'scored',len(k),'kept')"
```

Read ~20 kept rows by hand. Expect ~5,000 generated rows and a keep rate the verify report explains.

## 1. Train both candidates (hours 17–19)

```bash
.venv/bin/python -m training.train --val-writer chatbot --base-model BAAI/bge-small-en-v1.5 --out models/triage-bge-small
```
```bash
.venv/bin/python -m training.train --val-writer chatbot --out models/triage-minilm
```

Each prints validation metrics and the **Appendix A test metrics ("never trained on")**, and writes
`models/<name>/` (git-ignored): `model.pt`, tokenizer, `encoder/`, `config.json` with every threshold
tuned on validation. ~5,000 rows → 4 epochs; bge-small on MPS should take minutes, not hours.
`train.py` refuses to run if any training row is an Appendix A message.

Optional quick experiment without the checker: `--unverified [--writer deepseek/deepseek-v4-flash-0731]`.

## 2. Full evaluation reports

```bash
.venv/bin/python -m benchmark.evaluate_dataset --data data/benchmark_dataset.jsonl --models stage1-onnx models/triage-bge-small models/triage-minilm
```
```bash
.venv/bin/python -m benchmark.evaluate_dataset --data data/synthetic/raw.jsonl --writer chatbot --models stage1-onnx models/triage-bge-small models/triage-minilm
```

## 3. Export each candidate to the browser (§11.2, hours 19–21)

```bash
.venv/bin/python -m training.export_onnx --stage 2 --per-channel --model-dir models/triage-bge-small
```
```bash
.venv/bin/python -m training.export_onnx --stage 2 --per-channel --model-dir models/triage-minilm
```

Writes `models/<name>/web/` (classifier.onnx.gz, model.json, tokenizer, export_report.json) and checks
parity (≥ 98% of decoded fields over 200 validation rows) and size (≤ 30 MB). Live files are untouched.

## 4. Ship decision (§5.1 + §15)

```bash
git checkout -b phaseb/stage2-model main
.venv/bin/python -m benchmark.ship_decision --candidates models/triage-bge-small models/triage-minilm --apply
```

Writes `artifacts/ship_decision.md`. Stage 2 is applied **only** if the winning candidate beats Stage 1
on Red recall **and** whole-summary accuracy, on Appendix A **and** validation. `--apply` refuses to
run outside a `phaseb/*` branch and removes the Stage 1-only files so phones don't download both.

## 5. If it ships

1. Track 4 tests the `"classifier"` branch on both phones (load time, inference ms, Airplane Mode).
2. Run the §13.5 demo script **5 times in a row** on the branch.
3. Only then merge `phaseb/stage2-model` into `main`. Undo at any time: `git checkout main -- web/public/model`.

If it doesn't ship, keep Stage 1 and put the comparison table from `artifacts/ship_decision.md` on the slides.
