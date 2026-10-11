# Running RescuNote end to end

The chain: **iPhone** (RescuNote app) → Wi-Fi → **field node** (relay) → 915 MHz LoRa → **base station** (USB) → **laptop** (bridge + dashboard). None of it needs internet once set up.

## Once: set up the laptop

From the repo root (macOS, Python 3.11+, Node.js 20+):

```bash
./scripts/fetch-assets.sh                         # offline map + model from the v1.0-demo release
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
(cd dashboard && npm ci && npm run build)          # the bridge serves dashboard/dist
```

The boards are already flashed. To reflash, see [firmware/README.md](../firmware/README.md). **Always attach the antennas before powering a board.**

## Once: install the app on the iPhone

1. **While online,** open **https://rescunote.tech** in Safari and wait for **Ready offline ✓**.
2. Share → **Add to Home Screen**.
3. Open RescuNote from the Home Screen **once while still online** and wait for **Ready offline ✓** again. The Home Screen app keeps its own offline copy.
4. Allow location when asked.

Optional: tap the speaker button to turn on spoken guidance.

## Each run

**1. Start the command post.** Plug the **base station** into the laptop by USB, then:

```bash
source .venv/bin/activate
python3 -m bridge.server
```

The log should say `serial ports: … = base, … = field` and `serial connected on …`. Open **http://localhost:8000** for the dashboard.

If both boards are plugged into the laptop, the bridge finds the base station by itself. To choose the port yourself, use `--port /dev/cu.usbserial-XXXX`.

**2. Power the field node.** Use a USB power bank, a wall adapter or the laptop. Its screen shows **READY** and **Wi-Fi: RescuNote**, and it creates that Wi-Fi network. After each report, the screen shows **SENT**.

**3. Send a report from the iPhone.**
1. Turn on **Airplane Mode**, then turn **Wi-Fi** back on and join **RescuNote**. If iOS warns there's no internet, stay connected.
2. Open RescuNote from the Home Screen. Type what's happening, or tap a quick phrase, then tap **Send for help**.
3. Check the summary and tap **Send**. The relay shows **Report sent** for 10 seconds, then returns to the app with a "Report handed to the relay" banner.
4. A pin appears on the dashboard within about a second. Click it to see the details and the "what to bring" list.

## No radio hardware?

Run the bridge with simulated reports instead:

```bash
python3 -m bridge.server --simulate --no-serial --center 40.5234,-74.4594
```

## If something goes wrong

| Problem | Fix |
|---|---|
| App says it isn't ready offline | Open it once while online and wait for **Ready offline ✓**. Do this in the Home Screen app, not just Safari. |
| Send doesn't reach the relay | Make sure the phone is on the **RescuNote** Wi-Fi network, and stay connected through the "no internet" warning. |
| Relay says sent but no pin appears | Check the bridge log for `serial connected`. Replug the base station or pass `--port`. Make sure both antennas are attached. |
| Location stays "searching" | GPS without a network can take a minute outdoors. You can send without location. |
| No voice | Turn the speaker button on, and turn the volume up. |
| Dashboard map is blank | Run `./scripts/fetch-assets.sh`, then rebuild the dashboard. |
| Clear old test reports | Click a pin and choose **Remove**, or stop the bridge and delete `bridge/incidents.db`. |
