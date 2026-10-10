# Demo checklist (owner: T2)

## Hardware test log

| Date / time | Test | Result |
|---|---|---|
| 2026-10-10 13:15 | Appendix B radio link test, boards ~1 m apart, SF7 | First frame `861200012B0BF3BA7E6A68E77800BEEF0050` byte-exact; 5/5 received, no CRC errors; RSSI −19 to −20 dBm, SNR +12.75 to +13.25 dB; 59 ms per `transmit()` call (incl. overhead; spec ToA 51 ms) |
| 2026-10-10 13:17 | Radio test sender → receiver → `bridge.server --port /dev/cu.usbserial-0001` | 4/4 frames became incidents; decoded IMMEDIATE · FLOOD · TRAPPED · 2+1 · INSULIN, 30.267198 / −97.743098, M10 |
| 2026-10-10 13:26 | Phone (Airplane Mode + Wi-Fi) → field node `/sos` → base station, blocking `receive()` | 2 of 3 frames received. Cause: RadioLib's blocking `receive()` listens in ~250 ms windows and drops frames that start between them. Fixed with continuous RX + DIO1 interrupt (`cmStartListening` / `cmPollPacket`). |
| 2026-10-10 13:32 | Same, continuous RX, identical URL reloaded 10× | 7 heard; browser served cached pages. Fixed with `Cache-Control: no-store` on every field-node response. |
| 2026-10-10 13:36 | Same, both fixes, 10 reloads | **10/10** relayed and received; one pin, `heard_count` 10; RSSI −16 dBm, SNR +13.25 dB. Hand-typed `/sos` URL → pin in the bridge API (dashboard part of the hour-7 check pending Track 3). |
| 2026-10-10 13:42 | Field node on a wall USB adapter (not the Mac), 5 reloads | **5/5** received, one pin `heard_count` 5; RSSI −44 dBm, SNR +13.25 dB. Power bank still to be tried once (some banks shut off at low current draw). |
| 2026-10-10 18:01–18:48 | **iPhone end to end** (Safari, then Home Screen app; Airplane Mode + CivicMesh-SOS Wi-Fi) → field node (wall) → LoRa → base station → bridge → dashboard, live site https://brian23443.github.io/civicmesh-sos-app/ (Stage 1) | Bugs found and fixed along the way: relay "Back" link empty (quoted APP_URL) → re-sends; GPS gave up after 10 s; Home Screen app needs its own online first launch; bridge pinned to a renamed port; model failed after ~4 reports (iOS memory) → relay Back now restores the app page. |
| 2026-10-10 18:47–18:48 | **§13.5 demo, 5 runs in a row** (seq 5–9, Home Screen app) | **5/5**: each IMMEDIATE · FLOOD · TRAPPED · 2 adults · INSULIN, heard once, GPS M25–M50, ~1 s phone → dashboard, model loaded once for all five. → tagged `demo-freeze`. |
| _TBD_ | Android (Chrome) end to end, at least once | |
| _TBD_ | Range at demo distance (SNR > ~0 dB → SF7 OK) | |
| _TBD_ | Field node on power bank, 100 back-to-back `/sos` requests (free heap stable) | |

## Board assignment

| Port on Brian's MacBook | Board | Notes |
|---|---|---|
| `/dev/cu.usbserial-0001` | base station (receiver) | stays on the laptop |
| `/dev/cu.usbserial-4` | field node (sender) | cable may be flaky — replace before the demo |

---

# Demo day

Demo script (MASTER_PROMPT §13.5): a judge's phone opens the website once online → Airplane Mode → types *"Water is rising fast, my mother needs insulin, 2 of us trapped in attic"* → Review shows **Red · Flood · Trapped · 2 adults · Insulin** → joins `CivicMesh-SOS` → Send → within ~1 s a pulsing Red pin appears on the dashboard → click it (decoded fields + 18-byte breakdown) → remove the pin → Undo.

## 1. Kit (pack the night before)

- [ ] Base station board + **antenna attached** + **known-good USB-C data cable**
- [ ] Field node board + **antenna attached**
- [ ] Power bank, charged, **tested with the field node** (some banks switch off at very low current draw) + its cable
- [ ] Spare data cable (replace the flaky one on the field node), spare USB wall adapter
- [ ] Laptop + charger; repo up to date on `main`/`demo-freeze`; `.venv` installed; `dashboard/dist/` built; `dashboard/public/demo.pmtiles` copied in (git-ignored)
- [ ] One iPhone **and** one Android phone, charged, each having opened the website online at least once ("Ready offline ✓")
- [ ] Backup screen recording of a full run (Track 3), on the laptop desktop
- [ ] This checklist, printed or on a second screen

**Never power a board without its antenna.** Transmitting without one can damage the SX1262.

## 1b. Software prep (once per laptop, needs internet)

```bash
.venv/bin/pip install -r requirements.txt          # includes uvicorn[standard] — without it the dashboard never connects
(cd dashboard && npm install && npm run build)      # → dashboard/dist, served by the bridge at /
(cd web && corepack pnpm@10 install && corepack pnpm@10 build && corepack pnpm@10 check:inference-assets)
```

Then deploy `web/dist` to the HTTPS host (`APP_URL` in docs/INTEGRATION.md) and re-flash the field node with that URL
(firmware/README.md). Quick local checks: `.venv/bin/python -m pytest -q`, `(cd web && corepack pnpm@10 test)`.

## 2. Setup (T−30 min)

Order matters: the bridge must be listening before any frame is sent, and opening a board's serial port restarts that board.

1. **Base station** → laptop USB. Check the port: `ls /dev/cu.usb*` (on Brian's MacBook it is `/dev/cu.usbserial-0001`).
2. **Fresh pins for the demo** (old rehearsal pins would otherwise still be on the map, and a backup link reused within 10 minutes only bumps "heard" on the old pin):
   ```bash
   rm -f bridge/incidents.db
   ```
3. **Start the bridge** from the repo root (serves the dashboard at `/`). Let it **auto-detect** the base station —
   don't pin `--port`: macOS renames the port when a board is re-plugged (seen in testing: `-4` became `-0001`), and a
   pinned bridge keeps retrying the old name while every report is lost.
   ```bash
   .venv/bin/python -m bridge.server
   ```
   Check: `curl -s localhost:8000/api/health` → `"serial_connected":true`. The base station's screen shows **BASE STATION ready**.
4. **Dashboard**: open `http://localhost:8000/` full-screen on the projector. Top bar shows WebSocket ● and serial ● connected.
5. **Field node** → power bank (or wall adapter). Screen shows **READY · 0 sent**, `Wi-Fi: CivicMesh-SOS`, `192.168.4.1`. Place it where the judge stands; base station at the laptop.
6. **Smoke test** with a backup link (§5 below, link 2 or 3 — not link 1, keep that fresh): pin appears on the dashboard within ~1 s. Remove it from the dashboard afterwards.
7. **Phones**: open the website **online** → wait for **"Ready offline ✓"** → **Airplane Mode on** → **Wi-Fi on** → join **CivicMesh-SOS** → when iOS/Android warns "No Internet Connection", choose **stay connected / use without internet**. Reload the website once in Airplane Mode to prove it is cached.

## 3. During the demo — what to point at

| Moment | Show |
|---|---|
| Review screen | The **"What gets sent (18 bytes)"** section: the whole report is 36 hex characters; the original text never leaves the phone |
| Tap Send | Field node screen: **SENT · RED / 3 ppl · seq N** (the phone's relay page says **Sent ✓**) |
| Dashboard | Pulsing Red pin + toast; click → decoded fields, RSSI/SNR, the byte-by-byte breakdown |
| Remove → Undo | Pin fades, Undo toast brings it back |

## 4. If something goes wrong

| Symptom | Likely cause | Fix (in order) |
|---|---|---|
| Phone shows "Sent ✓" but no pin | Bridge not running / not on the base station's port | `curl -s localhost:8000/api/health`; restart the bridge (§2.3). Check the base station screen: if it shows the frame, the radio worked and the problem is on the laptop |
| Base station screen didn't change either | Radio link | Antennas screwed on? Both boards on the same firmware (SF7)? Press RST on both. Move the boards closer |
| Phone can't load `192.168.4.1` | Phone not on `CivicMesh-SOS`, or the phone silently fell back to cellular / another Wi-Fi | Settings → Wi-Fi → `CivicMesh-SOS`, "stay connected". Airplane Mode keeps cellular off. Type `http://` explicitly; never `https://` |
| `CivicMesh-SOS` network missing | Field node unpowered or crashed | Check its screen; replug the power bank / press RST. Some power banks sleep — wake it or use the wall adapter |
| "Report not recognised" page | Malformed link (hand-typed backup link with a typo) | Re-type it; it must be exactly 36 hex characters |
| "Not sent yet" page | Radio transmit failed twice | Wait 2 s, tap Send / reload once more; press RST on the field node |
| Dashboard says "Reconnecting…" | Bridge restarted or crashed | Restart the bridge; the dashboard reconnects by itself and reloads the pins from the database |
| `serial_connected: false` | Base station cable/port | Replug; `ls /dev/cu.usb*` — the port name can change after replugging; restart the bridge with the new `--port` |
| Pin appears but no new pin on a repeat | Working as designed: same device + seq within 10 min = same report, "heard" count goes up | Use a different backup link, or send from the website (it increments seq) |
| Website broken on the judge's phone | PWA / model issue | Use the second phone. Last resort: type a backup link (§5) on any phone joined to `CivicMesh-SOS` |
| Everything broken | — | Play the backup screen recording, then explain the 18-byte frame from the dashboard drawer of an earlier pin |

## 5. Backup links (no website needed)

Type on any phone joined to `CivicMesh-SOS`. Each has its own device id and seq, so each makes a **new** pin (once per fresh database / per 10 minutes). Pins land a few hundred metres apart around the simulator's default center (30.2672, −97.7431); regenerate them around the venue once Track 3 sets the demo center in `docs/INTEGRATION.md`.

| # | Shows | Link |
|---|---|---|
| 1 | §13.5 scenario — Red · FLOOD · Trapped · 2 adults · INSULIN | `http://192.168.4.1/sos?d=860200012B0CAEBA7E0D6ACB2C20D0010150` |
| 2 | Red · FIRE_SMOKE · Trapped · 3 adults · OXYGEN, BURNS | `http://192.168.4.1/sos?d=8A0300822B0D68BA7DB06ACB2C20D0020250` |
| 3 | Yellow · STRUCTURAL_COLLAPSE · Sheltered · 2 adults + 1 child · MOBILITY_IMPAIRED | `http://192.168.4.1/sos?d=0D1200102B0E22BA7D526ACB2C20D0030358` |
| 4 | Green · ELECTRICAL_POWER · Sheltered · 4 adults | `http://192.168.4.1/sos?d=140400002B0EDDBA7CF56ACB2C20D0040450` |
| 5 | Red · MEDICAL_CRISIS · third-party report with an address (⚠ location discrepancy) | `http://192.168.4.1/sos?d=9E0119002B0F97BA7C986ACB2C20D0050550` |

## 6. Demo freeze (hours 12–15)

- [ ] Full §13.5 script on the **iPhone**, start to finish, **5 times in a row** without touching code. Reset between runs: remove the pin on the dashboard (or §2.2 for a clean slate).
- [ ] Same on the **Android** phone (at least once).
- [ ] Field node on the **power bank** for every freeze run.
- [ ] Then tag it (Track 2):
  ```bash
  git checkout main && git pull
  git tag -a demo-freeze -m "Demo freeze: §13.5 passes 5/5"
  git push origin demo-freeze
  ```
- [ ] After the tag, `main` only takes changes that keep the demo working; re-run the script after every merge.

## 7. After the demo

- Power the field node off before packing (no antenna-less transmits in a bag).
- Stop the bridge with Ctrl-C.
