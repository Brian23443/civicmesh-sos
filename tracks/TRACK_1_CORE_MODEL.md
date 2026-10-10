# CivicMesh-SOS — Track 1 of 4: Core Python & On-Device Model

> **How to use:** give this entire document to your AI assistant at the start of the hackathon. It is your complete brief: your scope, your deadlines, the contracts other tracks depend on, and — in Part 3 — every section of `MASTER_PROMPT.md` you need, copied **verbatim**. `MASTER_PROMPT.md` in the repo root is the single source of truth for the whole project; if a spec number here ever disagrees with it, the master wins. Every number is decided; do not substitute your own values. Items marked **OPEN** must be verified before relying on them.

---

## Part 1 — Your role and scope

You are the engineering partner of the **Track 1 owner** on a four-person, 24-hour hackathon team building **CivicMesh-SOS**, an offline disaster-triage pipeline (phone → on-device model → 18-byte frame → Wi-Fi → LoRa → laptop dashboard; overview in §0 below).

**Track 1 owns the Python core and the model.** Three other tracks depend on you early, so your first hour matters more than anyone else's:

1. **Hour 0–1: the foundation everyone imports** — `src/schema.py`, `src/serialization/bit_packer.py` + tests, `training/common.py`. Push to `main` the moment both §3 test vectors pass.
2. **Hours 1–3: the deterministic resolvers** (§5.4) + tests, the **Stage 1 prototype classifier** (§5.0) with its Python reference, and `benchmark/evaluate_dataset.py`.
3. **Hours 3–5: the browser model export** (§11.1) — INT8 + gzip + parity — into `web/public/model/` for Track 4.
4. **Hours 5–12: support and measurement** — parity fixtures for Track 4, tune `unknown_margin` on the chatbot rows, score Stage 1 honestly, help with JS parity bugs, then join the end-to-end rehearsal.
5. **Phase B (hours 15–21, only after the demo freeze):** the Stage 2 classifier (§5.1–5.3), `training/train.py` (§9), the §11.2 export and the ship/no-ship decision.

You do **not** build the firmware, bridge (T2), the dashboard, chatbot importer or data generation/checking scripts (T3), or the website UI (T4). You **do** review T3's data before training on it.

### Your ground rules (from §0 — repeated because they bind you most)

- **Never fit anything to the test set** (Appendix A, saved at `data/benchmark_dataset.jsonl`): never train on it, never tune a threshold or `unknown_margin` on it, never write a resolver keyword or pattern that comes from it. Write your own example sentences for every resolver test and for the parity fixtures.
- **Report honestly:** Red recall and Red precision, per-field accuracy, whole-summary accuracy — on Appendix A **and** on the chatbot validation rows. Never just overall accuracy.
- **Budgets:** model download ≤ 30 MB gzipped; inference ≤ 50 ms per message on a phone.
- **Write tests** for the packer (both §3 vectors) and the resolvers.
- The machine is macOS + zsh + Python 3.13 on Apple Silicon (PyTorch MPS available). Run scripts as modules from the repo root (`python3 -m stage1.build_prototypes`).

---

## Part 2 — Your timeline, tasks and "done when" checks

Do not move to the next row until the current row's check passes. Push to `main` at every ★.

| Hours | Task | Done when |
|---|---|---|
| 0–0:15 | Create `.venv`, `pip install -r requirements.txt`. Pre-download `BAAI/bge-small-en-v1.5` (and `sentence-transformers/all-MiniLM-L6-v2` for Phase B) in the background so the conference Wi-Fi doesn't bite later. | `python3 -c "import torch; print(torch.backends.mps.is_available())"` prints True |
| 0–1 | `src/schema.py` (§2), `src/serialization/bit_packer.py` (§3, contract K1), `tests/test_packer.py` covering **every** bullet in §3 "Required packer tests". `training/common.py` (§4 + contract K6). | `pytest tests/test_packer.py` green, both vectors byte-exact ★ |
| 1–2 | `src/models/resolvers.py` (§5.4): `resolve_headcount(text) -> (adults, children)`, `resolve_medical(text) -> MedicalFlags`, `resolve_location(text) -> (LocationConfidenceType, str|None, MedicalFlags)`. `tests/test_resolvers.py` with **your own** sentences, including every case §5.4 names ("4 ppl", "1 kid", "mi bebé", "me and my 2 kids", "3 of us", "two adults and a toddler"), the "burn barrel"/"sunburn" exclusions, typos ("cant breath"), Spanish. | Resolver tests green ★ |
| 2–3 | Write `tests/fixtures/packer_vectors.json` and `tests/fixtures/parity_sentences.jsonl` (50 of your own sentences, K5) with the resolver outputs. | Fixtures on `main` for T4 ★ |
| 1–3 | `stage1/build_prototypes.py` → `web/public/model/prototypes.json` (K4 format). `src/models/prototype_classifier.py` — `PrototypeClassifier` with the K4 `classify()` result **and** an `extract(text) -> TriageSlotResult` method (same interface as Stage 2's `FinetunedTriageExtractor`) that combines classify + resolvers. | Prototypes built; `extract()` returns sensible results on 5 of your own sentences |
| 1–3 | `benchmark/evaluate_dataset.py` exactly as in §9 "Evaluation script", with model keys `stage1` (PrototypeClassifier) and any `models/triage-*` dir. | `artifacts/eval_benchmark_dataset_stage1.md` written |
| 2–3 | When T3 lands the 310 chatbot rows (`writer == "chatbot"` in `data/synthetic/raw.jsonl`): tune `unknown_margin` on them (start 0.02; sweep e.g. 0.00–0.10 step 0.005 to maximise status accuracy, report Unknown recall/precision), then evaluate Stage 1 on Appendix A **and** the chatbot rows. | Stage 1 scored on both; numbers posted in team chat ★ |
| 3–5 | `training/export_onnx.py --stage 1` (§11.1): wrapper with pooling + L2-norm inside the graph, opset ≥ 17, dynamic axes, `quantize_dynamic` INT8, `gzip -9`, parity on the chatbot rows (mean cosine ≥ 0.99, decoded fields match ≥ 98%), quantization-cost check on Red recall (> 3 points lost → try `per_channel=True`, else FP16). Copy tokenizer files. Write `model.json`. Report the gzipped size. | Parity passes; size reported; all K4 files in `web/public/model/` ★ |
| 5 | Add `stage1` values to `tests/fixtures/parity_sentences.jsonl` (computed with the **INT8** graph via onnxruntime, so T4 compares like with like; also record the PyTorch values for reference). | Fixtures refreshed ★ |
| 5–12 | Support T4's JS port: run their failing parity cases through Python, find the divergence (tokenization, pooling, normalization, regex flavour differences — JS `\b` vs Python `\b` with accents, `i` flag, lookbehind). Help T3 with importer checks if asked. Measure inference time of the ONNX graph on CPU (`onnxruntime`, 1 thread) as a rough proxy for the phone. | T4 Vitest parity green |
| 12–15 | End-to-end rehearsal with the team: you own "the model says something sensible" — keep a list of your own demo-safe sentences and their expected summaries. The §13.5 sentence must yield **Red · Flood · Trapped · 2 adults · Insulin** (fix via resolvers/prototypes generically if not — never with a phrase-specific rule). | `demo-freeze` tagged |
| **Phase B** | | |
| 15–17 | While T3 generates/verifies data: write `src/models/triage_classifier.py` (§5.2), `FinetunedTriageExtractor` (§5.3) and `training/train.py` (§9). Smoke test with `--unverified` on the chatbot rows only (a few epochs) to shake out bugs. Read 20 generated rows yourself as they arrive. | `train.py` runs end to end on a small set |
| 17–19 | `python3 -m training.train --val-writer chatbot --base-model BAAI/bge-small-en-v1.5 --out models/triage-bge-small`, then (time permitting) the MiniLM run. Evaluate both with `evaluate_dataset.py` on Appendix A and validation. | Both scored; numbers in `artifacts/` |
| 19–21 | §11.2 export of the winner on branch `phaseb/stage2-model`; parity ≥ 98% over 200 validation rows; size ≤ 30 MB. Ship decision per §15: replace the files in `web/public/model/` **only** if Stage 2 beats Stage 1 on Red recall **and** whole-summary accuracy on Appendix A **and** validation. Otherwise keep Stage 1 and say so on the slides. | Decision made and documented in `artifacts/ship_decision.md` |
| 22–24 | Numbers for the slides: Stage 1 vs Stage 2 table, quantization cost, size, latency. Rehearse. | — |

### Implementation notes (decisions you can rely on)

- **Labels mapping.** JSONL uses `"Immediate"` / `"Sheltered"` etc.; enums use `IMMEDIATE`. Put both directions in `training/common.py` (e.g. `PRIORITY_LABELS[TriagePriority.IMMEDIATE] == "Immediate"`). Hazards use the enum name everywhere.
- **Packer rounding.** `round()` in Python is banker's rounding; the spec says `round(lat / 90 × (2²³−1))`. Python's `round` is round-half-to-even, JS `Math.round` rounds half toward +∞, C `lround` rounds half away from zero. Exact .5 ties essentially never happen with real coordinates, so all three agree in practice — say so in a comment, and make sure the two §3 vectors are byte-exact in all three languages. Negative values are written as 24-bit two's complement.
- **Headcount clamping** happens in the packer **and** in `TriageSlotResult` (validator clamps 0–15, it does not raise).
- **Resolver regexes** must be portable to JS: avoid Python-only syntax (possessive quantifiers, `(?P<name>)` — use plain groups or `(?<name>)` which both support, inline flags mid-pattern). Use `re.IGNORECASE`. For accented Spanish words, don't rely on `\b` next to a non-ASCII letter; use `(?<![\w])`/`(?![\w])` with Unicode-aware classes, or explicit alternatives (`beb[eé]`). Document each pattern with a comment so T4 can port it 1:1.
- **Prototype classifier.** Embed with the exact same function used for export (masked mean pooling, then L2-normalize). Status UNKNOWN when `top1 − top2 < unknown_margin` over the three status prototypes. Medical flags = keyword backstop. Third-party: Stage 1 has no model for it (the website asks "Are you at the emergency?"); the Python reference reports the location resolver's **suggestion** — `is_third_party_report = location_type != DIRECT_ON_SCENE` — so evaluation can still score it, labelled as a suggestion. Headcounts and location from resolvers. `confidence` = top priority similarity.
- **Evaluation "whole-summary accuracy":** a row is right only if priority, hazard, status, adults, children and the exact medical set all match (the summary line `Red · FLOOD · Trapped · 2 adults + 1 child · INSULIN`). Report third-party separately.
- **Export.** Use `torch.onnx.export(..., input_names=["input_ids","attention_mask"], output_names=["embedding"], dynamic_axes={...: {0: "batch", 1: "seq"}}, opset_version=17)`. Cast `attention_mask` to float inside the wrapper for pooling. Validate with `onnx.checker`. Quantize to a temporary `.onnx` (git-ignored) then gzip to `.onnx.gz`. If `quantize_dynamic` struggles with the newer exporter, try `dynamo=False`.
- **Stage 2 training** must exclude every chatbot row from training when `--val-writer chatbot` is set, and must never read `data/benchmark_dataset.jsonl` except to print the final "never trained on" test metrics.

## Team structure (all four tracks)

There are four people, each running their own AI assistant with their own track file. The tracks are designed so nobody waits on anybody for more than a few minutes: every cross-track dependency has a **contract** (below) that you can build against with a stub *before* the other track delivers.

| Track | Owner focus | Owns (only this track edits these paths) |
|---|---|---|
| **T1 — Core & Model** | Python core, resolvers, Stage 1 model, evaluation, ONNX export; Phase B training | `src/`, `stage1/`, `training/common.py`, `training/export_onnx.py`, `training/train.py`, `benchmark/`, `tests/test_packer.py`, `tests/test_resolvers.py`, `tests/test_prototype*.py`, `tests/fixtures/`, `web/public/model/`, `models/`, `artifacts/eval_*` |
| **T2 — Hardware & Bridge** | Radio link test, field node, base station, FastAPI bridge, end-to-end integration lead; Phase B ACK + demo/slides | `firmware/`, `bridge/`, `tests/test_bridge*.py`, `docs/DEMO_CHECKLIST.md` |
| **T3 — Dashboard & Data** | Chatbot data collection + importer, operator dashboard; Phase B data generation + label checking | `dashboard/`, `training/import_chatbot.py`, `training/generate.py`, `training/verify.py`, `training/chatbot_prompt_*.md`, `data/chat*.txt`, `data/synthetic/`, `tests/test_importer.py`, `artifacts/jev_benchmark.json` |
| **T4 — Survivor PWA** | The survivor website: design, UI, offline, JS ports of packer/resolvers/decoding, real-phone testing, hosting | `web/` (except `web/public/model/`, which T1 fills) |

**Shared files** (edit only your own section, keep edits small, pull before you edit): `README.md`, `requirements.txt`, `design/REFERENCES.md` (T4 owns "Survivor PWA", T3 owns "Operator dashboard"), `docs/INTEGRATION.md` (the live-values table). `data/benchmark_dataset.jsonl` (Appendix A) is already saved verbatim by the orchestrator — **nobody edits it, nobody trains or tunes on it.**

If you need a change in a path another track owns, **ask that track** (or open a PR against their branch). Do not edit it yourself — that is how merge conflicts eat hours at a hackathon.

The repo root is the spec's `civicmesh-sos/` directory (§14). All paths below are relative to the repo root.

---

## Integration contracts (decided — build against these exactly)

These pin down the interfaces between tracks that MASTER_PROMPT.md leaves implicit. They are consistent with the spec; where the spec gives a value, the spec value is repeated here.

### K1 — Python schema and packer API (T1 provides by **hour 1**; T2 and T3 consume)

```python
# src/schema.py  — §2, exact names and values
class TriagePriority(IntEnum): MINOR=0; DELAYED=1; IMMEDIATE=2; DECEASED=3
class HazardClass(IntEnum):    NONE=0 ... OTHER=15          # §2 order
class RescueStatus(IntEnum):   SHELTERED=0; EXPOSED=1; TRAPPED=2; UNKNOWN=3
class MedicalFlags(IntFlag):   INSULIN=0x0001 ... LOCATION_DISCREPANCY_ALERT=0x1000
class LocationConfidenceType(IntEnum): DIRECT_ON_SCENE=0; PROXIMATE_OFFSET=1; LANDMARK_POI=2; EXPLICIT_ADDRESS=3
class GpsAccuracy(IntEnum):    NO_FIX=0; M5=1; M10=2; M25=3; M50=4; M100=5; M500=6; COARSE=7
    @classmethod
    def from_meters(cls, m: float | None) -> "GpsAccuracy": ...
class TriageSlotResult(BaseModel): ...   # §2 "Models"
class EmergencyPacket(BaseModel): ...    # §2 "Models"

# src/serialization/bit_packer.py — §3
FRAME_LEN = 18
FRAME_VERSION = 1
def pack_binary_frame(packet: EmergencyPacket) -> bytes: ...
def unpack_binary_frame(data: bytes) -> EmergencyPacket: ...   # ValueError on len != 18 or version != 1
def frame_to_hex(data: bytes) -> str: ...                      # 36 UPPERCASE hex chars
def hex_to_frame(s: str) -> bytes: ...                         # accepts upper/lower case
```

Until T1 pushes K1, T2 may stub `unpack_binary_frame` locally (never commit the stub under `src/`).

### K2 — Frame transport strings (T4 → T2 → T2 → T3)

- Phone → field node: top-level navigation to `http://192.168.4.1/sos?d=<36 UPPERCASE hex>` (§12.3). The field node must also accept lowercase.
- Base station → laptop serial, 115200 baud, one line per frame: `FRAME <36 UPPERCASE hex> <rssi> <snr>` (e.g. `FRAME 861200012B0BF3BA7E6A68E77800BEEF0050 -41.0 9.75`). Other lines (`CRC error, packet dropped`, `Unknown frame version, ignored`, boot logs) are ignored by the bridge, but logged.

### K3 — Bridge HTTP/WebSocket API (T2 provides; T3 consumes)

- Bridge: `python3 -m bridge.server [--port /dev/cu.xxx] [--simulate] [--center LAT,LON] [--db bridge/incidents.db]`, listening on **http://localhost:8000**. It serves `dashboard/dist/` at `/` when that folder exists.
- Dashboard dev server runs on **port 5174** and proxies `/api` and `/ws` to `localhost:8000` (Vite `server.proxy`, with `ws: true` for `/ws`). The survivor PWA dev server uses **port 5173**.
- `GET /api/incidents?state=active|removed|all` → a JSON **array** of Incident objects (default `active`).
- `POST /api/incidents/{id}/remove` and `POST /api/incidents/{id}/restore` → the updated Incident object; 404 if unknown.
- `GET /api/health` → `{"serial_connected": bool, "port": str|null, "last_frame_at": number|null, "active_count": int}`.
- `POST /api/debug/frame` body `{"hex": "<36 hex>", "rssi"?: number, "snr"?: number}` → `{"incident": Incident, "duplicate": bool}`; 400 on a bad frame.
- `WS /ws` messages: `{"type": "incident.new"|"incident.updated"|"incident.removed"|"incident.restored", "incident": Incident}` and `{"type": "health", "health": <same object as /api/health>}` (health pushed on connect and every 5 s).
- All times are **POSIX seconds (numbers)**. `sent_at` is the frame timestamp (int); `received_at`, `last_heard_at`, `removed_at` are server time (float).

**Incident object** (exact keys; the example is test vector 1):

```json
{
  "id": "3f7b2c1e-9a4d-4c55-8a0e-0b8f6f1d2a11",
  "frame_hex": "861200012B0BF3BA7E6A68E77800BEEF0050",
  "device_id": 48879, "seq": 0,
  "rssi": -41.0, "snr": 9.75, "heard_count": 1,
  "priority": {"value": 2, "name": "IMMEDIATE", "color": "red"},
  "hazard": {"value": 1, "name": "FLOOD"},
  "status": {"value": 2, "name": "TRAPPED"},
  "adults": 2, "children": 1,
  "medical": ["INSULIN"],
  "third_party": false,
  "location_type": "DIRECT_ON_SCENE",
  "location_discrepancy": false,
  "lat": 30.2672, "lon": -97.7431,
  "gps_accuracy": {"value": 2, "name": "M10", "meters_max": 10},
  "sent_at": 1760000000,
  "received_at": 1760000001.42, "last_heard_at": 1760000001.42,
  "state": "active", "removed_at": null
}
```

- `priority.color` is one of `"green" | "yellow" | "red" | "black"` (MINOR, DELAYED, IMMEDIATE, DECEASED).
- `medical` lists only the 8 medical names (bits 0–7), in bit order.
- `lat`/`lon` are the decoded values rounded to 6 decimals. When `gps_accuracy.name == "NO_FIX"`, the dashboard does not place a pin ("No location" list).
- `gps_accuracy.meters_max`: NO_FIX → `null`, M5 → 5, M10 → 10, M25 → 25, M50 → 50, M100 → 100, M500 → 500, COARSE → `null`.
- `rssi`/`snr` are `null` for frames injected through `/api/debug/frame` without them.

### K4 — Browser model files (T1 provides by **hour 5**; T4 consumes)

Folder `web/public/model/`:

- `model.json`
  ```json
  {
    "kind": "prototype",
    "base_model": "BAAI/bge-small-en-v1.5",
    "max_length": 128,
    "unknown_margin": 0.02,
    "labels": {
      "priority": ["MINOR", "DELAYED", "IMMEDIATE", "DECEASED"],
      "hazard": ["NONE", "FLOOD", "FIRE_SMOKE", "STRUCTURAL_COLLAPSE", "HAZMAT_GAS", "ELECTRICAL_POWER", "EXTREME_WEATHER", "MEDICAL_CRISIS", "ACTIVE_VIOLENCE", "TSUNAMI_SURGE", "LANDSLIDE", "HYPOTHERMIA_FREEZE", "HEAT_STROKE", "SINKHOLE_SUBSIDENCE", "CONTAMINATED_WATER", "OTHER"],
      "status": ["SHELTERED", "EXPOSED", "TRAPPED", "UNKNOWN"],
      "medical": ["INSULIN", "OXYGEN", "BLEEDING", "HYPOTHERMIA", "MOBILITY_IMPAIRED", "CARDIAC", "PREGNANCY_INFANT", "BURNS"]
    }
  }
  ```
  (`unknown_margin` is whatever T1 tuned on the chatbot rows. Stage 2 adds `"kind": "classifier"`, `red_threshold`, `medical_thresholds` [8], `third_party_threshold` — §11.2.)
- `embedder.onnx.gz` — gzip of the INT8 ONNX graph. Inputs `input_ids` and `attention_mask`, both **int64** `[batch, seq]`. Output `embedding`, float32 `[batch, 384]`, already mean-pooled and L2-normalized inside the graph.
- `tokenizer.json` — the Hugging Face fast-tokenizer file for the base model (plus `tokenizer_config.json`, `special_tokens_map.json`, `vocab.txt` if transformers.js needs them; T1 copies all of them).
- `prototypes.json`
  ```json
  {"dim": 384,
   "priority": {"MINOR": [384 floats], "DELAYED": [...], "IMMEDIATE": [...], "DECEASED": [...]},
   "hazard":   {"NONE": [...], "FLOOD": [...], ..., "CONTAMINATED_WATER": [...]},
   "status":   {"SHELTERED": [...], "EXPOSED": [...], "TRAPPED": [...]}}
  ```
  Keys appear in §2 enum order. **No OTHER hazard prototype and no UNKNOWN status prototype** (§5.0). Each prototype is the mean of the normalized example-sentence embeddings, **then re-normalized to unit length**, so cosine similarity = dot product.
- Stage 2 (Phase B only): `classifier.onnx.gz` with the same two inputs and five outputs named `priority` [b,4], `hazard` [b,16], `status` [b,4], `medical` [b,8], `third_party` [b,1] (logits).

**`classify(text)` result** — identical shape in Python (`src/models/prototype_classifier.py`) and JS (`web/src/lib/`):

```ts
{
  priority: number,            // TriagePriority value
  hazard: number,              // HazardClass value
  status: number,              // RescueStatus value (UNKNOWN when top1 - top2 < unknown_margin)
  medicalProbs: number[] | null,   // 8 probabilities (Stage 2) or null (Stage 1)
  thirdPartyProb: number | null,   // Stage 2 or null
  scores: { priority: number[4], hazard: (number|null)[16], status: (number|null)[4] }  // null where no prototype exists
}
```

Until K4 arrives, T4 builds against a `MockClassifier` with the same signature, plus manual mode.

### K5 — Parity fixtures (T1 provides by **hour 3**, refreshed at hour 5; T4 consumes in Vitest)

- `tests/fixtures/packer_vectors.json` — both §3 test vectors as `{"name", "fields": {...}, "hex"}`, plus the four round-trip coordinate points.
- `tests/fixtures/parity_sentences.jsonl` — **50 sentences written by T1 (never from Appendix A)**, one object per line:
  ```json
  {"text": "...", "headcount": [adults, children], "medical_mask": 5, "location": {"type": "EXPLICIT_ADDRESS", "text": "12 Oak St", "flags": 6144}, "stage1": {"priority": 2, "hazard": 1, "status": 2, "scores": {...}}}
  ```
  `stage1` is added once the embedder exists (hour 5). JS must match `headcount`, `medical_mask` and `location` exactly, and `stage1` decoded fields on ≥ 98% of fields (INT8 vs PyTorch noise).

Vitest reads them from `../tests/fixtures/` relative to `web/`.

### K6 — Python helpers shared with T3 (T1 provides `training/common.py` by **hour 1**)

`training/common.py` exports: `LABEL_VERSION = 2`, `COUNT_RULE`, `THIRD_PARTY_RULE` (the §4 text), the label vocabularies as lists (`PRIORITY_LABELS = ["Minor","Delayed","Immediate","Deceased"]`, `HAZARD_NAMES` [16], `STATUS_LABELS = ["Sheltered","Exposed","Trapped","Unknown"]`, `MEDICAL_NAMES` [8], `LANGUAGES` [3]), the §2 descriptions (`PRIORITY_DESCRIPTIONS`, `HAZARD_DESCRIPTIONS`, `STATUS_DESCRIPTIONS`, `MEDICAL_DESCRIPTIONS`), `read_jsonl(path)`, `append_jsonl(path, rows)`, and an OpenRouter client `openrouter_post(path, payload, timeout=120)` implementing the §6 retry policy. T3 builds `generate.py`/`verify.py`/`import_chatbot.py` on top of it. If T3 needs something added, ask T1.

### K7 — Live values (`docs/INTEGRATION.md`)

One table every track reads: the hosted website URL (`APP_URL`, T4 fills by **hour 3**), the demo map center and bbox (T3 fills), the base station's serial port on the demo laptop (T2), the current model kind in `web/public/model/` (T1). Update the table when a value changes and say so in the team chat.

---

## Sync points (put these on a shared timer)

| Hour | Who → whom | What lands on `main` | Unblocks |
|---|---|---|---|
| 1 | T1 → all | K1 schema + packer + tests, K6 `training/common.py` | T2 bridge decoding, T3 importer, T4 has a reference |
| 1 | T2 | Radio link test passes on both boards (Appendix B) | Hardware de-risked |
| 2–3 | T3 → T1 | 310 chatbot rows imported into `data/synthetic/raw.jsonl` | T1 tunes `unknown_margin`, scores Stage 1 on validation |
| 3 | T1 → T4 | K5 fixtures (packer vectors + resolver parity) | T4 Vitest parity |
| 3 | T4 → T2 | `APP_URL` in `docs/INTEGRATION.md` | Field node "Back to CivicMesh" link |
| 4 | T2 → T3 | Bridge with `--simulate` | Dashboard switches from mocks to live data |
| 5 | T1 → T4 | K4 model files in `web/public/model/` (+ `stage1` parity values) | Real inference in the PWA |
| 7 | T2 + T3 | Field node: a hand-typed `http://192.168.4.1/sos?d=…` puts a pin on the dashboard | Hardware path proven |
| 12 | T4 → all | PWA works in Airplane Mode after one visit (iPhone + Android) | End-to-end rehearsal |
| 12–15 | **everyone** | §13.5 demo script works **5 times in a row** → tag `demo-freeze` | Phase B may begin |
| 15–17 | T3 → T1 | `data/synthetic/scored.jsonl` (5,000 generated + checked rows) | Training |
| 21 | T1 | Stage 2 ships **only** if it beats Stage 1 (§15) | — |

If you are going to miss a sync point, say so in the team chat **as soon as you know**, with a new ETA.

---

## Git workflow

- **`main` must always run.** Never push something to `main` that breaks the tests or the demo.
- Each track works on its long-lived branch: `track/t1-core-model`, `track/t2-hardware-bridge`, `track/t3-dashboard-data`, `track/t4-survivor-pwa`. Short feature branches off your track branch are fine.
- **Merge to `main` small and often** — at least at every sync point you own, ideally every 1–2 hours:
  ```bash
  git checkout track/tN-xxx
  git fetch origin && git merge origin/main     # take everyone else's work first
  # run your tests (pytest / npm test / compile the sketch)
  git checkout main && git pull && git merge --no-ff track/tN-xxx && git push
  ```
  (Or open a PR from your track branch to `main` if the team is using PR review; keep it under ~400 lines so it can be reviewed in two minutes.)
- **Stay in your paths** (ownership table). Shared files: pull first, edit only your section, push quickly.
- Commit messages start with the track: `[T1] packer: both §3 test vectors pass`.
- **Never commit:** `.env` / API keys, `node_modules/`, `dist/`, `models/` checkpoints, `bridge/*.db`, `*.pmtiles`. They are in `.gitignore`. Large model files go in `web/public/model/*.gz` only (≤ 30 MB each).
- **Demo freeze:** when the §13.5 script passes 5 times in a row, T2 tags it: `git tag -a demo-freeze -m "Demo freeze" && git push origin demo-freeze`. After that, `main` only takes changes that keep the demo working. Phase B work happens on `phaseb/*` branches and is merged only after the §15 ship decision.
- If `main` breaks: whoever notices says so in chat; the owner of the breaking commit reverts first (`git revert <sha>`), fixes second.


---

## Part 3 — Specification excerpts (verbatim from MASTER_PROMPT.md)

Section numbers (§) refer to MASTER_PROMPT.md. Sections owned by other tracks are summarised in Part 1 and the contracts; read them in the master file if you need detail.

## 0. Role, goal, and ground rules

You are my engineering partner for a 24-hour hackathon. We are building **CivicMesh-SOS**, an offline disaster-triage pipeline:

1. A survivor types a free-text distress message on a phone in **Airplane Mode**.
2. An **on-device encoder model** turns it into structured triage fields.
3. The phone shows a confirmation screen and the survivor taps Send.
4. The fields are bit-packed into an **18-byte frame**.
5. The frame goes over **local Wi-Fi** to a LoRa field node, then over **915 MHz LoRa** to a base station.
6. A laptop decodes it and drops a color-coded pin on an **offline map dashboard**.

Ground rules:

1. **Demo first, fine-tuning last.** Phase A builds a complete working demo with an untrained (zero-shot) model (§5.0). Fine-tuning (Phase B) starts only after the demo works end to end and is frozen. **Build in the order of §15.** Each step has a "done when" check. Don't move on until it passes.
2. **Never fit anything to the test set.** The 54 hand-labeled messages in Appendix A are the test set.
   - Never train on them.
   - Never tune thresholds on them.
   - Never add keyword rules containing phrases from them.

   Keyword overrides copied from test messages make accuracy look much better than it is. Don't add them.
3. **Report honestly.** For any evaluation, report Red recall and Red precision, per-field accuracy, and whole-summary accuracy (§9), not just overall accuracy.
4. **Stay on budget.** Model download ≤ **30 MB gzipped**. Inference ≤ **50 ms** per message on a phone. Data-generation API spend is about $2.
5. **Verify unverified APIs with a single call before any batch run** (§16).
6. **Write tests** for the frame packer (both test vectors in §3), the resolvers (§5.4) and the data importer.
7. The user runs macOS with zsh and Python 3.13, on an Apple Silicon Mac (PyTorch MPS is available).

---

## 2. Triage fields

Create `src/schema.py` with Python `IntEnum` / `IntFlag` and Pydantic v2 models. These exact names and values are used everywhere: Python, JS and C.

### TriagePriority (2 bits)

| Value | Name | Label string | Color | Meaning |
|---|---|---|---|---|
| 0 | MINOR | `Minor` | Green | Safe, or only minor injuries; walking wounded; needs supplies or information, not rescue |
| 1 | DELAYED | `Delayed` | Yellow | Serious but stable; injured or stranded but not in immediate danger of dying; rescue can wait hours |
| 2 | IMMEDIATE | `Immediate` | Red | Life-threatening right now: severe bleeding, can't breathe, unconscious, or trapped with a rising hazard (water, fire, gas, collapse) |
| 3 | DECEASED | `Deceased` | Black | Dead, or unresponsive with no signs of life |

### HazardClass (4 bits)

The label string is the enum name.

| Value | Name | Description (also used as the checker's option text) |
|---|---|---|
| 0 | NONE | no hazard mentioned |
| 1 | FLOOD | flooding, rising water, submerged roads or homes |
| 2 | FIRE_SMOKE | fire, flames, smoke, wildfire |
| 3 | STRUCTURAL_COLLAPSE | building, roof, wall, stairwell or bridge collapse; rubble |
| 4 | HAZMAT_GAS | gas leak, chemical spill, toxic fumes |
| 5 | ELECTRICAL_POWER | downed power lines, sparking, electrocution risk |
| 6 | EXTREME_WEATHER | tornado, hurricane winds, hail, severe storm |
| 7 | MEDICAL_CRISIS | a medical emergency is the main problem, with no environmental hazard |
| 8 | ACTIVE_VIOLENCE | shooter, assault, looting, hostile people |
| 9 | TSUNAMI_SURGE | tsunami, storm surge, ocean water coming inland |
| 10 | LANDSLIDE | landslide, mudslide, debris flow |
| 11 | HYPOTHERMIA_FREEZE | extreme cold, blizzard, freezing conditions |
| 12 | HEAT_STROKE | extreme heat, heat stroke, no cooling |
| 13 | SINKHOLE_SUBSIDENCE | sinkhole, ground giving way |
| 14 | CONTAMINATED_WATER | unsafe or contaminated drinking water, no clean water |
| 15 | OTHER | a hazard that fits none of the other categories |

### RescueStatus (2 bits)

| Value | Name | Label string | Meaning |
|---|---|---|---|
| 0 | SHELTERED | `Sheltered` | inside a secure building or shelter, not trapped |
| 1 | EXPOSED | `Exposed` | outdoors or exposed to the elements: on a roof, in water, in a car, on the street |
| 2 | TRAPPED | `Trapped` | cannot get out: pinned, stuck in an attic, under rubble, in a vehicle, cut off |
| 3 | UNKNOWN | `Unknown` | the message does not say where the victims are or whether they can move |

### Flags (16-bit `IntFlag`, `MedicalFlags`)

| Bit | Mask | Name | Meaning (bits 0–7 also used as the checker's question text: "Does the message indicate that …?") |
|---|---|---|---|
| 0 | 0x0001 | INSULIN | someone is diabetic or needs insulin |
| 1 | 0x0002 | OXYGEN | someone has trouble breathing or depends on oxygen |
| 2 | 0x0004 | BLEEDING | someone is bleeding heavily or has a serious wound |
| 3 | 0x0008 | HYPOTHERMIA | someone is dangerously cold, hypothermic, or soaked in cold water |
| 4 | 0x0010 | MOBILITY_IMPAIRED | someone cannot walk: wheelchair, broken leg or pelvis, elderly and immobile, pinned |
| 5 | 0x0020 | CARDIAC | someone has chest pain, a heart attack, or a heart condition flaring up |
| 6 | 0x0040 | PREGNANCY_INFANT | someone is pregnant or in labor, or a newborn or infant needs care |
| 7 | 0x0080 | BURNS | someone has burns |
| 8 | 0x0100 | THIRD_PARTY_REPORT | the writer is not at the scene (§4) |
| 9 | 0x0200 | LOC_PROXIMATE | incident is nearby ("a few blocks away") |
| 10 | 0x0400 | LOC_LANDMARK | a named landmark is mentioned |
| 11 | 0x0800 | LOC_EXPLICIT_ADDRESS | a street address is mentioned |
| 12 | 0x1000 | LOCATION_DISCREPANCY_ALERT | the phone's GPS is probably not the incident location |
| 13–15 | — | reserved | 0 |

### LocationConfidenceType (not transmitted directly; it sets flag bits)

| Value | Name |
|---|---|
| 0 | DIRECT_ON_SCENE |
| 1 | PROXIMATE_OFFSET |
| 2 | LANDMARK_POI |
| 3 | EXPLICIT_ADDRESS |

### GpsAccuracy (3 bits)

`GpsAccuracy.from_meters(m)` buckets the browser's `coords.accuracy`, in meters. `None` or a negative value → NO_FIX.

| Value | Name | Accuracy |
|---|---|---|
| 0 | NO_FIX | lat/lon are meaningless |
| 1 | M5 | ≤ 5 m |
| 2 | M10 | ≤ 10 m |
| 3 | M25 | ≤ 25 m |
| 4 | M50 | ≤ 50 m |
| 5 | M100 | ≤ 100 m |
| 6 | M500 | ≤ 500 m |
| 7 | COARSE | > 500 m |

### Models

**`TriageSlotResult`:**

| Field | Type / default |
|---|---|
| priority | TriagePriority |
| hazard | HazardClass, default NONE |
| rescue_status | RescueStatus, default UNKNOWN |
| adult_count | int, 0–15, clamped, default 1 |
| pediatric_count | int, 0–15, clamped, default 0 |
| medical_flags | MedicalFlags |
| is_third_party_report | bool |
| location_type | LocationConfidenceType |
| extracted_location_text | optional str |
| confidence | float |
| raw_text | optional str |
| extraction_latency_ms | optional float |

**`EmergencyPacket`:**

| Field | Type / default |
|---|---|
| slots | TriageSlotResult |
| latitude | float, −90 to 90 |
| longitude | float, −180 to 180 |
| gps_accuracy | GpsAccuracy, default NO_FIX |
| timestamp | int, default `int(time.time())` |
| device_id | int, 0–65535, default 0 |
| seq | int, 0–255, default 0 |

---

## 3. The 18-byte frame, format version 1 (`src/serialization/bit_packer.py`)

Big-endian. Exactly 18 bytes. **No application checksum:** the SX1262 hardware CRC protects the radio hop, and TCP protects the Wi-Fi hop. No CBOR wrapper.

| Byte(s) | Bits | Field | Encoding |
|---|---|---|---|
| 0x00 | 0–1 (LSB) | priority | TriagePriority |
| 0x00 | 2–5 | hazard | HazardClass |
| 0x00 | 6–7 | rescue_status | RescueStatus |
| 0x01 | 0–3 | adult_count | 0–15, clamped |
| 0x01 | 4–7 | pediatric_count | 0–15, clamped |
| 0x02–0x03 | 16 | flags | MedicalFlags, `>H` |
| 0x04–0x06 | 24 | latitude | signed int24 = `round(lat / 90 × (2²³−1))`, clamped to ±(2²³−1). ~1.2 m resolution. |
| 0x07–0x09 | 24 | longitude | signed int24 = `round(lon / 180 × (2²³−1))`. ~2.4 m at the equator. |
| 0x0A–0x0D | 32 | timestamp | uint32 POSIX seconds |
| 0x0E–0x0F | 16 | device_id | uint16, random per app install |
| 0x10 | 8 | seq | uint8 per-device counter, wraps at 255. `(device_id, seq)` deduplicates mesh repeats and retries. |
| 0x11 | 0–2 | spare | 0 |
| 0x11 | 3–5 | gps_accuracy | GpsAccuracy |
| 0x11 | 6–7 | version | **1**. The unpacker raises `ValueError` on any other version or on a length ≠ 18. |

**Packer rule for the flag bits:** start from `slots.medical_flags`, then:
- if `is_third_party_report`: add THIRD_PARTY_REPORT | LOCATION_DISCREPANCY_ALERT
- if location_type is PROXIMATE_OFFSET: add LOC_PROXIMATE | LOCATION_DISCREPANCY_ALERT
- if location_type is LANDMARK_POI: add LOC_LANDMARK | LOCATION_DISCREPANCY_ALERT
- if location_type is EXPLICIT_ADDRESS: add LOC_EXPLICIT_ADDRESS | LOCATION_DISCREPANCY_ALERT

The unpacker derives `is_third_party_report` from THIRD_PARTY_REPORT. It derives `location_type` from the LOC_* bits, with priority ADDRESS > LANDMARK > PROXIMATE.

**Coordinate math:** use **double precision** in C and JS. A float32 version is off by one unit (~2 m).

### Test vectors

Every implementation (Python, JS, C) must reproduce these exactly.

1. **Main vector.**
   - Fields:
     - priority = IMMEDIATE, hazard = FLOOD, status = TRAPPED
     - 2 adults, 1 child
     - flags = INSULIN
     - lat 30.2672, lon −97.7431
     - ts 1760000000, device 0xBEEF, seq 0
     - gps_accuracy = M10
   - Bytes: `861200012B0BF3BA7E6A68E77800BEEF0050`
2. **Third-party / address vector.**
   - Fields:
     - priority = IMMEDIATE, hazard = MEDICAL_CRISIS, status = TRAPPED
     - 1 adult, 0 children
     - medical_flags = none
     - is_third_party_report = true, location_type = EXPLICIT_ADDRESS (so flags become 0x1900)
     - same lat, lon and ts as vector 1
     - device 0, seq 0, gps NO_FIX
   - Bytes: `9E0119002B0BF3BA7E6A68E7780000000040`

### Required packer tests

- every frame is 18 bytes
- byte 0 and 1 bit positions are correct
- headcounts saturate at 15
- round-trip coordinates within 1.1e-5° (latitude) and 2.2e-5° (longitude) at (±90, ±180), (0, 0), (−33.8688, 151.2093) and (64.1466, −21.9426)
- the tail bytes (timestamp, device, seq, GPS bucket, version) land in the right places
- wrong version and wrong length are rejected
- GPS bucketing: None→0, 3.2→1, 10→2, 480→6, 2000→7
- both test vectors

---

## 4. Labeling rules (version 2) — use these everywhere

These rules apply to the generator prompt, the checker's questions, chatbot prompts and the test set.

- **Headcounts:** the number of people at the scene of the emergency, including the writer if the writer is there: the people responders would find on arrival, **including anyone deceased**.
  - Pets don't count.
  - If no number is given, count the people the message mentions. A writer alone at the scene is 1 adult.
- **Third-party (`is_third_party`):** true **only** when the writer is NOT at the scene, so the phone's location is not where help is needed (e.g. a relative who phoned them, an incident seen from blocks away).
  - A writer at the scene reporting about someone next to them is NOT a third party ("my husband is pinned", "found a man in the ditch").
- **Unknown status:** the message reveals nothing about where the victims are or whether they can move.
- **Row format for every dataset** (JSONL, one object per line):
  ```
  {"id": str, "text": str, "triage_priority": "Minor|Delayed|Immediate|Deceased", "hazard_class": "<HazardClass name>",
   "rescue_status": "Sheltered|Exposed|Trapped|Unknown", "adult_count": int, "pediatric_count": int,
   "medical_flags": [<subset of the 8 medical names>], "is_third_party": bool,
   "style": str, "language": "English|Spanish|mixed English and Spanish", "writer": str, "label_version": 2}
  ```
  The test set (Appendix A) also has `location_type` and sometimes `location_text`.

Put `LABEL_VERSION = 2` and the two rules above, as `COUNT_RULE` and `THIRD_PARTY_RULE` strings, in `training/common.py`. The generator prompt, the checker's questions and the chatbot prompts all use that same text.

---

## 5. The on-device model

### 5.0 Two stages: an untrained demo model first, fine-tuning last

**Stage 1 — demo model (built first, no training).**
- Use `BAAI/bge-small-en-v1.5` **zero-shot**, by prototype matching:
  1. Embed the message: masked mean pooling over the last hidden state, then L2-normalize.
  2. For each class, the prototype is the mean of the normalized embeddings of its example sentences (below).
  3. Per field, pick the class with the highest cosine similarity.
- Prototypes are precomputed once in Python (`stage1/build_prototypes.py` → `prototypes.json`, 384 floats per class, label order as in §2). The browser only embeds the message.
- **Priority, hazard and status** come from prototypes.
- **Status UNKNOWN:** predict it when the top status similarity minus the second is below `unknown_margin`. Tune `unknown_margin` on the chatbot rows (§8), **never on Appendix A**. Start at 0.02.
- **Medical flags:** the keyword resolver (§5.4) is the only source in Stage 1.
- **Third-party:** the website asks the user directly: "Are you at the emergency?" (§12). The location resolver pre-fills a suggestion.
- **Headcounts and location:** the resolvers (§5.4).
- **No prototype for OTHER.** The user can pick it on the confirmation screen.
- **Expected quality:** prototype matching tends to judge a message by its topic rather than its severity, and it ignores negation. Expect it to over-call Red. That is acceptable for a demo, because the survivor confirms or edits every field before sending. Measure it on Appendix A and the chatbot rows during the event.

**Stage 2 — fine-tuned classifier (§5.1–5.3, §6–9), built only after the demo works end to end (§15).**
- Swap it in only if it beats Stage 1 on **both** Appendix A and validation, on Red recall and whole-summary accuracy.

**Swappable model interface.** The website reads `model/model.json`:

| `kind` | Files | `classify(text)` returns |
|---|---|---|
| `"prototype"` (Stage 1) | `embedder.onnx.gz` + `prototypes.json` + `tokenizer.json` + thresholds | priority/hazard/status scores; medical = null; third_party = null |
| `"classifier"` (Stage 2) | `classifier.onnx.gz` + `tokenizer.json` + thresholds | the five head outputs |

`classify(text)` always returns `{priority, hazard, status, medicalProbs | null, thirdPartyProb | null, scores}`. The rest of the app never needs to know which stage is loaded.

**Stage 1 example sentences (verbatim).** These were written alongside the test set, so Stage 1's scores on Appendix A will be optimistic.

- **IMMEDIATE:**
  - "Critical life-threatening emergency! Active arterial bleeding, cannot breath, trapped in rising flood water or fire."
  - "Trapped in collapsing building or attic with water rising. Unconscious victim, severe trauma, urgent rescue needed!"
- **DELAYED:**
  - "Serious injury, broken bones, dislocated shoulder, non-ambulatory, but stable in safe shelter."
  - "Road washed out, bridge collapsed, stranded but safe inside with food, non-critical medical condition."
- **MINOR:**
  - "Minor cuts, safe from danger, walking wounded, house intact, requesting drinking water or power update."
  - "We are safe and uninjured, plenty of food, no emergency medical need."
- **DECEASED:**
  - "Victim unresponsive, no pulse, cold and stiff, deceased body found under rubble."
  - "Fatal head trauma, no sign of life, victim has died."
- **Hazards (one sentence each):**

  | Hazard | Sentence |
  |---|---|
  | NONE | "no hazard, clear area, normal safe conditions" |
  | FLOOD | "rising flood water, submerged, drowning, river overflow, boat rescue" |
  | FIRE_SMOKE | "active fire, thick black smoke, flames burning, wildfire surrounding" |
  | STRUCTURAL_COLLAPSE | "building collapsed, rubble, trapped under concrete slab or beam" |
  | HAZMAT_GAS | "strong gas leak smell, toxic chemical fumes, chlorine leak, vomiting" |
  | ELECTRICAL_POWER | "sparking power line, downed high voltage line, transformer exploded" |
  | EXTREME_WEATHER | "tornado, hurricane wind, hail broke roof, severe storm damage" |
  | MEDICAL_CRISIS | "severe medical emergency, diabetic shock, arterial bleeding, heart attack" |
  | ACTIVE_VIOLENCE | "active shooter, gunfire, barricaded in room, hostile threat" |
  | TSUNAMI_SURGE | "tsunami warning, ocean receding, storm surge wave approaching" |
  | LANDSLIDE | "mudslide, landslide swept house, buried in mud debris" |
  | HYPOTHERMIA_FREEZE | "freezing blizzard, subzero cold, severe hypothermia, blue lips" |
  | HEAT_STROKE | "extreme heat wave, no air conditioning, overheating, heat stroke, confused and not sweating" |
  | SINKHOLE_SUBSIDENCE | "sinkhole opened up, ground collapsing under the road or house, earth giving way" |
  | CONTAMINATED_WATER | "water main broke, tap water contaminated, no clean drinking water" |

- **Status:**

  | Status | Sentence |
  |---|---|
  | TRAPPED | "trapped inside, pinned under rubble, attic door stuck, cannot escape" |
  | EXPOSED | "outdoors in storm, stranded on roof, in water, exposed to elements" |
  | SHELTERED | "safe inside house, dry shelter, protected in basement or hall" |

Also build a Python reference (`src/models/prototype_classifier.py`, same interface as the Stage 2 extractor), so `evaluate_dataset.py` can score Stage 1 and the JS version can be parity-tested against it.

### 5.1 Base model (Stage 2 — fine-tuned classifier)

Decision rule: train **both** candidates on the same data. Ship the one with:
1. the higher **Red recall** on the 54-message test set, then
2. the higher **whole-summary accuracy**,

as long as it fits the 30 MB gzipped budget.

| Role | Hugging Face id | Size | Notes |
|---|---|---|---|
| **Primary** | `BAAI/bge-small-en-v1.5` | 33.4M params, 12 layers, 384 hidden | Strong small embedding model. Expect roughly 20–25 MB as gzipped INT8 ONNX (estimate from parameter count; measure it). |
| **Fallback** | `sentence-transformers/all-MiniLM-L6-v2` | 22.7M params, 6 layers, 384 hidden | Smaller and faster (half the layers). Use it if bge-small is too big or slow on the phone. |

**Out of scope:** generative small language models (too slow and too large for the phone budget, and they can emit malformed output) and models much larger than ~35M parameters (the size budget).

### 5.2 Stage 2 architecture (`src/models/triage_classifier.py`, class `TriageClassifier(nn.Module)`)

- **Encoder:** `AutoModel.from_pretrained(base_model)`.
- **Pooling:** masked **mean pooling** over the last hidden state.
- **Dropout:** 0.1.
- **Five linear heads** on the pooled vector:

  | Head | Outputs | Activation |
  |---|---|---|
  | priority | 4 | softmax |
  | hazard | 16 | softmax |
  | status | 4 | softmax |
  | medical | 8 | sigmoid; bit order = flag bits 0–7 |
  | third_party | 1 | sigmoid |

- `forward(input_ids, attention_mask)` returns a dict of logits per head.
- **Tokenization:** the base model's tokenizer, `truncation=True, max_length=128`. That is ~85–100 words of messy text, so training messages stay ≤ 90 words.

### 5.3 Stage 2 decoding (`FinetunedTriageExtractor(model_dir)`)

The extractor loads `config.json`, the tokenizer and `model.pt`.

- **Priority:** if P(IMMEDIATE) ≥ `red_threshold`, predict IMMEDIATE. Otherwise predict the argmax of the other three classes.
- **Hazard and status:** argmax.
- **Medical flag *i*:** on if sigmoid_i ≥ `medical_thresholds[i]`. Then **OR** the result with the medical keyword backstop (§5.4).
- **Third party:** sigmoid ≥ `third_party_threshold`, **from the model only**. If true, set THIRD_PARTY_REPORT | LOCATION_DISCREPANCY_ALERT.
- **Headcounts:** the headcount resolver (§5.4).
- **Location type and text:** the location resolver (§5.4). Its flags are OR'd in.
- Fill `extraction_latency_ms`.

### 5.4 Deterministic resolvers (`src/models/resolvers.py`, used by both stages)

Write these as **generic** patterns. **Do not copy phrases from Appendix A.** Test them with your own example sentences.

#### Headcount resolver → `(adults, children)`

**Number words:**
- digits 0–99
- English: one–twenty
- "a couple" = 2, "both of us" = 2, "twins" = 2 children
- Spanish: un/uno/una, dos, tres, cuatro, cinco, seis, siete, ocho, nueve, diez

**Nouns:**
- **Child nouns:** baby/babies, infant(s), newborn(s), toddler(s), kid(s), child/children, son(s), daughter(s), boy(s), girl(s), teen(s)/teenager(s); Spanish bebé/bebe(s), niño/niña(s), hijo/hija(s).
- **Adult or generic nouns:** adult(s), people, **ppl**, person(s), "of us", men, women, neighbors, workers, passengers, students, guests; Spanish personas, adultos.

**Rules:**
1. "N <child noun>" → children = N. A child noun without a number → children = 1.
2. "N <adult noun>" → adults = N. If the noun is generic ("people", "of us"…) and children were found and N > children, then adults = N − children.
3. "me and my <adult relation: wife/husband/mom/dad/sister/brother/partner/friend/grandma…>" → at least 2 adults. "me and my N kids" → 1 adult + N children.
4. "alone" / "just me" → 1 adult.
5. Default: 1 adult, 0 children.
6. Clamp both to 0–15.

Unit-test it, including "4 ppl", "1 kid", "mi bebé", "me and my 2 kids", "3 of us" and "two adults and a toddler".

#### Medical keyword backstop → MedicalFlags bits 0–7

Case-insensitive. Use word-boundary regex. Handle common typos ("cant breath").

| Flag | Keywords |
|---|---|
| INSULIN | insulin, diabetic, diabetes, blood sugar, "sugar is/sugar's", type 1, type 2; insulina, diabétic- |
| OXYGEN | can't/cant/cannot breathe/breath, trouble breathing, gasping, choking on smoke, oxygen, inhaler, asthma; no puedo respirar |
| BLEEDING | bleeding, blood everywhere, hemorrhag-, gash, deep cut, tourniquet; sangr- |
| HYPOTHERMIA | hypotherm-, freezing cold, shivering, frostbite, blue lips; hipotermia |
| MOBILITY_IMPAIRED | wheelchair, can't/cannot walk, broken leg/hip/pelvis, pinned, bedridden, paralyz-; silla de ruedas |
| CARDIAC | chest pain, heart attack, cardiac, pacemaker, heart condition; dolor de pecho, infarto |
| PREGNANCY_INFANT | pregnant, contractions, in labor, water broke, newborn, infant; embarazada |
| BURNS | burned, burns, burnt, scald-, blister-; quemad- — but not "burn barrel" or "sunburn" |

#### Location resolver → `(location_type, location_text, flags)`

1. **Explicit street address** (case-insensitive): a house number of 1–5 digits, then a street name of a few words, then a street-type word: Lane/Ln, Street/St, Road/Rd, Avenue/Ave, Boulevard/Blvd, Drive/Dr, Court/Ct, Way, Highway/Hwy, Terrace, Place/Pl. → EXPLICIT_ADDRESS, with the matched address as the location text.
2. **Landmark:** any of these words as whole words: walmart, target, costco, home depot, kroger, heb, safeway, walgreens, cvs, high school, middle school, elementary school, school, hospital, clinic, church, stadium, mall, library, city hall, airport, fire station, police station, bridge, overpass. → LANDMARK_POI, unless an address was already found.
3. **Offset:** any of these phrases: "a few blocks away", "down the street", "across the street", "nearby", "around the corner", "blocks north", "blocks south", "miles away". → PROXIMATE_OFFSET if nothing else was found; otherwise appended to the location text in parentheses.

---

## 9. Fine-tuning (`training/train.py`)

**Data:**
- Training: kept rows from `scored.jsonl`.
- `--val-writer chatbot`: every chatbot row is excluded from training and used for validation instead. Validation picks the best epoch, tunes every threshold, and exposes overfitting to the training writers' style.
- Without `--val-writer`: a 10% md5-hash split.
- `--unverified [--writer X]`: train on `raw.jsonl` without the check. For quick experiments only.

**Soft targets** for priority, hazard, status, medical and third-party:
`target = 0.7 × one_hot(intended label) + 0.3 × Jev's probabilities` (normalized).
Rows without Jev scores use the hard label.

**Loss:**
- **Priority:** soft cross-entropy, `−Σ target · w · log_softmax`, with **class weights [Minor 1, Delayed 1, Immediate 2, Deceased 1]**. A missed Red costs double.
- **Hazard and status:** soft cross-entropy.
- **Medical (8) and third-party (1):** `binary_cross_entropy_with_logits` with **pos_weight = clamp((N − positives) / positives, 1, 4)**, computed per label from the training rows.
  - Why: without a weight, rare flags are never worth predicting, so the model learns to always say "no". An uncapped or very high weight swings the other way into constant false alarms. **A cap of 4 plus per-flag thresholds tuned on validation** balances the two.
- **Total loss = 2.0·priority + 1.0·hazard + 1.0·status + 1.0·medical + 0.5·third_party.**

**Optimizer and schedule:**
- AdamW, encoder lr **5e-5**, heads lr **1e-3** (20×), weight decay **0.01**
- linear schedule with **6% warmup**
- gradient clip **1.0**
- batch size **32**, shuffled
- **4 epochs** for ~5,000 rows; **15** for a few hundred rows
- device: MPS, then CUDA, then CPU
- seed 0

**Best epoch:** after each epoch, predict on validation and compute the score `mean(priority_acc, red_recall, hazard_acc, status_acc, medical_f1)`, all at threshold 0.5. Keep a CPU copy of the best epoch's weights and reload them at the end.

**Thresholds, all tuned on validation with the best weights:**
- `red_threshold`: the **highest** t in 0.05…0.50 (step 0.01) whose validation Red recall is ≥ **0.95**. If none reaches it, use 0.05.
- `medical_thresholds[i]` and `third_party_threshold`: the t in 0.10…0.90 (step 0.05) with the best validation F1. Ties go to the t closest to 0.5. Use 0.5 if validation has fewer than 3 positives.

**Output** `models/triage-<name>/`:
- `model.pt` (state dict)
- tokenizer files
- `config.json`:
  - `base_model`
  - `red_threshold`, `medical_thresholds`, `third_party_threshold`
  - `labels`
  - `train_rows`, `val_rows`, `best_epoch`
  - `hyperparams`
  - `val_metrics`, `test_metrics`

**Print at the end:**
- the validation metrics
- the **test metrics on Appendix A**, labeled "never trained on"

**Commands:**
- `python3 -m training.train --val-writer chatbot --base-model BAAI/bge-small-en-v1.5 --out models/triage-bge-small`
- `python3 -m training.train --val-writer chatbot --out models/triage-minilm` (default base: MiniLM-L6)

### Evaluation script (`benchmark/evaluate_dataset.py`)

`--data <json|jsonl> --models <keys or model dirs> [--writer X] [--examples 25]`

It writes `artifacts/eval_<data>_<model>.md` with:
- per-field accuracy: priority (with Red recall and precision), hazard, status, exact headcounts, exact medical set, third-party
- **whole-summary accuracy**: every field of the confirmation line right
- confusion matrices for priority and status
- per-flag recall and precision, with missed and false-alarm counts
- the top hazard confusions
- up to N example errors per field
- 15 summary-line examples

The summary format is `Red · FLOOD · Trapped · 2 adults + 1 child · INSULIN`.

---

## 10. Targets and how to measure them

- Measure every model (Stage 1 and Stage 2) with `evaluate_dataset.py` on **Appendix A** and on the **chatbot rows** (validation). Report both.
- **Red recall ≥ 95%** on Appendix A, with Red precision reported alongside.
- **Whole-summary accuracy** (every field of the confirmation line right) as high as possible. This is the number that best predicts how often a survivor won't need to edit anything.
- Remember the scale: Appendix A has 54 messages, so one message ≈ 1.9 points of accuracy and one Red ≈ 3.6 points of Red recall. Don't over-read small differences.

---

## 11. Export to the browser (`training/export_onnx.py`)

### 11.1 Stage 1: embedding model (needed for the demo)

1. Wrap `AutoModel("BAAI/bge-small-en-v1.5")` so `forward(input_ids, attention_mask)` returns the **mean-pooled, L2-normalized embedding** `[batch, 384]`, with pooling inside the graph.
2. Export to ONNX: opset ≥ 17, dynamic batch and sequence axes.
3. INT8 dynamic quantization with `onnxruntime.quantization.quantize_dynamic`, then `gzip -9`.
4. **Parity check** on the chatbot rows:
   - mean cosine(PyTorch embedding, INT8 embedding) ≥ 0.99
   - the decoded fields match on ≥ 98% of fields
5. **Check the quantization cost:** compare INT8 against PyTorch on the chatbot rows. If INT8 loses more than 3 points of Red recall, also try `per_channel=True`, or ship FP16. Report the size.
6. Output `web/public/model/`:
   - `embedder.onnx.gz`
   - `tokenizer.json`
   - `prototypes.json`
   - `model.json`: `{"kind": "prototype", "unknown_margin": …, "labels": {…}}`

### 11.2 Stage 2: classifier (fine-tuning phase only)

1. Wrap `TriageClassifier` so it returns 5 logit tensors, in order: priority, hazard, status, medical, third_party.
2. Export the same way: ONNX opset ≥ 17, dynamic axes, INT8 dynamic quantization, `gzip -9`.
3. **Parity:** decoded fields from INT8 must match PyTorch on ≥ 98% of fields over 200 validation rows. The gzipped size must be ≤ 30 MB.
4. Output `classifier.onnx.gz` and `model.json`: `{"kind": "classifier", "red_threshold", "medical_thresholds", "third_party_threshold", "labels"}`. Swapping models is just replacing the files in `web/public/model/`.

---

### §12.1 (excerpt relevant to you — what Track 4 will port from your Python)

### 12.1 Stack

- **Vite + React + TypeScript + Tailwind CSS.** Icons from `lucide-react`. Fonts bundled locally (e.g. Inter); **no runtime CDN requests of any kind**.
- **Offline:** `vite-plugin-pwa` (Workbox), precaching the app and everything in `public/model/`. Raise `maximumFileSizeToCacheInBytes` to 40 MB.
- **Inference:** `onnxruntime-web`, WASM backend.
  - Serve the `.wasm` files locally and set `ort.env.wasm.wasmPaths`.
  - `numThreads = 1` for iOS safety.
  - Use WebGPU only if available and tested.
  - Decompress the model with `DecompressionStream('gzip')`.
- **Tokenizer:** `@huggingface/transformers` (transformers.js) `AutoTokenizer`, loading the local `tokenizer.json` with `env.allowRemoteModels = false`.
  - **OPEN:** verify this loads fully offline on iOS Safari.
  - Fallback: implement BERT WordPiece directly from `tokenizer.json` (lowercase, basic punctuation split, greedy longest-match with `##` continuation pieces, `[CLS]`/`[SEP]`, max 128).
- **Port to `src/lib/`:**
  - the §5.0 / §5.3 decoding
  - the §5.4 resolvers
  - the §3 packer (double precision)
- **Tests (Vitest):**
  - the JS packer reproduces both §3 test vectors
  - the JS resolvers and decoding match the Python reference on 50 sentences

---

### §6 and §7, for context only (Track 3 builds these; you consume `scored.jsonl`)

The row format in §4 is what you read. The fields you use from §7's checker output: `jev_priority`[4], `jev_hazard`[16], `jev_status`[4] (probabilities in enum order), `jev_adults`, `jev_children` (argmax ints), `jev_third_party` (p), `jev_medical`[8] (p), and `keep`. Soft targets (§9) use these.

---

## 14. Project layout to create

```
civicmesh-sos/
├── requirements.txt          # torch transformers tokenizers onnx onnxruntime pydantic requests tqdm numpy pytest pyserial fastapi uvicorn
├── src/schema.py
├── src/serialization/bit_packer.py
├── src/models/resolvers.py
├── src/models/prototype_classifier.py   # Stage 1 Python reference
├── src/models/triage_classifier.py      # Stage 2
├── stage1/build_prototypes.py           # → web/public/model/prototypes.json
├── training/common.py        # label lists, descriptions, LABEL_VERSION, COUNT_RULE, THIRD_PARTY_RULE, OpenRouter client, JSONL helpers
├── training/export_onnx.py   # §11.1 and §11.2
├── training/generate.py  training/verify.py  training/import_chatbot.py  training/train.py
├── training/chatbot_prompt_A.md  _B.md  _C.md   # Appendix C
├── benchmark/evaluate_dataset.py
├── data/benchmark_dataset.jsonl   # Appendix A, verbatim
├── data/synthetic/                # raw.jsonl, scored.jsonl (generated)
├── firmware/radio_test/radio_test.ino   # written during the event from Appendix B's description
├── firmware/field_node/field_node.ino
├── firmware/base_station/base_station.ino
├── bridge/server.py               # FastAPI + serial + SQLite + WebSocket + --simulate
├── dashboard/                     # Vite + React + TS + Tailwind + MapLibre + PMTiles
├── web/                           # survivor PWA: Vite + React + TS + Tailwind + onnxruntime-web
├── design/REFERENCES.md           # Dribbble references + design tokens
└── tests/                         # packer, resolvers, importer; Vitest in web/ for JS parity
```

Run Python scripts as modules from the project root (`python3 -m training.generate`). Node.js 20+ for `web/` and `dashboard/`.

---

## 15. Hackathon schedule (24 h): demo first, fine-tuning last

### Phase A — Working demo with the Stage 1 model (hours 0–15)

| Hours | Work | Done when |
|---|---|---|
| 0–1 | Project skeleton, schema, packer and tests | Both §3 test vectors pass |
| 0–1 (in parallel) | Write the radio link test from Appendix B's description and flash both boards | Receiver prints `FRAME 861200012B0BF3BA7E6A68E77800BEEF0050 …` (bytes 10–13 and 16 change per frame) |
| 1–2 (in parallel, a human task) | Run the three chatbot prompts (Appendix C) in a chatbot; import with the pre-import checks | 310 rows in `raw.jsonl`, none close to a test message |
| 1–3 | Resolvers + tests; Stage 1 prototypes + Python reference; `evaluate_dataset.py`; tune `unknown_margin` on the chatbot rows | Stage 1 scored on Appendix A and the chatbot rows |
| 3–5 | §11.1 export: embedder INT8 + gzip + parity | Parity passes; size reported |
| 2–7 (in parallel) | Bridge server with `--simulate`; dashboard (Dribbble references first) | Simulated pins appear live; click shows the byte breakdown; remove + undo work |
| 5–7 (in parallel) | Field node firmware | A hand-typed `http://192.168.4.1/sos?d=…` puts a pin on the dashboard |
| 5–12 | Survivor website (Dribbble references first) | Vitest: the JS packer matches the test vectors, and JS/Python parity passes; works in Airplane Mode after one visit |
| 12–15 | End-to-end in Airplane Mode on iPhone **and** Android | The demo script (§13.5) works 5 times in a row → **DEMO FREEZE**: tag the commit and don't break it |

### Phase B — Fine-tuning (hours 15–22, only after the demo freeze)

| Hours | Work | Done when |
|---|---|---|
| 15–16 | Verify the OpenRouter and Jev endpoints with one call each; `verify --benchmark`; `generate --n 200` and read the rows | Endpoints confirmed; generated rows look realistic |
| 16–17 | `generate --n 5000`, then `verify` | Keep rate and per-writer report reviewed |
| 17–19 | Train bge-small (and MiniLM if time allows), `--val-writer chatbot` | Both scored on Appendix A and validation |
| 19–21 | §11.2 export; swap behind `model.json` on a branch | Ship **only** if it beats Stage 1 on Red recall and whole-summary accuracy on Appendix A **and** validation. Otherwise keep Stage 1. |

### Phase C — hours 22–24

Optional ACK, polish, slides, rehearsal, buffer.

**Optional speed-up:** generation is mostly waiting on the API. If someone is idle during Phase A, they can run Phase B's first two rows early in the background. Never at the expense of Phase A.

---

## 16. Pitfalls and open items

- **Map tiles:** never bulk-download openstreetmap.org tiles; use the PMTiles extract. Have the plain-grid fallback ready.
- **Offline means no CDNs:** no Google Fonts, unpkg or cdnjs at runtime in either web app. Bundle everything.
- **vite-plugin-pwa skips large files by default.** Raise `maximumFileSizeToCacheInBytes`, or the model won't be cached and the app breaks in Airplane Mode.
- **onnxruntime-web needs its `.wasm` files served locally** (`ort.env.wasm.wasmPaths`). Test in Airplane Mode on a real iPhone early: memory and speed on iOS Safari are unmeasured.
- **Quantization accuracy:** INT8 can cost a few points of accuracy. Measure it (§11.1).
- **Stage 1 judges topic more than severity,** so expect it to over-call Red. The Review screen is the mitigation; make editing priority one tap.
- **Original message text is never transmitted.** The dashboard shows decoded fields and the raw 18 bytes, not the survivor's words.
- **OPEN:** the OpenRouter `/systemone` path and payload for Jev. Test one call before any batch run. Fallback: TypeSafe's direct API.
- **OPEN:** whether both writer models accept `reasoning: {"enabled": false}` and `response_format: json_object`. Test one call each. If either is rejected, remove that field.
- Never tune or select anything on Appendix A. It has only 54 messages: one message ≈ 1.9 points of accuracy, one Red ≈ 3.6 points of Red recall.
- Appendix A's mix is 28 Immediate / 10 Delayed / 13 Minor / 3 Deceased, and status is 26 Sheltered / 20 Trapped / 7 Exposed / 1 Unknown. It barely tests Unknown and Deceased, so also report validation (chatbot-writer) metrics.
- Validating on the same writers you train on hides overfitting to style. Always use `--val-writer chatbot` for real runs.
- A Red threshold tuned on ~30 rows is noise.
- On macOS zsh, an unquoted `$var` in a `for` loop is not split into words. Write separate commands.
- Coordinates: double precision in C and JS (float32 is off by ~2 m).
- Both boards must use the same spreading factor, sync word and frequency.

---

## Appendix A — Test set (54 messages, verbatim). Save as `data/benchmark_dataset.jsonl`. NEVER train or tune on it.

````jsonl
{"id": "flood_01", "text": "Water rising fast in attic! 2 adults and 1 toddler trapped. Mother needs insulin urgently!!", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["INSULIN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "flood_02", "text": "roof caved in water up to our chests 3 people here hypothermia setting in cant swim help us please", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["HYPOTHERMIA"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "flood_03", "text": "ON THE ROOF WITH 2 BABIES AND MY WIFE. FLOOD WATER CURRENT IS STRONG. PLEASE SEND A BOAT", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Exposed", "adult_count": 2, "pediatric_count": 2, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "flood_04", "text": "stuck on second floor water reached 1st floor ceiling. Just me here, power out, oxygen concentrator battery dying fast 15% left", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "collapse_01", "text": "Concrete slab fell on my husband legs pinned and bleeding heavily from deep cut. 2 adults trapped in basement.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["BLEEDING", "MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "collapse_02", "text": "Stairwell collapsed, 4 of us on 3rd floor cannot get down, smoke coming up. One pregnant woman having contractions.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 4, "pediatric_count": 0, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "collapse_03", "text": "Building fell down. Cant breath dust everywhere. Me and my 8yr old son under table. Help us!!", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 1, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "fire_01", "text": "Flames surrounding driveway, car won't start. 2 people, severe 3rd degree burns on hands and face.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["BURNS"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "fire_02", "text": "Heavy black smoke filling apartment, coughing blood. Elderly grandmother unable to walk without wheelchair.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["OXYGEN", "MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_01", "text": "Roof sustained minor leak. My father slipped and dislocated shoulder, cannot move arm. We have food and dry shelter for 3 people.", "triage_priority": "Delayed", "hazard_class": "EXTREME_WEATHER", "rescue_status": "Sheltered", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_02", "text": "Road is washed out by river. We are 5 adults stranded at camp cabin. Stable, but out of prescription cardiac medication since yesterday.", "triage_priority": "Delayed", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 5, "pediatric_count": 0, "medical_flags": ["CARDIAC"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_03", "text": "Tree fell across front porch blocking door. We can climb out back window if needed. 1 broken wrist on teenager, 2 adults. Safe from storm for now.", "triage_priority": "Delayed", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_04", "text": "Car broke down in blizzard off highway 80. Engine running low on fuel. 2 adults and infant. Warm clothes but need towing before dark.", "triage_priority": "Delayed", "hazard_class": "HYPOTHERMIA_FREEZE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_01", "text": "Power is out for 24 hours. We are 4 adults safe in house with non-perishable food. Just need drinking water delivery when available.", "triage_priority": "Minor", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Sheltered", "adult_count": 4, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_02", "text": "Minor scratches from broken glass, bandaged already. 2 people safe in community center basement. No immediate danger.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_03", "text": "Water in yard but house dry. Family of 3 with baby, we have 4 days food. Inquiring about evacuation shelter status.", "triage_priority": "Minor", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "black_01", "text": "One body found under collapsed masonry, no pulse for over 2 hours, unresponsive. Survivor 1 adult uninjured nearby.", "triage_priority": "Deceased", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Exposed", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_01", "text": "Water is outside the door but we are NOT trapped and NOT injured. 3 adults and 2 golden retrievers safe inside.", "triage_priority": "Minor", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_02", "text": "There are zero injuries here. Power line sparking on street outside. 1 person alone inside looking out window.", "triage_priority": "Minor", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_03", "text": "me, my husband, our two young daughters and my elderly grandmother trapped in attic. grandmother has heart failure and chest pain.", "triage_priority": "Immediate", "hazard_class": "NONE", "rescue_status": "Trapped", "adult_count": 3, "pediatric_count": 2, "medical_flags": ["MOBILITY_IMPAIRED", "CARDIAC"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_04", "text": "Severe gas leak smell throughout hallway! Sparks from fusebox. 6 people unable to exit due to jammed fire door. Hurry!", "triage_priority": "Immediate", "hazard_class": "HAZMAT_GAS", "rescue_status": "Trapped", "adult_count": 6, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_05", "text": "Active shooter reported down street, barricaded in classroom with 14 students and 1 teacher. Nobody wounded yet.", "triage_priority": "Immediate", "hazard_class": "ACTIVE_VIOLENCE", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 14, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "flood_05", "text": "Flash flood carried truck into ditch. Water up to dashboard and rising. 2 adults 1 baby trapped inside cab!", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "collapse_04", "text": "Tornado hit neighborhood. Our roof collapsed into hallway, 1 adult pinned under ceiling joist with broken pelvis and severe arterial bleeding.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["BLEEDING", "MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "fire_03", "text": "Wildfire jumped ridge line, house caught fire! 3 of us trapped in swimming pool with wet towels, extreme smoke inhalation cannot breath.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Trapped", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["OXYGEN", "BURNS"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "med_01", "text": "72-year-old grandfather in severe diabetic ketoacidosis, unconscious, insulin was destroyed in flood. 2 adults here.", "triage_priority": "Immediate", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["INSULIN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "med_02", "text": "Chainsaw accident while clearing storm debris, deep laceration to thigh, spurting blood, tourniquet applied. 1 victim.", "triage_priority": "Immediate", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["BLEEDING"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "freeze_01", "text": "Furnace failed in -20F blizzard. 2 adults and 3 children under blankets, 1 baby showing signs of severe hypothermia lips turning blue.", "triage_priority": "Immediate", "hazard_class": "HYPOTHERMIA_FREEZE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 3, "medical_flags": ["HYPOTHERMIA", "PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "hazmat_01", "text": "Train derailment nearby, strong chlorine gas smell burning eyes and throat, 4 people vomiting and gasping for air.", "triage_priority": "Immediate", "hazard_class": "HAZMAT_GAS", "rescue_status": "Exposed", "adult_count": 4, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "power_01", "text": "High voltage power line fell onto our occupied SUV in rain. 2 adults inside. Tires smoking, afraid to step out.", "triage_priority": "Immediate", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "landslide_01", "text": "Mudslide swept through living room. My sister is buried to her waist in mud and debris, unable to extract her. 2 people total.", "triage_priority": "Immediate", "hazard_class": "LANDSLIDE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_05", "text": "Basement flooded with 2 feet of water. Furnaces off. 3 adults stranded on main floor. Cold but dry, need evacuation assist tomorrow.", "triage_priority": "Delayed", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_06", "text": "Earthquake cracked our walls, door is stuck shut but structure seems stable. 2 adults, 1 has sprained ankle. Food supplies good.", "triage_priority": "Delayed", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_07", "text": "Bridge washed out behind our subdivision. 8 adults cut off from main road. Everyone uninjured, seeking supplies.", "triage_priority": "Delayed", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 8, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_08", "text": "Grandmother's oxygen machine backup battery has 6 hours remaining. She is resting comfortably now with 2 adults watching her.", "triage_priority": "Delayed", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Sheltered", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_09", "text": "Chimney collapsed into yard. 4 adults, one cuts on arm cleaned and dressed. Road impassable due to fallen oak tree.", "triage_priority": "Delayed", "hazard_class": "EXTREME_WEATHER", "rescue_status": "Sheltered", "adult_count": 4, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_10", "text": "Boat engine died in floodwaters, drifting in slow eddy near trees. 3 adults wearing life vests, no immediate tipping danger.", "triage_priority": "Delayed", "hazard_class": "FLOOD", "rescue_status": "Exposed", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_04", "text": "Cell service down. 2 adults and 2 kids at home, completely safe, house intact, checking when grid power will be restored.", "triage_priority": "Minor", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 2, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_05", "text": "Water main broke down street, no tap water. 1 person alone in apartment. Plenty of canned food, just requesting drinking water.", "triage_priority": "Minor", "hazard_class": "CONTAMINATED_WATER", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_06", "text": "Hail broke skylight, water on rug. Cleaned up, plastic tarp placed. 2 adults doing fine.", "triage_priority": "Minor", "hazard_class": "EXTREME_WEATHER", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_07", "text": "Checking in for our block. 6 neighbors sheltering in church hall. Plenty of blankets and warm soup, no injuries whatsoever.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 6, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_08", "text": "Minor burn on finger from cooking candle, ointment applied. 1 adult. Safe in garage.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "black_02", "text": "Elderly neighbor passed away overnight from hypothermia, cold and stiff, no breathing or pulse. 1 survivor adult here.", "triage_priority": "Deceased", "hazard_class": "HYPOTHERMIA_FREEZE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "black_03", "text": "Found car submerged in canal, driver trapped underwater for 30 minutes, unrecoverable, dead. Calling from bank 1 person.", "triage_priority": "Deceased", "hazard_class": "FLOOD", "rescue_status": "Exposed", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_06", "text": "Do not send ambulance, no one is hurt. Fire is 3 blocks away, not threatening our house. 5 adults here safe.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 5, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_07", "text": "We are NOT out of food or water, no bleeding, no injuries. Tree fell in back yard. 2 adults.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_08", "text": "Overturned tour bus on highway overpass with 25 adults and children injured, multiple people trapped in wreckage.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 15, "pediatric_count": 5, "medical_flags": ["BLEEDING", "MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_09", "text": "MY MOM CANNOT BREATH. ASH EVERYWHERE. WE ARE 3 ADULTS TRAPPED IN BASEMENT DOOR JAMMED.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Trapped", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_10", "text": "Just 1 elderly person here, power is out. I have my insulin in a cooler with ice, so I am good for 48 hours. No assistance needed yet.", "triage_priority": "Minor", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tsunami_01", "text": "Tsunami warning sounded, ocean receded. 4 people running up hill toward high ground, completely exposed, no injuries yet.", "triage_priority": "Immediate", "hazard_class": "TSUNAMI_SURGE", "rescue_status": "Exposed", "adult_count": 4, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "proxy_01", "text": "My mom just called me and I heard her fall. She lives at 123 Applyberry Lane and has had previous medicial issues. PLEASE HURRY!", "triage_priority": "Immediate", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": true, "location_type": "EXPLICIT_ADDRESS", "location_text": "123 Applyberry Lane"}
{"id": "proxy_02", "text": "I live a few blocks away from a Walmart. I heard the building collapsed and people are screaming. Send help.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Unknown", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": true, "location_type": "LANDMARK_POI", "location_text": "Walmart (a few blocks away)"}
{"id": "proxy_03", "text": "Reporting on behalf of my elderly father at 450 Elm Street. His oxygen concentrator shut off with the storm outage, he is gasping for air!", "triage_priority": "Immediate", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": true, "location_type": "EXPLICIT_ADDRESS", "location_text": "450 Elm Street"}
{"id": "proxy_04", "text": "Can see smoke rising from North High School down the street. Roof partially caved in. People running outside.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Exposed", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": true, "location_type": "LANDMARK_POI", "location_text": "High School (down the street)"}
````
