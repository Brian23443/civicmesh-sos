# Demo checklist (owner: T2)

## Hardware test log

| Date / time | Test | Result |
|---|---|---|
| 2026-10-10 13:15 | Appendix B radio link test, boards ~1 m apart, SF7 | First frame `861200012B0BF3BA7E6A68E77800BEEF0050` byte-exact; 5/5 received, no CRC errors; RSSI −19 to −20 dBm, SNR +12.75 to +13.25 dB; 59 ms per `transmit()` call (incl. overhead; spec ToA 51 ms) |
| 2026-10-10 13:17 | Radio test sender → receiver → `bridge.server --port /dev/cu.usbserial-0001` | 4/4 frames became incidents; decoded IMMEDIATE · FLOOD · TRAPPED · 2+1 · INSULIN, 30.267198 / −97.743098, M10 |
| 2026-10-10 13:26 | Phone (Airplane Mode + Wi-Fi) → field node `/sos` → base station, blocking `receive()` | 2 of 3 frames received. Cause: RadioLib's blocking `receive()` listens in ~250 ms windows and drops frames that start between them. Fixed with continuous RX + DIO1 interrupt (`cmStartListening` / `cmPollPacket`). |
| 2026-10-10 13:32 | Same, continuous RX, identical URL reloaded 10× | 7 heard; browser served cached pages. Fixed with `Cache-Control: no-store` on every field-node response. |
| 2026-10-10 13:36 | Same, both fixes, 10 reloads | **10/10** relayed and received; one pin, `heard_count` 10; RSSI −16 dBm, SNR +13.25 dB. Hour-7 check passes (pin via hand-typed `/sos` URL). |
| _TBD_ | Range at demo distance (SNR > ~0 dB → SF7 OK) | |
| _TBD_ | Field node on power bank, 100 back-to-back `/sos` requests (free heap stable) | |

## Board assignment

| Port on Brian's MacBook | Board | Notes |
|---|---|---|
| `/dev/cu.usbserial-0001` | base station (receiver) | stays on the laptop |
| `/dev/cu.usbserial-4` | field node (sender) | cable may be flaky — replace before the demo |

_Power-on order, phone prep and recovery steps: to be written in hours 9–12._
