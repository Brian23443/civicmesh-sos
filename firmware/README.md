# Firmware (Track 2)

| Sketch | Board | Role |
|---|---|---|
| `radio_test/` | both | Appendix B link test. `ROLE_SENDER` 1 = field node, 0 = base station |
| `field_node/` | field node | Wi-Fi AP `CivicMesh-SOS` → `GET /sos?d=<hex>` → LoRa |
| `base_station/` | base station | LoRa → serial `FRAME <hex> <rssi> <snr>` for the bridge |

**Attach the antenna before powering a board.** Transmitting without one can damage the SX1262.

Shared radio settings, pins and the C frame packer live in `common/civicmesh_common.h`. Edit it there, then run `./sync_common.sh` (the Arduino IDE only compiles files inside a sketch folder, so each sketch has a copy). Host test of the packer: `c++ -std=c++17 -o /tmp/test_pack common/test_pack.cpp && /tmp/test_pack`.

## Flashing

Arduino IDE: board **Heltec WiFi LoRa 32(V3)**, open the sketch, Upload. Or from the repo root with the IDE's bundled CLI:

```bash
CLI="/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli"
"$CLI" compile --fqbn esp32:esp32:heltec_wifi_lora_32_V3 firmware/base_station
"$CLI" upload  --fqbn esp32:esp32:heltec_wifi_lora_32_V3 -p /dev/cu.usbserial-0001 firmware/base_station
"$CLI" monitor -p /dev/cu.usbserial-0001 -c baudrate=115200
```

Set the hosted website URL for the field node's "Back to CivicMesh" link without editing the sketch:

```bash
"$CLI" compile --fqbn esp32:esp32:heltec_wifi_lora_32_V3 \
  --build-property 'build.extra_flags=-DAPP_URL="\"https://your-app.example\""' firmware/field_node
```

If an upload hangs at "Connecting…": hold PRG, tap RST, release PRG. If the board misbehaves after Meshtastic/factory firmware: Tools → Erase All Flash Before Sketch Upload → Enabled.

## Field-node checks

From a laptop joined to `CivicMesh-SOS`:

```bash
curl "http://192.168.4.1/sos?d=861200012B0BF3BA7E6A68E77800BEEF0050"   # → "Sent ✓" page, pin on the dashboard
curl -i "http://192.168.4.1/sos?d=1234"                                 # → 400 friendly error
```
