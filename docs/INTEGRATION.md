# Integration — live values (contract K7)

Update a row when its value changes, and announce it in team chat.

| Value | Owner | Current value | Used by |
|---|---|---|---|
| `APP_URL` (hosted survivor website, HTTPS) | T4 | **https://brian23443.github.io/civicmesh-sos-app/** — built files only, public repo `Brian23443/civicmesh-sos-app` (GitHub Pages); currently the Stage 1 build | T2 field node `#define APP_URL` |
| Bridge URL | T2 | `http://localhost:8000` | T3 dashboard (Vite proxy) |
| Dashboard dev server | T3 | `http://localhost:5174` | — |
| Survivor PWA dev server | T4 | `http://localhost:5173` | — |
| Field node relay | T2 | SSID `CivicMesh-SOS` (open), `http://192.168.4.1/sos?d=<36 hex>` | T4 Send screen |
| Base station serial port on the demo laptop | T2 | `/dev/cu.usbserial-0001` on Brian's MacBook (auto-detect also works; the second board shows up as `/dev/cu.usbserial-4`) | bridge `--port` |
| LoRa spreading factor | T2 | 7 | both boards |
| Demo map center (lat, lon) | T3 | _TBD — venue_; simulator default `30.2672, -97.7431` | T2 `--simulate --center`, T3 map |
| Demo map bbox (minLon,minLat,maxLon,maxLat) | T3 | _TBD_ | PMTiles extract |
| Model in `web/public/model/` | T1 | `prototype` (Stage 1): bge-small INT8 per-channel, 27.4 MB gzipped; see `artifacts/export_stage1.json` | T4 |
| `unknown_margin` | T1 | 0.02 (start value; tuned on chatbot rows) | `model.json` |
| Triage colors (hex, dark/light) | T3 + T4 | _TBD by hour 1 — same in both apps_ | dashboard, PWA, field node page |
