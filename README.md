# RescuNote

**SOS without signal:** on-phone AI turns a survivor's message into an 18-byte radio alert that reaches rescuers over LoRa.

A survivor types (or dictates) what's happening on a phone in Airplane Mode → an on-device model fills in a triage report → they confirm → an 18-byte frame goes over local Wi-Fi to a LoRa field node → 915 MHz LoRa → base station → a pin on the operator dashboard. No internet or cell service anywhere in the chain.

- **Try the survivor app:** https://rescunote.tech/ (works offline after one visit) · [Privacy](https://rescunote.tech/privacy.html)
- **Quick run guide (laptop, boards, iPhone):** [docs/RUN_END_TO_END.md](docs/RUN_END_TO_END.md)
- Project story: [docs/DEVPOST_STORY.md](docs/DEVPOST_STORY.md) · Full specification: [MASTER_PROMPT.md](MASTER_PROMPT.md) · Live integration values: [docs/INTEGRATION.md](docs/INTEGRATION.md)

| Part | Folder | Stack |
|---|---|---|
| Survivor app (PWA) | `web/` | React, TypeScript, Vite, onnxruntime-web (WASM), offline service worker |
| Triage model + training | `src/`, `training/`, `stage1/` | PyTorch, Hugging Face Transformers, ONNX (INT8) |
| Radio firmware | `firmware/` | Heltec WiFi LoRa 32 V3 (ESP32-S3 + SX1262), RadioLib, Arduino |
| Bridge | `bridge/` | Python, FastAPI, SQLite, WebSockets, pyserial |
| Operator dashboard | `dashboard/` | React, MapLibre, offline PMTiles map |

## Run it end to end

Requires macOS or Linux, Python 3.11+, Node.js 20+.

### 1. Get the code and the large assets

The offline map (70 MB) and the trained model (18 MB) live on the [v1.0-demo release](https://github.com/Brian23443/civicmesh-sos/releases/tag/v1.0-demo), not in git:

```bash
git clone https://github.com/Brian23443/civicmesh-sos.git
cd civicmesh-sos
./scripts/fetch-assets.sh        # → dashboard/public/demo.pmtiles and web/public/model/ (checksums verified)
```

### 2. Bridge + operator dashboard (the command-post laptop)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
(cd dashboard && npm ci && npm run build)       # the bridge serves dashboard/dist
```

**Without radio hardware** — simulated reports around the demo map area:

```bash
python3 -m bridge.server --simulate --no-serial --center 40.5234,-74.4594
```

**With the base station plugged in by USB** (the serial port is auto-detected):

```bash
python3 -m bridge.server
```

Open **http://localhost:8000** for the dashboard.

### 3. Radio boards

Two Heltec WiFi LoRa 32 V3 boards. **Attach the antennas before powering them.** In the Arduino IDE install the *esp32* board package and the **RadioLib** and **ESP8266 and ESP32 OLED driver for SSD1306 displays** (ThingPulse) libraries, then flash:

- `firmware/base_station/` → the board plugged into the laptop;
- `firmware/field_node/` → the relay near the survivor (USB power bank or wall adapter). It creates the open Wi-Fi network **RescuNote** at `192.168.4.1`.

Details and command-line flashing: [firmware/README.md](firmware/README.md).

### 4. Send a report from a phone

1. While online, open https://rescunote.tech/ and wait for **Ready offline ✓** (optionally Share → *Add to Home Screen*, then open it once online).
2. Turn on **Airplane Mode**, turn **Wi-Fi** back on, and join **RescuNote** (stay connected when iOS warns there's no internet).
3. Type what's happening → **Send for help** → check the summary → **Send**. The relay shows *Report sent*, and a pin appears on the dashboard within about a second.

To run the survivor app yourself instead of the hosted copy:

```bash
cd web && corepack pnpm@10 install && corepack pnpm@10 build && corepack pnpm@10 preview   # http://localhost:5173
```

(A self-hosted copy must be served over HTTPS for phones to install it offline, and the field node's `APP_URL` in `firmware/field_node/field_node.ino` should point at it.)

## Tests

```bash
pytest                                        # Python: frame packer, resolvers, bridge
(cd web && corepack pnpm@10 test)             # survivor app: parity with Python, flow, voice
(cd dashboard && npx playwright test)         # dashboard smoke tests (needs Playwright's browser)
```

## Credits

Map data © OpenStreetMap contributors (ODbL), via Protomaps. Base model: sentence-transformers/all-MiniLM-L6-v2 (Apache 2.0). Voice clips generated with ElevenLabs. Third-party notices for the app: [web/public/THIRD_PARTY_NOTICES.txt](web/public/THIRD_PARTY_NOTICES.txt).
