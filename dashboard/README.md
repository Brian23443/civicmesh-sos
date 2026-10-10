# CivicMesh-SOS Operator Dashboard

Track 3's Vite, React, and TypeScript command-center dashboard.

## Run locally

Start the Track 2 bridge first:

```bash
python3 -m bridge.server --simulate
```

Then start the dashboard:

```bash
cd dashboard
npm install
npm run dev
```

Open <http://localhost:5174>. Vite proxies `/api` and `/ws` to
`http://localhost:8000`.

## Verification

```bash
npm run build
npx playwright install chromium
npm run test:smoke
```

The smoke suite starts the real Vite server, supplies a browser-level mock bridge,
and verifies:

- clean rendering with no browser console or page errors;
- live WebSocket health state;
- incident detail drawer interaction;
- all nine byte-breakdown rows;
- removal confirmation and the 10-second Undo flow.

## Live bridge behavior

- `GET /api/incidents?state=all` hydrates the initial queue.
- `GET /api/health` hydrates serial and frame health.
- `WS /ws` applies new, updated, removed, restored, and health events.
- Socket reconnect uses exponential backoff from one to fifteen seconds.
- New Immediate incidents pulse on the map and show a top alert toast.
- When sound is enabled, new Immediate incidents play a short synthesized
  WebAudio chime; no audio asset is downloaded.
- Remove and restore actions use the bridge POST endpoints.
- The checked-in mock incidents remain visible when the bridge is unavailable.

## Map strategy

The map uses MapLibre with OpenStreetMap raster tiles. Active incidents with GPS
fixes are held in one GeoJSON source and rendered through data-driven circle
layers. Attribution, scale, zoom, fullscreen, rotation, automatic incident
framing, and selected-incident accuracy rings are enabled.

Selecting a pin or queue card opens the detail drawer and adds a GeoJSON accuracy
polygon when `gps_accuracy.meters_max` is available.

### Offline behavior

`public/offline-sw.js` installs a service worker that caches the application shell
and up to 240 map tiles that the operator has viewed. After one connected visit,
the dashboard and the viewed operating area remain available without a network.
The cache is bounded to avoid uncontrolled device storage growth.

Unvisited map areas cannot be downloaded while offline. If a required tile is not
cached, the map switches to the interactive coordinate grid while keeping all
incident pins, selection, and detail workflows available. API requests are never
stored by the service worker; the existing mock cache continues to cover bridge
outages without serving stale operational responses.
