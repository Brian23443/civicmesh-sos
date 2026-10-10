# CivicMesh-SOS — Team plan (orchestrator view)

`MASTER_PROMPT.md` is the full specification. It is split into four self-contained track briefs. **Each teammate gives their assistant only their own track file**; it contains their scope, timeline, the shared contracts, and every spec section they need, copied verbatim.

| Track | File | Branch | One-line mission |
|---|---|---|---|
| T1 — Core & Model | [TRACK_1_CORE_MODEL.md](TRACK_1_CORE_MODEL.md) | `track/t1-core-model` | Schema + 18-byte packer in hour 1; resolvers; Stage 1 prototype model; evaluation; browser export. Phase B: fine-tune + ship decision. |
| T2 — Hardware & Bridge | [TRACK_2_HARDWARE_BRIDGE.md](TRACK_2_HARDWARE_BRIDGE.md) | `track/t2-hardware-bridge` | LoRa radio test in hour 1; FastAPI bridge with `--simulate` by hour 4; field node + base station firmware; integration lead + demo freeze. Phase B: ACK, slides. |
| T3 — Dashboard & Data | [TRACK_3_DASHBOARD_DATA.md](TRACK_3_DASHBOARD_DATA.md) | `track/t3-dashboard-data` | 310 chatbot validation rows by hour 3; operator dashboard (MapLibre + offline PMTiles). Phase B: generate 5,000 rows + Jev label check. |
| T4 — Survivor PWA | [TRACK_4_SURVIVOR_PWA.md](TRACK_4_SURVIVOR_PWA.md) | `track/t4-survivor-pwa` | Offline PWA: design, JS ports of packer/resolvers/decoding with parity tests, onnxruntime-web inference, Airplane Mode on iPhone + Android, hosting. |

## Dependency graph

```
            hour 1                     hour 3–5
T1 schema/packer/common ──► T2 bridge decode      T1 model files + fixtures ──► T4 inference + parity
                       └──► T3 importer
T3 chatbot rows (h2–3) ──► T1 unknown_margin + validation scores
T4 APP_URL (h3) ──────────► T2 field node "Back to CivicMesh" link
T2 bridge --simulate (h4) ► T3 dashboard live data
T2 field node + T3 dashboard (h7) ► hand-typed /sos URL makes a pin
T4 PWA offline on phones (h12) ──► everyone: §13.5 demo ×5 → tag demo-freeze (h15)
T3 scored.jsonl (h17) ──► T1 training → ship decision (h21)
```

Every arrow has a contract (K1–K7, in each track file) so the consumer builds against a stub until the producer delivers.

## Hour-by-hour (Phase A → demo freeze at hour 15)

| Hour | T1 Core & Model | T2 Hardware & Bridge | T3 Dashboard & Data | T4 Survivor PWA |
|---|---|---|---|---|
| 0–1 | schema, packer, tests, common.py ★ | Arduino setup, radio test ★ | start 3 chatbot chats; Dribbble refs | Dribbble refs + tokens |
| 1–2 | resolvers + tests | shared C header; bridge start | importer + checks + tests | skeleton + PWA precache |
| 2–3 | prototypes, eval script, fixtures ★ | bridge | import 310 rows ★; dashboard skeleton | hosting → APP_URL ★; TS packer |
| 3–5 | tune unknown_margin; ONNX export + parity ★ | bridge `--simulate` ★; serial reader | dashboard on mocks → live | resolvers port + parity; screens on mock |
| 5–7 | refresh fixtures; support T4 parity | base station; field node ★ | full §13.4 UI ★ | real inference |
| 7–12 | measure, demo-safe sentences | range/power, checklist, phone tests | offline basemap, polish, `dist/` | iOS/Android Airplane Mode ★ |
| 12–15 | **all: §13.5 demo 5× in a row → `demo-freeze`** | (T2 tags) | | |
| 15–17 | Stage 2 model + train.py | ACK | verify endpoints, generate, verify ★ | Stage 2 swap path |
| 17–21 | train, eval, export, ship decision | slides | eval help, backup recording | phone numbers for slides |
| 22–24 | polish, slides, rehearsal ×3 | | | |

★ = merge to `main` and announce in team chat.

## Rebuilding the track files

The track files are generated from `tracks/_build/` (templates + `common.md` + verbatim sections of `MASTER_PROMPT.md`). After editing a template or the master:

```bash
python3 tracks/_build/build_tracks.py
```
