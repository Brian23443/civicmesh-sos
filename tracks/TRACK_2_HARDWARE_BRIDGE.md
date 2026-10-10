# CivicMesh-SOS — Track 2 of 4: Hardware, Firmware & Bridge Server

> **How to use:** give this entire document to your AI assistant at the start of the hackathon. It is your complete brief: your scope, your deadlines, the contracts other tracks depend on, and — in Part 3 — every section of `MASTER_PROMPT.md` you need, copied **verbatim**. `MASTER_PROMPT.md` in the repo root is the single source of truth for the whole project; if a spec number here ever disagrees with it, the master wins. Every number is decided; do not substitute your own values. Items marked **OPEN** must be verified before relying on them.

---

## Part 1 — Your role and scope

You are the engineering partner of the **Track 2 owner** on a four-person, 24-hour hackathon team building **CivicMesh-SOS**, an offline disaster-triage pipeline (phone → on-device model → 18-byte frame → Wi-Fi → LoRa → laptop dashboard; overview in §0 below).

**Track 2 owns everything with a radio or a serial port in it, plus the laptop bridge:**

1. **Hour 0–1: de-risk the hardware.** Write the radio link test from Appendix B (`firmware/radio_test/radio_test.ino`) and flash both Heltec boards. This is the single biggest unknown in the project; find out early whether it works.
2. **Hours 1–5: the bridge server** (`bridge/server.py`, §13.3): FastAPI + serial reader + SQLite + WebSocket + `--simulate` + `/api/debug/frame`. Track 3's dashboard is built against it (contract K3) — get `--simulate` onto `main` by **hour 4**.
3. **Hours 5–7: the field node** (`firmware/field_node/`, §13.1) and **base station** (`firmware/base_station/`, §13.2) firmware. Done when a hand-typed `http://192.168.4.1/sos?d=…` puts a pin on the dashboard.
4. **Hours 7–15: integration lead.** Range/SNR check, power-bank operation, real-phone end-to-end runs with T4, the demo checklist, and the `demo-freeze` tag.
5. **Phase B/C:** the optional ACK (§13.2), "Received by Command" on the field node, slides and demo rehearsal.

You do **not** build the Python packer (T1 — you import it), the dashboard UI (T3), or the website (T4).

### Ground rules that bind you most (from §0 and §16)

- **Always attach the antenna before transmitting.** Transmitting without one can damage the SX1262.
- **Both boards must use identical radio settings** (frequency, bandwidth, SF, CR, sync word, preamble, TCXO). Put them in one place.
- **Coordinates in C use double precision** (float32 is off by ~2 m).
- Your C frame packer and the field node's frame validation must reproduce **both §3 test vectors byte for byte**.
- The machine is macOS + zsh + Python 3.13 on Apple Silicon. Arduino IDE 2.x. USB-C **data** cables.

---

## Part 2 — Your timeline, tasks and "done when" checks

Push to `main` at every ★.

| Hours | Task | Done when |
|---|---|---|
| 0–0:30 | Arduino IDE setup exactly as §1 "Arduino toolchain": ESP32 boards URL, "esp32 by Espressif Systems", board **Heltec WiFi LoRa 32(V3)**, RadioLib, ThingPulse SSD1306. **Antennas on both boards.** Confirm each board shows a serial port. | Blink/hello sketch uploads to both boards |
| 0–1 | `firmware/radio_test/radio_test.ino` from Appendix B: `ROLE_SENDER` and `LORA_SF` constants at the top; a `packFrameV1()` helper (doubles, big-endian). Flash sender + receiver. Record ms on air. | Receiver prints `FRAME 861200012B0BF3BA7E6A68E77800BEEF0050 …` for the first frame; later frames differ only in bytes 10–13 and byte 16; ~50 ms on air at SF7 ★ |
| 1–2 | Extract the shared radio config + C packer + OLED init into a header both future sketches include (e.g. copy `civicmesh_common.h` into each sketch folder — the Arduino IDE only compiles files inside the sketch folder; keep one canonical copy in `firmware/common/` and a tiny `firmware/sync_common.sh` that copies it). | Radio test still passes using the header |
| 1–4 | `bridge/server.py` (§13.3 + contract K3): FastAPI app on port 8000, SQLite store with the §13.3 columns, `(device_id, seq)` dedup within 10 minutes, WebSocket broadcast, `/api/health`, remove/restore, `/api/debug/frame`, serving `dashboard/dist/` at `/` when present. `--simulate` mode using T1's real `pack_binary_frame` (stub locally until K1 lands at hour 1). `tests/test_bridge.py` with FastAPI `TestClient`: inject vector 1 → incident JSON matches the K3 example field-for-field; inject the same frame again → `heard_count == 2`, no new incident; remove → restore round trip; bad hex → 400. | `python3 -m bridge.server --simulate` streams pins over `/ws`; tests green ★ (by hour 4) |
| 4–5 | Serial reader thread: pyserial at 115200 from `--port` or auto-detect `/dev/cu.usbserial*` / `/dev/cu.usbmodem*`; parse `FRAME` lines; reconnect every 2 s if unplugged; log every non-FRAME line at debug level. Test with the radio-test receiver plugged in. | Real radio frames from the radio-test sender appear as incidents ★ |
| 5–6 | `firmware/base_station/base_station.ino` (§13.2): the Appendix B receiver role, cleaned up. OLED: last frame's priority, headcount, seq, RSSI. | Bridge receives frames from the base station ★ |
| 5–7 | `firmware/field_node/field_node.ino` (§13.1): SoftAP `CivicMesh-SOS` (open, 192.168.4.1), `WebServer`, `GET /sos?d=` (validate 36 hex + version 1 → 400 friendly HTML otherwise; transmit; OLED `SENT · RED · 3 ppl · seq 12`; return the self-contained "Sent ✓" page with the **Back to CivicMesh** link to `APP_URL`), `GET /`, idle OLED `READY · <n> sent`. **No captive-portal DNS.** Get `APP_URL` from `docs/INTEGRATION.md` (T4 fills it by hour 3; use a placeholder `#define` until then). Ask T4 for their design tokens (background, text, accent colors, radius, font stack) so the reply page matches the website's dark design — inline CSS only, no external fonts. | From a laptop joined to `CivicMesh-SOS`, `curl "http://192.168.4.1/sos?d=861200012B0BF3BA7E6A68E77800BEEF0050"` → "Sent ✓" page, and a pin appears on T3's dashboard ★ (hour 7 sync point) |
| 7–9 | Field robustness: run the field node from the power bank; walk the demo distance and read SNR on the base station (> ~0 dB → SF7 is fine; otherwise raise SF in one place on **both** boards, ≤ SF10). Retransmission: if `transmit()` fails, retry once after 100 ms. Make the field node survive 100 back-to-back `/sos` requests (no heap leak: watch `ESP.getFreeHeap()` on serial). | Notes + numbers in `docs/DEMO_CHECKLIST.md` |
| 9–12 | Write `docs/DEMO_CHECKLIST.md`: power-on order, which laptop runs what (`python3 -m bridge.server --port …`), phone prep (open the site online once → "Ready offline ✓" → Airplane Mode → Wi-Fi on → join `CivicMesh-SOS`), recovery steps for every failure you've seen (board reset, serial port changed, iOS refusing the open network, etc.). Help T4 test the full flow on a real iPhone and Android (the HTTPS→HTTP top-level navigation, iOS "no internet" Wi-Fi warnings, the return link). | Checklist reviewed by the team |
| 12–15 | **Run the §13.5 demo script with the whole team.** Fix integration bugs. When it works **5 times in a row**, tag `demo-freeze` (see Git workflow). | `demo-freeze` tag pushed ★ |
| **Phase B/C** | | |
| 15–19 | Optional ACK (§13.2): base station transmits `[0xAC, device_id_hi, device_id_lo, seq]` after each valid frame; field node listens for ~1 s after transmitting (or keeps the radio in receive between requests) and shows "Received by Command" on the OLED; the "Sent ✓" page is already returned, so the ACK is OLED-only. Merge only if the frozen demo still passes 5/5. | ACK shows on the field node; demo still 5/5 |
| 19–22 | Slides: architecture diagram (phone → Wi-Fi → field node → LoRa → base → bridge → dashboard), the 18-byte frame diagram, measured numbers (ms on air, RSSI/SNR, end-to-end latency from Send to pin). Collect numbers from T1 (model accuracy) and T4 (inference ms). | Slides draft shared |
| 22–24 | Rehearsal ×3, with the checklist. Spare boards charged, cables labelled. | — |

### Implementation notes (decisions you can rely on)

- **Byte 17** = `(gps_accuracy << 3) | (1 << 6)`; version = `byte17 >> 6`. Priority = `byte0 & 0x03`; hazard = `(byte0 >> 2) & 0x0F`; status = `byte0 >> 6`; adults = `byte1 & 0x0F`; children = `byte1 >> 4`.
- **int24 encoding in C:** `int32_t v = lround(lat / 90.0 * 8388607.0); clamp to ±8388607; uint32_t u = (uint32_t)v & 0xFFFFFF;` then write `u >> 16`, `u >> 8`, `u` big-endian.
- **Hex parsing on the field node:** accept upper or lower case; reject anything that isn't exactly 36 hex chars; check `(byte17 >> 6) == 1`. Return `400` with a small friendly HTML page (same styling as the success page) for bad input.
- **OLED text for the field node:** priority word from byte 0 (`GREEN`/`YELLOW`/`RED`/`BLACK`), people = adults + children, seq from byte 16: `SENT · RED · 3 ppl · seq 12`. The ThingPulse default fonts may not include `·` and `✓` — use `-` or `|` on the OLED if they render as garbage. (The HTML page can use them; send `Content-Type: text/html; charset=utf-8`.)
- **WebServer + LoRa:** call `server.handleClient()` in `loop()`; transmit synchronously inside the `/sos` handler (51 ms at SF7 is fine). Set the radio back to standby or receive after transmitting.
- **Serial reader:** read lines with `readline()` and a 1 s timeout; strip `\r\n`; regex `^FRAME ([0-9A-Fa-f]{36}) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)$`. Unknown lines are logged, never crash the thread. Handle `SerialException` by closing, sleeping 2 s and re-opening (auto-detect again).
- **Threads and asyncio:** the serial thread hands frames to the event loop with `asyncio.run_coroutine_threadsafe(...)` (capture the loop at startup) so WebSocket broadcasts happen on the loop thread.
- **SQLite:** one connection per thread (`check_same_thread=False` + a lock is fine at this scale). On startup, load active incidents so pins survive a restart.
- **Dedup window:** 10 minutes on `received_at`. A repeat updates `heard_count += 1`, `last_heard_at`, and keeps the **best** RSSI and SNR (max), then broadcasts `incident.updated`.
- **`--simulate`:** every uniform 3–8 s, build a random but realistic `EmergencyPacket` (priority mix close to §6.3: Immediate .38, Delayed .25, Minor .27, Deceased .10; hazard and status plausible; 0–2 medical flags; ~10% third-party with a location type; ~5% NO_FIX), place it within ~2 km of `--center` (default `30.2672,-97.7431`, or the center in `docs/INTEGRATION.md`), pack it with the **real** packer, and push it through the same ingest path as serial frames (so dedup, storage and WebSocket are exercised). Use device ids 1–20 and per-device seq counters; occasionally (10%) re-send a recent frame to exercise dedup.
- **Static files:** mount `dashboard/dist` with `StaticFiles(html=True)` at `/` **after** the `/api` and `/ws` routes.
- **CORS:** allow `http://localhost:5174` for the dashboard dev server (the Vite proxy makes it unnecessary, but it saves debugging time).

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

## 1. Hardware

| Qty | Part | Role |
|---|---|---|
| 2 | **Heltec WiFi LoRa 32 V3**, 915 MHz version: ESP32-S3FN8 (240 MHz dual core), 8 MB flash, 512 KB SRAM, Semtech **SX1262** radio, 0.96" 128×64 **SSD1306** OLED | One **field node** and one **base station** |
| 2 | 915 MHz antennas (u.FL/IPEX) | **Always attach before transmitting**; transmitting without one can damage the SX1262 |
| 2 | USB-C **data** cables (not charge-only) | Programming the boards; the base station's serial link to the laptop |
| 1 | 5 V USB power bank (a 3.7 V LiPo on the board's JST 1.25 mm connector also works) | Powers the field node |
| 1 | iPhone or Android phone | Runs the PWA |
| 1 | Laptop | Runs the bridge and the dashboard, and powers the base station |

### Heltec V3 pin map

| Signal | GPIO |
|---|---|
| LoRa NSS (chip select) | 8 |
| LoRa SCK | 9 |
| LoRa MOSI | 10 |
| LoRa MISO | 11 |
| LoRa RST | 12 |
| LoRa BUSY | 13 |
| LoRa DIO1 | 14 |
| OLED SDA | 17 |
| OLED SCL | 18 |
| OLED RST | 21 (pulse LOW for 20 ms, then HIGH) |
| Vext (OLED power) | 36 — drive **LOW** to power the OLED |

OLED I²C address: 0x3C.

### Radio settings

These are identical on both boards. The boards won't hear each other if any setting differs.

- Configure the SX1262 with RadioLib using:
  - frequency 915.0 MHz
  - bandwidth 125 kHz
  - **spreading factor 7** (a single constant, so it can be changed in one place)
  - coding rate 4/5
  - private sync word 0x12
  - 14 dBm transmit power
  - 8-symbol preamble
  - **1.8 V TCXO**
  - 2-byte hardware CRC, enabled explicitly
- SPI uses the pins in the table above (SCK 9, MISO 11, MOSI 10, NSS 8). RadioLib's SX1262 module is constructed with NSS 8, DIO1 14, RST 12, BUSY 13.
- **Why SF7:** the demo range is at most a street block.
- **Time on air for 18 bytes:**

  | SF | Time on air |
  |---|---|
  | SF7 | 51 ms |
  | SF9 | 185 ms |
  | SF10 | 330 ms |
  | SF12 | 1,319 ms |

  Use SF9–10 only for longer range. Stay ≤ SF10, under the 400 ms US dwell limit.
- **Range check:** if the receiver's SNR stays above ~0 dB at the demo distance, SF7 is enough.

### Arduino toolchain

- Arduino IDE 2.x. On a Mac: **Arduino IDE → Settings… (⌘,) → Additional boards manager URLs**, add `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
- Boards Manager: install **"esp32 by Espressif Systems"** (not "Arduino ESP32 Boards"). Board: **Heltec WiFi LoRa 32(V3)**.
- Libraries:
  - **RadioLib** (Jan Gromes)
  - **ESP8266 and ESP32 OLED driver for SSD1306 displays** (ThingPulse)
- Uploading is flashing. No separate erase is needed. If the board misbehaves after replacing Meshtastic or the factory demo, set Tools → Erase All Flash Before Sketch Upload → Enabled.
- If an upload hangs at "Connecting…": hold PRG, tap RST, release PRG.
- If no serial port appears on macOS, try another cable, then install the Silicon Labs CP210x VCP driver.
- **Appendix B** describes the radio-link test to write first. Write it during the event and flash it to both boards before anything else.

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

### 12.3 Screens and flow

**1. First visit / loading**
- "Preparing emergency mode…" with a progress bar for the model download (~15–25 MB).
- Then **"Ready offline ✓ — you can now use this in Airplane Mode."**
- If the model fails to load: **manual mode**, where the survivor picks every field by hand. The app must always be able to send a report.

**2. Report (home)**
- Status pills: offline-ready, GPS (with ± accuracy), model ready.
- A large textarea: **"What's happening? Who needs help?"**, with a short placeholder example.
- Primary button **Analyze** (shows a spinner; inference should take well under 1 s).
- A link to **My reports**.

**3. Review (confirmation)**
- A large triage banner in the triage color: e.g. **"RED · Life-threatening"**.
- **Hazard** (icon + name), **Situation** (Trapped / Exposed / Sheltered / Unknown).
- **People:** steppers for adults and children.
- **Medical needs:** 8 toggle chips with icons.
- **"Are you at the emergency?"** — Yes / No, I'm reporting for someone else. This sets `third_party`.
- **Location:** GPS accuracy and coordinates. If a location was mentioned, a note: "You mentioned '123 Elm St' — GPS shows where you are, not necessarily the emergency."
- **Every field is editable by tap,** using bottom sheets.
- A collapsed **"What gets sent (18 bytes)"** section shows the hex frame and a one-line explanation. Judges love it.
- Primary button **Continue to send**.

**4. Send**
- Three steps with icons:
  1. Keep Airplane Mode on; turn on Wi-Fi.
  2. Join the network **CivicMesh-SOS**.
  3. Tap **Send**.
- **Send** saves the report to My reports (status "handed to relay"), then sets `location.href = "http://192.168.4.1/sos?d=<36 uppercase hex>"`. This must be a top-level navigation: an HTTPS page cannot `fetch()` plain HTTP.
- Then increment `seq`.

**5. Relay reply page** (served by the field node, §13.1)
- Shows "Sent ✓", with a **Back to CivicMesh** link to the app's hosted URL.

**6. My reports**
- A list of sent reports: time, triage color, hazard, seq. Stored in localStorage, with every access wrapped in try/catch.

**Identity and GPS:**
- `device_id` is a random uint16, created on first run and stored.
- GPS uses `navigator.geolocation.getCurrentPosition({enableHighAccuracy: true, timeout: 10000})`. Bucket `coords.accuracy` per §2. On failure → NO_FIX with lat/lon 0, and the Review screen says "No GPS fix".

---

### 13.1 Field node firmware (`firmware/field_node/`, extend the radio test from Appendix B)

- Wi-Fi SoftAP with SSID `CivicMesh-SOS`, open, IP `192.168.4.1`. ESP32 `WebServer`.
- **`GET /sos?d=<hex>`:**
  1. Require exactly 36 hex chars and version bits = 1. Otherwise return 400 with a friendly HTML error.
  2. Transmit over LoRa.
  3. Show `SENT · RED · 3 ppl · seq 12` on the OLED.
  4. Return a small, self-contained HTML page (inline CSS, matching the website's dark design): **"Sent ✓ — your report is on the rescue network. Stay where you are if it is safe."**
  5. Include a **Back to CivicMesh** link to `APP_URL`, a `#define` holding the hosted website URL.
- **`GET /`:** "CivicMesh relay — open the CivicMesh website to send a report."
- **Idle OLED:** `READY · <n> sent`.
- **No captive-portal DNS redirect.** iOS's portal browser can't see the website's cached model.

### 13.2 Base station firmware (`firmware/base_station/`, Appendix B receiver role)

- Print one line per frame at 115200 baud: `FRAME <36 hex> <rssi> <snr>`.
- Print `CRC error, packet dropped` for CRC failures. Ignore unknown versions.
- OLED: the last frame's priority, headcount and seq, plus RSSI.
- **Optional ACK (Phase B polish):** transmit the 4-byte frame `[0xAC, device_id_hi, device_id_lo, seq]`. The field node shows "Received by Command".

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

### §13.4 (summary — Track 3 builds the dashboard against your bridge)

The dashboard loads `GET /api/incidents?state=active`, then applies WebSocket events, reconnecting with backoff; it removes and restores pins through your API and shows a byte-by-byte breakdown of `frame_hex`. It is built with Vite and its production build in `dashboard/dist/` is served by your bridge at `/`. See MASTER_PROMPT.md §13.4 for the full UI spec.

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

## Appendix B — Radio link test (description; write the code during the event)

One Arduino sketch for both boards (`firmware/radio_test/radio_test.ino`). A compile-time constant `ROLE_SENDER` selects the role: 1 on the field node, 0 on the base station. A second constant sets the spreading factor (7).

**Libraries:** RadioLib (SX1262 driver) and the ThingPulse SSD1306 OLED driver.

**Setup (both roles):**
1. Start serial at 115200 baud.
2. Power the OLED: drive Vext (GPIO 36) LOW. Pulse OLED RST (GPIO 21) LOW for ~20 ms, then HIGH. Initialize the display at I²C address 0x3C on SDA 17 / SCL 18, with a small font.
3. Start SPI on the §1 pins and construct the SX1262 module (NSS 8, DIO1 14, RST 12, BUSY 13).
4. Configure the radio with the §1 settings: 915.0 MHz, 125 kHz, the SF constant, CR 4/5, sync word 0x12, 14 dBm, 8-symbol preamble, 1.8 V TCXO. Enable the 2-byte hardware CRC.
5. If any radio call returns an error, print the error code to serial, show "Radio init FAILED <code>" on the OLED, and halt.
6. Otherwise show "SENDER ready" or "RECEIVER ready".

**A small helper packs a v1 frame** exactly as §3 describes. Use double precision for the coordinates and big-endian byte order. Byte 17 = (gps_accuracy << 3) | (1 << 6).

**Sender loop:**
1. Every 3 seconds, pack test vector 1 from §3: RED, FLOOD, TRAPPED, 2 adults + 1 child, INSULIN, 30.2672 / −97.7431, device 0xBEEF, GPS bucket M10.
2. Vary only two fields per frame: the timestamp is 1760000000 + counter, and seq is counter mod 256.
3. Transmit it, timing the call.
4. Print "Sent seq N (X ms on air)" to serial and show the same on the OLED. On a transmit error, print and show the error code.
5. Increment the counter.

**Receiver loop:**
1. Block on receive for an 18-byte frame.
2. On success:
   - If the version bits (top 2 bits of byte 17) aren't 1, print "Unknown frame version, ignored" and skip it.
   - Otherwise read RSSI and SNR, and print one machine-readable line: `FRAME <36 uppercase hex chars> <rssi> <snr>`. The laptop bridge parses this.
   - Show on the OLED: the priority name (GREEN / YELLOW / RED / BLACK from the low 2 bits of byte 0), adults and children, device id (hex), seq, RSSI and SNR.
3. On a CRC error, print "CRC error, packet dropped".
4. Ignore receive timeouts. Print any other error code.

**Done when:** with antennas attached, the receiver prints `FRAME 861200012B0BF3BA7E6A68E77800BEEF0050 …` for the first frame. Later frames differ only in bytes 10–13 (timestamp) and byte 16 (seq). The sender reports roughly 50 ms on air at SF7.
