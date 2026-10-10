# CivicMesh-SOS — Track 3 of 4: Operator Dashboard & Training Data

> **How to use:** give this entire document to your AI assistant at the start of the hackathon. It is your complete brief: your scope, your deadlines, the contracts other tracks depend on, and — in Part 3 — every section of `MASTER_PROMPT.md` you need, copied **verbatim**. `MASTER_PROMPT.md` in the repo root is the single source of truth for the whole project; if a spec number here ever disagrees with it, the master wins. Every number is decided; do not substitute your own values. Items marked **OPEN** must be verified before relying on them.

---

## Part 1 — Your role and scope

You are the engineering partner of the **Track 3 owner** on a four-person, 24-hour hackathon team building **CivicMesh-SOS**, an offline disaster-triage pipeline (phone → on-device model → 18-byte frame → Wi-Fi → LoRa → laptop dashboard; overview in §0 below).

**Track 3 owns the data that measures the model, and the screen the judges watch:**

1. **Hours 0–3: the chatbot validation data** (§8, Appendix C). A human task plus a script: run the three chatbot prompts (already saved as `training/chatbot_prompt_A.md`, `_B.md`, `_C.md`) in a chatbot, **a fresh chat for each**, save the replies to `data/chatA.txt`, `data/chatB.txt`, `data/chatC.txt`; write `training/import_chatbot.py` with its pre-import checks and tests; import the **310 rows** into `data/synthetic/raw.jsonl`. Track 1 needs these rows to tune and validate the Stage 1 model.
2. **Hours 2–12: the operator dashboard** (`dashboard/`, §13.4) — Dribbble references first, then a dark command-center UI on MapLibre with an offline PMTiles basemap, built against Track 2's bridge API (contract K3). Use mocks until the bridge's `--simulate` lands (hour 4).
3. **Phase B (hours 15–17, only after the demo freeze — or earlier in the background if idle, §15 "Optional speed-up"):** `training/generate.py` (§6) and `training/verify.py` (§7) — verify both endpoints with **one call each** first, then generate 5,000 rows and check them. Hand `data/synthetic/scored.jsonl` to Track 1 by hour 17.

You do **not** build the bridge (T2), the model or training (T1), or the survivor website (T4).

### Ground rules that bind you most (from §0 and §16)

- **Never fit anything to the test set** (Appendix A, saved at `data/benchmark_dataset.jsonl`): it is never imported into `raw.jsonl`, never used to pick thresholds. Your importer **flags any chatbot row too similar to a test message** (difflib ratio > 0.55) — drop or rewrite those rows.
- **Verify unverified APIs with a single call before any batch run** (§16): OpenRouter writers (`reasoning`, `response_format`) and the Jev `/systemone` endpoint are **OPEN**.
- **Offline means no CDNs**: no Google Fonts, unpkg or cdnjs at runtime in the dashboard; bundle fonts, glyphs and sprites locally.
- **Don't bulk-download openstreetmap.org tiles.** Use a PMTiles extract. **The demo must never block on the map** — the plain dark grid fallback must work.
- **Triage colors are for triage only** (Red, Yellow, Green, Black).
- **API spend** for data generation is about $2. Keep the key in `.env` (git-ignored); never commit it.
- macOS + zsh + Python 3.13; Node.js 20+.

---

## Part 2 — Your timeline, tasks and "done when" checks

Push to `main` at every ★.

| Hours | Task | Done when |
|---|---|---|
| 0–0:15 | Start the three chatbot chats **now** (they take a while): open three fresh chats in a capable chatbot; paste `training/chatbot_prompt_A.md` into the first (say "continue" after each 50 until chatA_200), `_B.md` into the second, `_C.md` into the third. Do the dashboard Dribbble research while they write. | Three chats running |
| 0–1 | Dribbble research for the dashboard (§13.4 "Design process"): 3–5 shots in `design/REFERENCES.md` under **Operator dashboard** — link, description, and what to borrow. Add the dashboard design tokens there (colors incl. the four triage colors and their dark-mode variants, radii, spacing, type scale, monospace font). Coordinate the triage color values with T4 so both apps use **the same hex values**. | References + tokens committed ★ |
| 1–2 | `training/import_chatbot.py files... --writer chatbot [--label-version 2]` (§8), using `training/common.py` from T1 (contract K6; until it lands at hour 1, hard-code the vocabularies and swap later). Pre-import checks as a `--check` mode that prints a report and writes nothing: label mix vs each prompt's quotas, word-count spread (min/median/max + a histogram per length bucket), near-duplicates (difflib ratio > 0.7 within the batch), **similarity to every Appendix A message (ratio > 0.55 → flagged)**. `tests/test_importer.py`: skips non-`{` lines and code fences; reports invalid lines with `file:line`; rejects bad vocab values, counts outside 0–15, non-bool third-party; prefixes ids `chat_<writer>_`; skips duplicate ids; sorts + dedupes medical flags; sets `writer` + `label_version`. | Importer tests green ★ |
| 2–3 | Save the three replies as `data/chatA.txt`, `chatB.txt`, `chatC.txt` (raw, as pasted). Run `--check`, read the report, fix problems (ask the chatbot to redo flagged rows, or drop them). Then import. Tell T1. | **310 rows** (or as close as the checks allow) in `raw.jsonl`, none close to a test message ★ (sync point hours 2–3) |
| 2–4 | Dashboard skeleton: `npm create vite@latest dashboard -- --template react-ts`, Tailwind, `lucide-react`, MapLibre GL JS, `pmtiles`, `@protomaps/basemaps`. Dev server on **port 5174** with a Vite proxy for `/api` and `/ws` (ws: true) to `localhost:8000`. Local fonts (e.g. Inter + a monospace like JetBrains Mono, bundled with `@fontsource/*`). A typed `Incident` (contract K3), `src/mocks/incidents.ts` with ~10 realistic incidents (all four priorities, a third-party one, a NO_FIX one, a removed one) and a fake event stream, so you never wait for the bridge. | Mock pins render on a dark grid |
| 4–7 | Switch to the live bridge (`python3 -m bridge.server --simulate`). Implement the full §13.4 layout: top bar (WS ●, serial ●, "last frame 12 s ago", per-priority counters, sound toggle), map with priority-colored circle markers (Red larger + soft pulse), real-time drop/pulse + toast ("New RED · FLOOD · 3 people"), optional chime for Red (generate it with WebAudio — no audio file needed), sidebar list sorted Red → Yellow → Green → Black then newest first, filter chips, "Show removed", "No location" section, detail drawer with every §13.4 field, the **byte-by-byte breakdown table** (computed client-side from `frame_hex`, labelled with the decoded values from the incident JSON), remove (confirm → fade → 10 s Undo toast → restore), center on map, Esc / Delete shortcuts, WebSocket reconnect with backoff and "Reconnecting…". | Simulated pins appear live; click shows the byte breakdown; remove + undo work ★ (§15 "done when") |
| 7 | With T2: field node `curl` test puts a pin on your dashboard. | Pin appears ★ |
| 7–10 | **Offline basemap** (§13.4): get the demo center + bbox from the team (the hackathon venue; record in `docs/INTEGRATION.md`). **OPEN — verify first:** the current Protomaps daily build URL, the `pmtiles` CLI flags, and where `@protomaps/basemaps` expects glyphs and sprites. Then `pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles dashboard/public/demo.pmtiles --bbox=<minLon,minLat,maxLon,maxLat> --maxzoom=15`; serve glyphs/sprites from `dashboard/public/`. The `.pmtiles` file is git-ignored — record its size and how to rebuild it in `dashboard/README.md`, and copy it to the demo laptop by hand. If anything about the basemap fails, the grid fallback must load automatically (catch map/style/source errors and switch). | Map renders with the network off (Wi-Fi off on the laptop) ★ |
| 10–12 | Polish: GPS-accuracy circle for the selected pin (a GeoJSON circle polygon sized by `meters_max`), ⚠ badge for `location_discrepancy`, third-party warning text, live ages ticking, `prefers-reduced-motion`, aria labels, empty states. `npm run build` → `dashboard/dist/`; verify the bridge serves it at `http://localhost:8000/`. | Dashboard served by the bridge, works offline ★ |
| 12–15 | End-to-end rehearsal with the team (§13.5). The judge clicks a pin: make sure the drawer and breakdown read clearly from a few meters away (projector size). | `demo-freeze` tagged |
| **Phase B** | | |
| 15–15:30 | **Verify each endpoint with one call** (§16): one `/chat/completions` call per writer model with `reasoning: {"enabled": false}` and `response_format: json_object` (drop a field if rejected, and record which); one Jev `/systemone` call through OpenRouter (fallback: TypeSafe's direct API). Write down the working request shapes in `training/README.md`. | Endpoints confirmed |
| 15:30–16 | `python3 -m training.verify --benchmark` (scores Jev on Appendix A — this checks the **checker**, it does not tune anything). `python3 -m training.generate --n 200`; read ~20 rows by hand. | `artifacts/jev_benchmark.json`; rows look realistic |
| 16–17 | `python3 -m training.generate --n 5000 --workers 30`, then `python3 -m training.verify`. Review the keep rate overall and per writer, the rejection reasons, and the priority mix of kept rows. Commit `raw.jsonl` and `scored.jsonl`. Tell T1. | `scored.jsonl` on `main`, report reviewed ★ |
| 17–22 | Help T1 evaluate (read error examples in `artifacts/eval_*.md`), help T2 with slides: dashboard screenshots, a short screen recording of a pin arriving as a backup in case the live demo fails. | — |

### Implementation notes (decisions you can rely on)

- **Byte breakdown table** — one row per field (not per byte), with offset, hex, field, decoded value:
  `0x00` priority/hazard/status (bits), `0x01` adults/children (nibbles), `0x02–0x03` flags (`>H`, list the set flags), `0x04–0x06` latitude (int24 → degrees), `0x07–0x09` longitude, `0x0A–0x0D` timestamp (→ local time), `0x0E–0x0F` device id, `0x10` seq, `0x11` spare / GPS accuracy / version. Show the note *"Only these 18 bytes traveled over the radio; the survivor's original text is never transmitted."*
- **Hazard icons** (lucide-react): pick one per hazard and keep the mapping in one file; T4 does the same for the PWA — share the mapping with them so a FLOOD looks the same on both screens.
- **Map markers:** use a GeoJSON source + `circle` layer (fast, data-driven color/radius) for the pins; the pulse can be a second circle layer animated with `requestAnimationFrame` (skip under reduced motion). Selected-pin accuracy circle = a separate fill layer.
- **Generation (`generate.py`)**: follow §6 exactly — the spec-sampling weights in §6.3 are decided, implement them literally (the status table depends on priority; the medical-count table depends on priority; the hazard→pool table; the "relaying" style forces third-party). `id = "syn_" + uuid4().hex[:10]`. Use `training/common.py`'s `openrouter_post` (retry policy in §6) and the §6.4 system prompt verbatim with `{COUNT_RULE}` and `{THIRD_PARTY_RULE}` substituted. Resumable: count existing rows whose `writer` is one of the two writer models.
- **Checking (`verify.py`)**: one request with all 14 questions per message (§7 table). Keep thresholds exactly as §7. `--refilter` re-applies thresholds without API calls. Old-rule rows (no `label_version` ≥ 2): save `legacy_labels` first, then overwrite counts/third-party with Jev's answers.
- Use a `ThreadPoolExecutor` with a tqdm bar; append to the output file as each batch finishes, flushing after every write, so an interrupted run loses nothing.

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

Section numbers (§) refer to MASTER_PROMPT.md.

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

## 6. Training data generation (`training/generate.py`)

All LLM calls go through **OpenRouter**: base URL `https://openrouter.ai/api/v1`, header `Authorization: Bearer $OPENROUTER_API_KEY`. Use `requests` with a `ThreadPoolExecutor`.

**Retries:** up to 5 attempts, with exponential backoff `min(30, 2^attempt + rand)`, on network errors and on HTTP 408, 429, 500, 502, 503, 524 and 529. Raise on any other 4xx.

### 6.1 Writers

| Role | Model | Share of batches |
|---|---|---|
| Main writer | `deepseek/deepseek-v4-flash-0731` | 65% |
| Second writer | `xiaomi/mimo-v2.6-flash` | 35% |

Both can be overridden with the env vars `WRITER_MAIN` and `WRITER_ALT`.

### 6.2 Method

**Labels are sampled first. Then a writer is asked to write a message conveying exactly those facts.** Every row is therefore labeled by construction.

**Request format:**
- 10 specs per request.
- `POST /chat/completions` with:
  - `temperature: 1.0`
  - `response_format: {"type": "json_object"}`
  - `reasoning: {"enabled": false}`
  - system = the prompt in §6.4
  - user = `"Specs:\n"` followed by one JSON spec per line
- Parse the reply after stripping any ``` fences. Join the texts back to specs by `id`.
- Drop empty texts and texts over 600 characters.

**Batch handling:**
- 30 workers.
- Append rows to `data/synthetic/raw.jsonl` as batches finish.
- **Resumable:** `--n` counts only rows whose `writer` is one of the two writer models.
- Show a tqdm bar with rows written and failed batches.

**Each written row:**
- `id = "syn_" + spec id` (a 10-hex uuid)
- the labels from the spec
- style, language, writer
- `label_version: 2`

### 6.3 Spec sampling (exact)

- **Priority:** Immediate 0.38, Delayed 0.25, Minor 0.27, Deceased 0.10.
- **Hazard:**

  | Hazard | Weight |
  |---|---|
  | NONE | .03 |
  | FLOOD | .16 |
  | FIRE_SMOKE | .12 |
  | STRUCTURAL_COLLAPSE | .11 |
  | HAZMAT_GAS | .06 |
  | ELECTRICAL_POWER | .05 |
  | EXTREME_WEATHER | .08 |
  | MEDICAL_CRISIS | .09 |
  | ACTIVE_VIOLENCE | .04 |
  | TSUNAMI_SURGE | .03 |
  | LANDSLIDE | .04 |
  | HYPOTHERMIA_FREEZE | .05 |
  | HEAT_STROKE | .04 |
  | SINKHOLE_SUBSIDENCE | .02 |
  | CONTAMINATED_WATER | .05 |
  | OTHER | .03 |

  If priority is Minor, set hazard = NONE with probability 0.25.
- **Status, depending on priority:**

  | Priority | Trapped | Exposed | Sheltered | Unknown |
  |---|---|---|---|---|
  | Immediate | .50 | .30 | .10 | .10 |
  | Delayed | .25 | .25 | .35 | .15 |
  | Minor | .03 | .12 | .70 | .15 |
  | Deceased | .40 | .30 | .10 | .20 |

- **Adults:** 0–8 with weights [3, 40, 25, 12, 8, 5, 3, 2, 2]. With probability 0.02, use a uniform 9–15 instead.
- **Children:** 0–4 with weights [60, 20, 12, 5, 3].
- **Number of medical flags, depending on priority:**

  | Priority | 0 flags | 1 flag | 2 flags |
  |---|---|---|---|
  | Immediate | .30 | .50 | .20 |
  | Delayed | .45 | .45 | .10 |
  | Minor | .90 | .10 | — |
  | Deceased | .80 | .20 | — |

- **Which medical flags:** for each flag to draw:
  - With probability 0.6, draw from the pool that fits the hazard:

    | Hazard | Pool |
    |---|---|
    | FIRE_SMOKE | BURNS, OXYGEN |
    | STRUCTURAL_COLLAPSE | BLEEDING, MOBILITY_IMPAIRED |
    | FLOOD | HYPOTHERMIA, INSULIN |
    | TSUNAMI_SURGE | HYPOTHERMIA, BLEEDING |
    | HYPOTHERMIA_FREEZE | HYPOTHERMIA |
    | HAZMAT_GAS | OXYGEN |
    | ELECTRICAL_POWER | BURNS, CARDIAC |
    | ACTIVE_VIOLENCE | BLEEDING |
    | HEAT_STROKE | CARDIAC |
    | LANDSLIDE | MOBILITY_IMPAIRED, BLEEDING |

  - Otherwise, draw from all 8.
  - No duplicates.
  - If there are children, add PREGNANCY_INFANT with probability 0.1.
- **Third-party:** probability 0.50 if Deceased, otherwise 0.18. **Forced true** when the style is the "relaying" style.
- **Headcount adjustments:**
  - If adults + children = 0, set adults = 1.
  - If not third-party and adults = 0, set adults = 1 (the writer is counted).
- **Language:** English .88, Spanish .06, mixed English and Spanish .06.
- **Length:** "5-15 words" .35, "15-40 words" .45, "40-80 words" .20.
- **Style:** uniform over these 16 strings:
  1. panicked text message, ALL CAPS, typos, no punctuation
  2. panicked text message with typos and autocorrect errors
  3. SMS shorthand (u, ppl, pls, rn, asap), lowercase
  4. calm, factual, complete sentences
  5. very short fragment, under 10 words
  6. rambling, run-on, emotional, details out of order
  7. elderly person, polite and formal, slightly confused
  8. teenager, casual slang
  9. exhausted and terse after hours of waiting
  10. someone relaying what they heard from a neighbor or family member on the phone
  11. mentions a street address, intersection, or landmark
  12. downplays the situation even though it is serious
  13. exaggerates and is dramatic even though it is minor
  14. includes irrelevant details (pets, belongings, the weather) mixed with the important ones
  15. uses negation, e.g. says what is NOT happening as well as what is
  16. describes something that already happened and is now over, plus the current situation
- **Spec JSON keys:** id, priority, hazard, status, adults, children, medical, third_party, style, language, length.

### 6.4 Writer system prompt (verbatim)

`{COUNT_RULE}` and `{THIRD_PARTY_RULE}` are replaced with the §4 text.

```
You write realistic emergency distress messages for training a disaster-triage classifier.
People type these on phones during floods, fires, earthquakes and storms, often scared, hurried, and misspelling things.

For each spec you get, write ONE message that conveys exactly the facts in the spec and nothing that contradicts it:
- priority: how urgent the situation really is. Convey it through the facts described, never with words like "red", "immediate", "priority", "triage".
- hazard: the main danger. NONE means no environmental hazard.
- status: Sheltered / Exposed / Trapped. If "Unknown", do NOT reveal where the victims are or whether they can move.
- adults / children: the exact number of adults and children at the scene: {COUNT_RULE} Imply counts naturally ("me and my 2 kids" = 1 adult, 2 children). 0 children means don't mention any children at the scene.
- medical: every listed need must be clearly implied; do not imply any need that isn't listed.
- third_party: {THIRD_PARTY_RULE} When false, the writer is at the scene and counted in adults.
- Follow the style, language and length exactly. Vary names, places and wording; never reuse phrasing across messages.

Return JSON: {"messages": [{"id": "<spec id>", "text": "<message>"}, ...]} with one entry per spec, in order.
```

**Target:** `python3 -m training.generate --n 5000 --workers 30`. Expected cost under ~$2. **First** run `--n 200` and read about 20 rows by hand.

---

## 7. Label checking (`training/verify.py`)

- **Checker model:** **TypeSafe Jev** `typesafe/jev-1.13`, a "decision" model. It returns calibrated probabilities instead of text, and output tokens are free.
- **Endpoint (OPEN — verify first):** `POST https://openrouter.ai/api/v1/systemone`.
  - TypeSafe's own docs describe `POST /v1/systemone` at `https://api.typesafe.ai`.
  - **Request body:**
    ```
    {"model": "typesafe/jev-1.13", "state": {"distress_message": "<text>"}, "questions": {<name>: <question>, ...}}
    ```
  - **Question types:**
    - `{"type": "choice", "instructions": str, "criteria": {option: description or null}}` — max 255 options
    - `{"type": "noul", "instructions": str, "criteria": {"true": str, "false": str}}` — the criteria are optional
    - `score` — not used here
  - **Response:** `{"model", "answers": {name: answer}, "usage": {"input_tokens", "output_tokens"}}`
    - choice answer: `{"type": "choice", "choice": option, "probabilities": {option: p}, "confidence": p}`
    - noul answer: `{"type": "noul", "noul": p}`
- **14 questions per message, in one request:**

  | Name | Type | Instructions | Criteria |
  |---|---|---|---|
  | priority | choice | "Using START/FEMA disaster triage, how urgent is the situation described in this distress message?" | `Minor`/`Delayed`/`Immediate`/`Deceased`, each described as "GREEN: …", "YELLOW: …", "RED: …", "BLACK: …" using the §2 meanings |
  | hazard | choice | "What is the main environmental hazard endangering the people in this message?" | the 16 hazard names, with the §2 descriptions |
  | status | choice | "What is the physical situation of the victims?" | the 4 status strings, with the §2 meanings |
  | adults | choice | "How many adults are at the scene? Count adults only, using this rule: {COUNT_RULE}" | options "0"…"15" (null descriptions, except "15": "15 or more") |
  | children | choice | "How many children or infants are at the scene of the emergency? 0 if none are mentioned." | options "0"…"15" |
  | third_party | noul | "Is the writer somewhere other than the scene of the emergency?" | true: "Third-party report: {THIRD_PARTY_RULE}"; false: "The writer is at the scene of the emergency" |
  | med_<FLAG> ×8 | noul | "Does the message indicate that <§2 flag meaning>?" | — |

- **Store** on each row: `jev_priority`[4], `jev_hazard`[16], `jev_status`[4] (probabilities in enum order), `jev_adults`, `jev_children` (argmax ints), `jev_third_party` (p) and `jev_medical`[8] (p).
- **Keep a row only if all of these hold:**
  - P(intended priority) ≥ **0.35**
  - P(intended hazard) ≥ **0.25**
  - P(intended status) ≥ **0.25**
  - every listed medical flag scores ≥ **0.40**
  - every unlisted medical flag scores ≤ **0.60**
  - third-party: reject if labeled true and p < **0.20**, or labeled false and p > **0.80**

  Store `keep` and `reject_reasons` on the row.
- **Rows without `label_version` ≥ 2** (old-rule chatbot data): before judging, save the old values under `legacy_labels`, then replace `adult_count`, `pediatric_count` and `is_third_party` with Jev's answers, and set `label_version` = 2.
- **Output:** append to `data/synthetic/scored.jsonl`. Resumable: skip ids already scored.
- **Report:**
  - kept / total, overall and per writer
  - a count of each rejection reason
  - the priority mix of kept rows
- **Modes:**
  - `--benchmark`: score Jev on Appendix A and print per-field accuracy, Red recall, medical F1 and the priority confusion matrix. Save to `artifacts/jev_benchmark.json`. **Run this first**, as a sanity check on the checker itself.
  - `--refilter`: re-apply the thresholds without any API calls.

---

## 8. Hand-made chatbot data (validation writer)

- The three prompts in **Appendix C** produce **310 rows**:
  - Prompt C1: 200 rows with quotas and hard cases. Ids `chatA_###`.
  - Prompt C2: 25 very short + 25 very long. Ids `chatB_###`.
  - Prompt C3: 60 gap-fillers — Unknown status, Yellow, insulin/cardiac/burns. Ids `chatC_###`.
- Use any capable chatbot, **a fresh chat for each prompt**. Save each reply to `data/chatA.txt`, `data/chatB.txt` and `data/chatC.txt`.
- **Importer** `training/import_chatbot.py files... --writer chatbot [--label-version 2]`:
  - Parse only lines starting with `{`, so code fences and prose are skipped.
  - Validate every label against the vocabularies: priority, hazard and status strings; counts 0–15 ints; medical flags as a list of the 8 names; `is_third_party` bool; language one of the 3 strings. Report invalid lines with `file:line`.
  - Prefix ids with `chat_<writer>_`. Skip duplicate ids.
  - Set `writer` and `label_version`. Sort and dedupe medical flags.
  - Append to `data/synthetic/raw.jsonl`.
- **Before importing, check the batch:**
  - the label mix vs the prompt's quotas
  - the word-count spread
  - near-duplicates (difflib ratio > 0.7)
  - **similarity to every test message** (flag anything with ratio > 0.55)
- **Watch for chatbot habits:** chatbots tend to drift from quotas, write text that is cleaner than real crisis messages, and hit length targets with suspiciously uniform word counts. Check the mix and the word-count spread before importing.

---

### §13.3 (the API you build against — Track 2 implements it)

### 13.3 Bridge server (`bridge/server.py`)

**Python FastAPI + uvicorn**, one process, port 8000. It also serves the dashboard's built files at `/`.

**Serial reader** (background thread):
- pyserial, reading from `--port` or auto-detecting `/dev/cu.usbserial*` / `/dev/cu.usbmodem*`.
- Parses `FRAME` lines and decodes them with `unpack_binary_frame`.
- Reconnects automatically if the board is unplugged.

**Deduplication** on `(device_id, seq)` within 10 minutes. A repeat doesn't create a new pin; it updates `heard_count`, `last_heard_at`, and the best RSSI/SNR.

**Incident store** in SQLite (`bridge/incidents.db`), so pins survive a restart.

| Column | |
|---|---|
| id | uuid |
| device_id, seq | |
| frame_hex | |
| decoded | JSON |
| rssi, snr | |
| heard_count | |
| received_at, last_heard_at | |
| state | `active` / `removed` |
| removed_at | |

**API:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/incidents?state=active\|removed\|all` | List incidents |
| POST | `/api/incidents/{id}/remove` | Remove a pin |
| POST | `/api/incidents/{id}/restore` | Undo a removal |
| GET | `/api/health` | `{serial_connected, port, last_frame_at, active_count}` |
| WS | `/ws` | Pushes `{"type": "incident.new" \| "incident.updated" \| "incident.removed" \| "incident.restored" \| "health", "incident"?: {...}}` |

**Incident JSON:**

| Group | Fields |
|---|---|
| Identity and radio | `id`, `frame_hex`, `device_id`, `seq`, `rssi`, `snr`, `heard_count` |
| Triage | `priority` {value, name, color}, `hazard` {value, name}, `status` {value, name}, `adults`, `children`, `medical` [names] |
| Location | `third_party`, `location_type`, `location_discrepancy`, `lat`, `lon`, `gps_accuracy` {value, name, meters_max} |
| Time and state | `sent_at` (frame timestamp), `received_at`, `last_heard_at`, `state` |

**Simulation, so the dashboard can be built without hardware:**
- `--simulate` packs realistic random frames with the real packer, every 3–8 s, around a configurable center point.
- `POST /api/debug/frame {"hex": "..."}` injects a frame.

### 13.4 Operator dashboard (`dashboard/`)

**Stack:**
- **Vite + React + TypeScript + Tailwind**, with the map in **MapLibre GL JS** (open source, vector, smooth, modern).
- **Offline basemap:** a **Protomaps PMTiles** extract of the demo area, loaded with the `pmtiles` protocol plugin and styled with the **dark** flavor of `@protomaps/basemaps`. Glyphs (fonts) and sprites are served locally.
  - Build the extract with the go-pmtiles CLI: `pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles dashboard/public/demo.pmtiles --bbox=<minLon,minLat,maxLon,maxLat> --maxzoom=15`.
  - **OPEN:** verify the current build URL, CLI flags and asset locations.
  - **Don't bulk-download openstreetmap.org tiles** — their usage policy forbids it. That's why we use a PMTiles extract instead of Leaflet with OSM tiles.
- **Fallback if the basemap fails:** a plain dark grid with pins. **The demo must never block on the map.**
- No runtime CDN requests.

**Design process:**
- Browse **Dribbble** for: "emergency dispatch dashboard", "incident command center", "fleet tracking map dashboard dark", "map dashboard UI", "real-time monitoring dashboard".
- Record 3–5 references and what to borrow in `design/REFERENCES.md`.
- Direction: a dark **command-center** look. The map takes ~70% of the width, with a right sidebar. Monospace for hex and coordinates. Triage colors only for triage. Calm motion.

**Layout and behavior:**

**Top bar**
- App name.
- Live status: WebSocket ●, radio serial ●, "last frame 12 s ago".
- Active counters per priority: Red, Yellow, Green, Black.
- Sound toggle.

**Map**
- Circle markers colored by priority; Red markers are larger, with a soft pulse.
- **New pins appear in real time:** a drop/pulse animation plus a toast ("New RED · FLOOD · 3 people"), and an optional chime for Red.
- A selected pin shows its GPS-accuracy circle and a ⚠ badge if the location-discrepancy flag is set.
- Incidents with no GPS fix aren't placed on the map; they're listed under **"No location"** in the sidebar.

**Sidebar list**
- Active incidents sorted **Red → Yellow → Green → Black**, then newest first.
- Each card: color bar, hazard icon and name, people count, medical icons, live age ("2 min ago"), seq.
- Filter chips by priority.
- A "Show removed" toggle shows removed incidents greyed out.

**Click a pin or card → detail drawer**
- **Triage:** priority banner, hazard, situation, people (adults / children), medical needs.
- **Location:**
  - lat/lon, with a copy button
  - GPS accuracy
  - if third-party: "Reporter is not at the scene — GPS shows the reporter, not the incident" and the location type
- **Timing:** sent time (from the frame) vs received time.
- **Radio:** RSSI, SNR, heard N times, device id.
- **Encoded message:**
  - the 36-hex frame in monospace
  - a **byte-by-byte breakdown table**: byte offset → hex → field → decoded value
  - a note: *"Only these 18 bytes traveled over the radio; the survivor's original text is never transmitted."*
- **Actions:**
  - **Remove pin:** a confirm dialog, then `POST …/remove`. The pin fades out, and an **Undo** toast stays for 10 s (→ `/restore`).
  - **Center on map.**

**Keyboard:** Esc closes the drawer. Delete removes the selected pin, with confirmation.

**Realtime:** after loading `GET /api/incidents?state=active`, apply WebSocket events. Reconnect with backoff and show "Reconnecting…" in the top bar.

### 13.5 Demo script

1. A judge's phone opens the website once while online ("Ready offline ✓"), then goes into Airplane Mode.
2. Type: "Water is rising fast, my mother needs insulin, 2 of us trapped in attic".
3. Review shows Red · Flood · Trapped · 2 adults · Insulin.
4. Join the `CivicMesh-SOS` Wi-Fi network and tap Send.
5. Within about 1 s, a pulsing Red pin appears on the dashboard. Click it to show the decoded fields and the 18-byte breakdown, then remove the pin and undo.

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

## Appendix A — Test set

Saved verbatim at `data/benchmark_dataset.jsonl` (54 messages). Your importer's similarity check and `verify --benchmark` read it from there. **Never import it, never train or tune on it.**

---

## Appendix C — Chatbot data prompts (paste each into a FRESH chatbot chat; save replies as data/chatA.txt, chatB.txt, chatC.txt)

### C1 — 200 examples with quotas and hard cases (ids chatA_###; ask it to continue after each 50)

````markdown
You are helping build training data for a disaster-triage classifier. The classifier runs offline on a survivor's phone and reads short distress messages people type during floods, fires, earthquakes, storms and other disasters, when cell service is down. It must decide how urgent each message is, so the training data has to look like what real, scared, hurried people actually type, and every label has to be exactly right.

Write **200 distress messages**, each with labels. Send them in **4 replies of 50**. After each reply, stop and wait for me to say "continue".

## Output format

Output only JSON Lines inside a single code block, one object per line, with no commentary before or after the block:

```
{"id": "chatA_001", "text": "...", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["INSULIN"], "is_third_party": false, "style": "panicked, ALL CAPS, typos", "language": "English", "writer": "chatbot"}
```

Number the ids chatA_001 to chatA_200 in order across all four replies.

## Label definitions (use these exact values)

- **triage_priority**, how urgent the situation really is:
  - `Minor`: safe, or only minor injuries; needs supplies or information, not rescue
  - `Delayed`: serious but stable; injured or stranded but not about to die; rescue can wait hours
  - `Immediate`: life-threatening right now; severe bleeding, can't breathe, unconscious, or trapped with a rising danger (water, fire, gas, collapse)
  - `Deceased`: the victim is dead, or unresponsive with no signs of life
- **hazard_class**, the main environmental danger: `NONE`, `FLOOD`, `FIRE_SMOKE`, `STRUCTURAL_COLLAPSE`, `HAZMAT_GAS`, `ELECTRICAL_POWER`, `EXTREME_WEATHER`, `MEDICAL_CRISIS` (a medical emergency with no environmental hazard), `ACTIVE_VIOLENCE`, `TSUNAMI_SURGE`, `LANDSLIDE`, `HYPOTHERMIA_FREEZE`, `HEAT_STROKE`, `SINKHOLE_SUBSIDENCE`, `CONTAMINATED_WATER`, `OTHER`
- **rescue_status**:
  - `Sheltered`: inside a secure building, not trapped
  - `Exposed`: outdoors or exposed to the elements (on a roof, in water, in a car, on the street)
  - `Trapped`: can't get out (pinned, stuck in an attic, under rubble, cut off)
  - `Unknown`: the message does not reveal where the victims are or whether they can move
- **adult_count** / **pediatric_count**: the number of adults and children **at the scene of the emergency**, from 0 to 15: the people responders would find when they arrive, including anyone deceased. Include the writer if the writer is there. If no number is given, count the people the message mentions (a writer alone at the scene is 1 adult). Pets don't count.
- **medical_flags**: a list using only these values. Include a value only if the message clearly implies it, and include every one it implies. Use `[]` for none.
  - `INSULIN`: diabetic or needs insulin
  - `OXYGEN`: trouble breathing or oxygen-dependent
  - `BLEEDING`: heavy bleeding or a serious wound
  - `HYPOTHERMIA`: dangerously cold or soaked in cold water
  - `MOBILITY_IMPAIRED`: can't walk (wheelchair, broken leg, elderly and immobile, pinned)
  - `CARDIAC`: chest pain, heart attack, or heart condition
  - `PREGNANCY_INFANT`: pregnant, in labor, or a newborn or infant needs care
  - `BURNS`: burns
- **is_third_party**: `true` only when the writer is **not at the scene**, so the phone's location is not where help is needed (a relative who phoned them, an incident seen from blocks away). A writer at the scene reporting about someone next to them ("my husband is pinned", "found a man in the ditch") is `false`.
- **style**: a few words describing the writing style you used.
- **language**: `English`, `Spanish`, or `mixed English and Spanish`.

## Required mix across all 200 messages

Keep a running tally so the full set hits these numbers:

- **Priority**: 70 Immediate, 50 Delayed, 55 Minor, 25 Deceased.
- **Hazard**: every category from FLOOD to CONTAMINATED_WATER at least 6 times, NONE at least 10 times, OTHER at least 3 times. FLOOD and FIRE_SMOKE at most 25 each.
- **Status**: about 60 Trapped, 50 Exposed, 60 Sheltered, 30 Unknown.
- **Language**: 170 English, 15 Spanish, 15 mixed English and Spanish.
- **Length**: about 70 short (5–15 words), 90 medium (15–40 words), 40 long (40–80 words).
- **Medical**: about 90 messages with no medical flags, 80 with one, 30 with two or more. Every flag should appear at least 10 times.
- **Third party**: at least 40 third-party reports where the writer is not at the scene (relatives who phoned them, incidents seen from down the street), including about 15 of the Deceased messages.

## Hard cases (these matter most)

Include at least this many of each:

- **25 negations or false alarms**: hazard words that are not an emergency. For example: "water is in the yard but we're NOT trapped and nobody is hurt", "smelled smoke, it was the neighbor's grill, all good". These are usually Minor.
- **15 downplayed emergencies**: calm or apologetic wording for a truly Immediate situation. For example: "sorry to bother, my husband's leg is pinned under the beam and he's gone quiet".
- **15 dramatic non-emergencies**: panicked wording for a Minor situation.
- **10 resolved situations**: the message describes something that already happened and is now over, plus the current state ("was trapped but neighbors got us out, everyone ok now").
- **10 urgency without keywords**: life-threatening but never using words like "help", "emergency", "urgent" or "trapped". For example: "water at my chin in the attic cant open the vent".
- **10 messages with irrelevant detail**: pets, belongings or weather mixed in with the important facts.
- **10 messages that give a street address, intersection or landmark.**

## Realism rules

- Write the way people actually type on a phone in a crisis:
  - typos and autocorrect errors
  - missing punctuation, ALL CAPS, and SMS shorthand ("u", "ppl", "pls", "rn")
  - run-on sentences, and fragments
  - details out of order
- Vary the writers: teenagers, elderly people, parents, non-native speakers, exhausted people who have been waiting for hours, calm professionals.
- Never use the words "triage", "priority", "red", "yellow", "green" or "black", and never use the label names themselves (for example "immediate", "delayed").
- Never reuse an opening, phrase, name, street or scenario. Every message should feel like a different person in a different place.
- Double-check each label against its message before writing the line. Better a slightly less dramatic message than a wrong label.

Start with messages chatA_001 to chatA_050.
````

### C2 — 25 very short + 25 very long (ids chatB_###)

````markdown
You are helping build training data for a disaster-triage classifier. The classifier runs offline on a survivor's phone and reads distress messages people type during floods, fires, earthquakes, storms and other disasters, when cell service is down. It must decide how urgent each message is, so the training data has to look like what real, scared people actually type, and every label has to be exactly right.

This batch is about **length extremes**. Write **50 messages in one reply**:

- **25 very short messages (2–8 words).** These are what people send when they're panicking, injured, typing one-handed, or on a dying battery. For example: "attic water rising", "cant breathe smoke", "were ok", "mom not waking up". Many short messages leave out where the victims are or how many there are; label those `Unknown` and use the default counts described below.
- **25 very long messages (60–90 words; never more than 90).** These ramble: emotional, run-on, details out of order. The facts that decide urgency are buried in the middle or near the end, mixed with irrelevant detail (pets, belongings, the weather, what they were doing when it happened, apologies). Some long messages describe a serious emergency in rambling, calm language; others describe a minor situation at great, anxious length.

## Output format

Output only JSON Lines inside a single code block, one object per line, with no commentary before or after the block. Number the ids chatB_001 to chatB_050: the short messages are chatB_001–025 and the long ones chatB_026–050.

```
{"id": "chatB_001", "text": "...", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "style": "...", "language": "English", "writer": "chatbot"}
```

## Label definitions (use these exact values)

- **triage_priority**, how urgent the situation really is:
  - `Minor`: safe, or only minor injuries; needs supplies or information, not rescue
  - `Delayed`: serious but stable; injured or stranded but not about to die; rescue can wait hours
  - `Immediate`: life-threatening right now; severe bleeding, can't breathe, unconscious, or trapped with a rising danger (water, fire, gas, collapse)
  - `Deceased`: the victim is dead, or unresponsive with no signs of life
- **hazard_class**, the main environmental danger: `NONE`, `FLOOD`, `FIRE_SMOKE`, `STRUCTURAL_COLLAPSE`, `HAZMAT_GAS`, `ELECTRICAL_POWER`, `EXTREME_WEATHER`, `MEDICAL_CRISIS` (a medical emergency with no environmental hazard), `ACTIVE_VIOLENCE`, `TSUNAMI_SURGE`, `LANDSLIDE`, `HYPOTHERMIA_FREEZE`, `HEAT_STROKE`, `SINKHOLE_SUBSIDENCE`, `CONTAMINATED_WATER`, `OTHER`
- **rescue_status**:
  - `Sheltered`: inside a secure building, not trapped
  - `Exposed`: outdoors or exposed to the elements (on a roof, in water, in a car, on the street)
  - `Trapped`: can't get out (pinned, stuck in an attic, under rubble, cut off)
  - `Unknown`: the message does not reveal where the victims are or whether they can move
- **adult_count** / **pediatric_count**: the number of adults and children **at the scene of the emergency**, from 0 to 15: the people responders would find when they arrive, including anyone deceased. Include the writer if the writer is there. If no number is given, count the people the message mentions (a writer alone at the scene is 1 adult). Pets don't count.
- **medical_flags**: a list using only these values. Include a value only if the message clearly implies it, and include every one it implies. Use `[]` for none.
  - `INSULIN`: diabetic or needs insulin
  - `OXYGEN`: trouble breathing or oxygen-dependent
  - `BLEEDING`: heavy bleeding or a serious wound
  - `HYPOTHERMIA`: dangerously cold or soaked in cold water
  - `MOBILITY_IMPAIRED`: can't walk (wheelchair, broken leg, elderly and immobile, pinned)
  - `CARDIAC`: chest pain, heart attack, or heart condition
  - `PREGNANCY_INFANT`: pregnant, in labor, or a newborn or infant needs care
  - `BURNS`: burns
- **is_third_party**: `true` only when the writer is **not at the scene**, so the phone's location is not where help is needed (a relative who phoned them, an incident seen from blocks away). A writer at the scene reporting about someone next to them ("my husband is pinned", "found a man in the ditch") is `false`.
- **style**: a few words describing the writing style you used.
- **language**: `English`, `Spanish`, or `mixed English and Spanish`.

## Required mix across all 50 messages

- **Priority**: 18 Immediate, 12 Delayed, 13 Minor, 7 Deceased, split roughly evenly between the short and long groups.
- **Status**: at least 12 `Unknown` (mostly short messages), and the rest spread across Trapped, Exposed and Sheltered.
- **Hazard**: use at least 12 different hazard categories; no category more than 6 times.
- **Medical**: at least 4 messages each implying `INSULIN`, `CARDIAC` and `BURNS`.
- **Language**: 40 English, 5 Spanish, 5 mixed English and Spanish.
- **Third party**: at least 10 third-party reports.

## Realism rules (be messier than feels natural)

- Real crisis texts are much messier than polished prose:
  - typos and autocorrect errors ("ceiling" → "sealing", "can't" → "cant")
  - missing punctuation, ALL CAPS, doubled letters, and SMS shorthand ("u", "ppl", "pls", "rn", "idk")
  - lowercase sentence starts, and words dropped mid-sentence
- At least half the messages should have several typos or no punctuation at all.
- Never use the words "triage", "priority", "red", "yellow", "green" or "black", and never use the label names themselves.
- Never reuse an opening, phrase, name, street or scenario.
- Count the words in every message. Short means 2–8 words; long means 60–90 words.
- Double-check each label against its message before writing the line. If a short message is too vague to support a label, make it slightly clearer rather than guess.
````

### C3 — 60 gap-fillers: Unknown status, Yellow, insulin/cardiac/burns (ids chatC_###)

````markdown
You are helping build training data for a disaster-triage classifier. The classifier runs offline on a survivor's phone and reads distress messages people type during floods, fires, earthquakes, storms and other disasters, when cell service is down. It must decide how urgent each message is, so the training data has to look like what real, scared people actually type, and every label has to be exactly right.

This batch fills specific gaps in the existing data. Write **60 messages in one reply**.

## What this batch needs

1. **30 messages where the victims' situation is `Unknown`.** The message gives the danger and how urgent it is, but never reveals where the victims are or whether they can move or get out. For example: "please hurry my dad is having chest pains and his insulin ran out", "smoke everywhere cant see my son anymore", "something exploded at the plant, guys are burned bad". Don't mention being inside, outside, trapped, on a roof, in a car, at a shelter, or anything else that gives away location or mobility.
2. **At least 22 `Delayed` messages in total.** These are serious but stable: a broken bone with no heavy bleeding, an elderly person without medication for a day, stranded with water and food but no way out, a wound that has been bandaged, hypothermia risk hours away. This is the hardest category: make each one clearly not life-threatening right now, but clearly more than a minor inconvenience.
3. **At least 8 messages each implying `INSULIN`, `CARDIAC` and `BURNS`.** Vary how they're described: "sugar's dropping", "out of my pens", "type 1"; "chest feels crushed", "his pacemaker", "heart attack last year and now pain again"; "skin blistered from the steam", "chemical splashed on her arms", "hands burned pulling him out".

These overlap: a single message can be `Unknown`, `Delayed` and imply `CARDIAC`.

## Output format

Output only JSON Lines inside a single code block, one object per line, with no commentary before or after the block. Number the ids chatC_001 to chatC_060.

```
{"id": "chatC_001", "text": "...", "triage_priority": "Delayed", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Unknown", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["INSULIN"], "is_third_party": false, "style": "...", "language": "English", "writer": "chatbot"}
```

## Label definitions (use these exact values)

- **triage_priority**, how urgent the situation really is:
  - `Minor`: safe, or only minor injuries; needs supplies or information, not rescue
  - `Delayed`: serious but stable; injured or stranded but not about to die; rescue can wait hours
  - `Immediate`: life-threatening right now; severe bleeding, can't breathe, unconscious, or trapped with a rising danger (water, fire, gas, collapse)
  - `Deceased`: the victim is dead, or unresponsive with no signs of life
- **hazard_class**, the main environmental danger: `NONE`, `FLOOD`, `FIRE_SMOKE`, `STRUCTURAL_COLLAPSE`, `HAZMAT_GAS`, `ELECTRICAL_POWER`, `EXTREME_WEATHER`, `MEDICAL_CRISIS` (a medical emergency with no environmental hazard), `ACTIVE_VIOLENCE`, `TSUNAMI_SURGE`, `LANDSLIDE`, `HYPOTHERMIA_FREEZE`, `HEAT_STROKE`, `SINKHOLE_SUBSIDENCE`, `CONTAMINATED_WATER`, `OTHER`
- **rescue_status**:
  - `Sheltered`: inside a secure building, not trapped
  - `Exposed`: outdoors or exposed to the elements (on a roof, in water, in a car, on the street)
  - `Trapped`: can't get out (pinned, stuck in an attic, under rubble, cut off)
  - `Unknown`: the message does not reveal where the victims are or whether they can move
- **adult_count** / **pediatric_count**: the number of adults and children **at the scene of the emergency**, from 0 to 15: the people responders would find when they arrive, including anyone deceased. Include the writer if the writer is there. If no number is given, count the people the message mentions (a writer alone at the scene is 1 adult). Pets don't count.
- **medical_flags**: a list using only these values. Include a value only if the message clearly implies it, and include every one it implies. Use `[]` for none.
  - `INSULIN`: diabetic or needs insulin
  - `OXYGEN`: trouble breathing or oxygen-dependent
  - `BLEEDING`: heavy bleeding or a serious wound
  - `HYPOTHERMIA`: dangerously cold or soaked in cold water
  - `MOBILITY_IMPAIRED`: can't walk (wheelchair, broken leg, elderly and immobile, pinned)
  - `CARDIAC`: chest pain, heart attack, or heart condition
  - `PREGNANCY_INFANT`: pregnant, in labor, or a newborn or infant needs care
  - `BURNS`: burns
- **is_third_party**: `true` only when the writer is **not at the scene**, so the phone's location is not where help is needed (a relative who phoned them, an incident seen from blocks away). A writer at the scene reporting about someone next to them ("my husband is pinned", "found a man in the ditch") is `false`.
- **style**: a few words describing the writing style you used.
- **language**: `English`, `Spanish`, or `mixed English and Spanish`.

## Required mix across all 60 messages

- **Priority**: 18 Immediate, 22 Delayed, 12 Minor, 8 Deceased.
- **Status**: 30 Unknown, 10 Trapped, 10 Exposed, 10 Sheltered.
- **Hazard**: use at least 12 different categories; `MEDICAL_CRISIS` at most 12 times; no other category more than 6 times.
- **Length**: about 20 short (5–15 words), 30 medium (15–40 words), 10 long (40–80 words).
- **Language**: 46 English, 8 Spanish, 6 mixed English and Spanish.
- **Third party**: at least 15 third-party reports.

## Realism rules (be messier than feels natural)

- Real crisis texts are much messier than polished prose:
  - typos and autocorrect errors
  - missing punctuation, ALL CAPS, and SMS shorthand ("u", "ppl", "pls", "rn")
  - lowercase sentence starts, and run-ons
  - words dropped mid-sentence
- At least half the messages should have several typos or no punctuation at all.
- Never use the words "triage", "priority", "red", "yellow", "green" or "black", and never use the label names themselves.
- Never reuse an opening, phrase, name, street or scenario.
- Double-check each label against its message before writing the line, especially that every `Unknown` message truly gives no clue about location or mobility.
````
