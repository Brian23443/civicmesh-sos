# CivicMesh-SOS Operator Dashboard

Track 3's offline-first React dashboard scaffold.

## Development

    npm install
    npm run dev

The dev server uses the strict port http://localhost:5174. Requests to /api and
/ws proxy to http://localhost:8000, including WebSocket upgrades.

## Build

    npm run build

The output is written to dashboard/dist so the Track 2 bridge can serve it.

## Current map behavior

The scaffold initializes MapLibre with a network-free blank style and renders
mock incidents as a data-driven GeoJSON circle layer over the dark command-grid
surface. No runtime CDN or tile request is made.

If MapLibre or WebGL emits an error, the map switches to a CSS grid fallback
that positions the same incident pins relative to the configured center. This
keeps the operator view usable before the demo PMTiles extract is added.
