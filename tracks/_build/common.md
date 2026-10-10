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
