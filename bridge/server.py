"""CivicMesh-SOS bridge server (MASTER_PROMPT §13.3, contract K3).

Reads `FRAME <hex> <rssi> <snr>` lines from the base station over serial,
decodes them, deduplicates on (device_id, seq) within 10 minutes, stores
incidents in SQLite, and pushes them to the dashboard over a WebSocket.

    python3 -m bridge.server                       # auto-detect the base station
    python3 -m bridge.server --port /dev/cu.usbserial-0001
    python3 -m bridge.server --simulate            # random frames, no hardware
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import glob
import json
import logging
import math
import random
import re
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from bridge.frame_codec import decode_frame, frame_to_hex, haversine_offset, hex_to_frame, pack_frame

log = logging.getLogger("bridge")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "bridge" / "incidents.db"
DASHBOARD_DIST = ROOT / "dashboard" / "dist"
DEFAULT_CENTER = (30.2672, -97.7431)

DEDUP_WINDOW_S = 10 * 60
HEALTH_INTERVAL_S = 5
SERIAL_BAUD = 115200
SERIAL_RETRY_S = 2
FRAME_LINE = re.compile(r"^FRAME ([0-9A-Fa-f]{36}) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)$")


# ---------------------------------------------------------------------------
# Incident store
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    device_id INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    frame_hex TEXT NOT NULL,
    decoded TEXT NOT NULL,
    rssi REAL,
    snr REAL,
    heard_count INTEGER NOT NULL DEFAULT 1,
    received_at REAL NOT NULL,
    last_heard_at REAL NOT NULL,
    state TEXT NOT NULL DEFAULT 'active',
    removed_at REAL
);
CREATE INDEX IF NOT EXISTS incidents_dedup ON incidents (device_id, seq, received_at);
"""


def _best(old: float | None, new: float | None) -> float | None:
    if old is None:
        return new
    if new is None:
        return old
    return max(old, new)


class IncidentStore:
    """SQLite-backed incident store. Thread-safe (one connection + a lock)."""

    def __init__(self, path: str | Path) -> None:
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(SCHEMA)
        self._db.commit()

    @staticmethod
    def _to_json(row: sqlite3.Row) -> dict[str, Any]:
        decoded = json.loads(row["decoded"])
        return {
            "id": row["id"],
            "frame_hex": row["frame_hex"],
            "device_id": row["device_id"],
            "seq": row["seq"],
            "rssi": row["rssi"],
            "snr": row["snr"],
            "heard_count": row["heard_count"],
            "priority": decoded["priority"],
            "hazard": decoded["hazard"],
            "status": decoded["status"],
            "adults": decoded["adults"],
            "children": decoded["children"],
            "medical": decoded["medical"],
            "third_party": decoded["third_party"],
            "location_type": decoded["location_type"],
            "location_discrepancy": decoded["location_discrepancy"],
            "lat": decoded["lat"],
            "lon": decoded["lon"],
            "gps_accuracy": decoded["gps_accuracy"],
            "sent_at": decoded["sent_at"],
            "received_at": row["received_at"],
            "last_heard_at": row["last_heard_at"],
            "state": row["state"],
            "removed_at": row["removed_at"],
        }

    def ingest(
        self, frame: bytes, rssi: float | None, snr: float | None, now: float | None = None
    ) -> tuple[dict[str, Any], bool]:
        """Stores a frame. Returns (incident, is_new). Raises ValueError on a bad frame."""
        decoded = decode_frame(frame)
        now = time.time() if now is None else now
        device_id, seq = decoded["device_id"], decoded["seq"]
        with self._lock:
            row = self._db.execute(
                "SELECT * FROM incidents WHERE device_id = ? AND seq = ? AND received_at >= ? "
                "ORDER BY received_at DESC LIMIT 1",
                (device_id, seq, now - DEDUP_WINDOW_S),
            ).fetchone()
            if row is not None:
                self._db.execute(
                    "UPDATE incidents SET heard_count = heard_count + 1, last_heard_at = ?, "
                    "rssi = ?, snr = ? WHERE id = ?",
                    (now, _best(row["rssi"], rssi), _best(row["snr"], snr), row["id"]),
                )
                self._db.commit()
                return self._get(row["id"]), False

            incident_id = str(uuid.uuid4())
            self._db.execute(
                "INSERT INTO incidents (id, device_id, seq, frame_hex, decoded, rssi, snr, "
                "heard_count, received_at, last_heard_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'active')",
                (incident_id, device_id, seq, frame_to_hex(frame), json.dumps(decoded), rssi, snr, now, now),
            )
            self._db.commit()
            return self._get(incident_id), True

    def _get(self, incident_id: str) -> dict[str, Any]:
        row = self._db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        return self._to_json(row)

    def get(self, incident_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
            return self._to_json(row) if row else None

    def list(self, state: str = "active") -> list[dict[str, Any]]:
        with self._lock:
            if state == "all":
                rows = self._db.execute("SELECT * FROM incidents ORDER BY received_at DESC").fetchall()
            else:
                rows = self._db.execute(
                    "SELECT * FROM incidents WHERE state = ? ORDER BY received_at DESC", (state,)
                ).fetchall()
            return [self._to_json(r) for r in rows]

    def set_state(self, incident_id: str, state: str) -> dict[str, Any] | None:
        removed_at = time.time() if state == "removed" else None
        with self._lock:
            cur = self._db.execute(
                "UPDATE incidents SET state = ?, removed_at = ? WHERE id = ?", (state, removed_at, incident_id)
            )
            self._db.commit()
            if cur.rowcount == 0:
                return None
            return self._get(incident_id)

    def active_count(self) -> int:
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM incidents WHERE state = 'active'").fetchone()[0]


# ---------------------------------------------------------------------------
# WebSocket hub and shared state
# ---------------------------------------------------------------------------


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()

    async def broadcast(self, message: dict[str, Any]) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001 — a dropped client must not break the others
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


class Bridge:
    """Everything the routes, the serial thread and the simulator share."""

    def __init__(self, store: IncidentStore) -> None:
        self.store = store
        self.hub = Hub()
        self.serial_connected = False
        self.serial_port: str | None = None
        self.last_frame_at: float | None = None
        self.loop: asyncio.AbstractEventLoop | None = None

    def health(self) -> dict[str, Any]:
        return {
            "serial_connected": self.serial_connected,
            "port": self.serial_port,
            "last_frame_at": self.last_frame_at,
            "active_count": self.store.active_count(),
        }

    async def ingest(self, frame: bytes, rssi: float | None, snr: float | None) -> tuple[dict[str, Any], bool]:
        incident, is_new = self.store.ingest(frame, rssi, snr)
        self.last_frame_at = incident["last_heard_at"]
        await self.hub.broadcast({"type": "incident.new" if is_new else "incident.updated", "incident": incident})
        log.info(
            "%s %s seq=%d dev=%04X heard=%d",
            "NEW" if is_new else "DUP", incident["priority"]["name"], incident["seq"],
            incident["device_id"], incident["heard_count"],
        )
        return incident, is_new

    def ingest_from_thread(self, frame: bytes, rssi: float | None, snr: float | None) -> None:
        if self.loop is None:
            return
        future = asyncio.run_coroutine_threadsafe(self.ingest(frame, rssi, snr), self.loop)
        try:
            future.result(timeout=5)
        except ValueError as exc:
            log.warning("dropped frame: %s", exc)
        except Exception:  # noqa: BLE001
            log.exception("failed to ingest frame")


# ---------------------------------------------------------------------------
# Serial reader (background thread)
# ---------------------------------------------------------------------------


def detect_port() -> str | None:
    ports = sorted(glob.glob("/dev/cu.usbserial*") + glob.glob("/dev/cu.usbmodem*"))
    return ports[0] if ports else None


def parse_frame_line(line: str) -> tuple[bytes, float, float] | None:
    m = FRAME_LINE.match(line.strip())
    if not m:
        return None
    return bytes.fromhex(m.group(1)), float(m.group(2)), float(m.group(3))


def serial_reader(bridge: Bridge, port_arg: str | None, stop: threading.Event) -> None:
    import serial  # noqa: PLC0415 — only needed with hardware

    while not stop.is_set():
        port = port_arg or detect_port()
        if port is None:
            bridge.serial_connected, bridge.serial_port = False, None
            stop.wait(SERIAL_RETRY_S)
            continue
        try:
            with serial.Serial(port, SERIAL_BAUD, timeout=1) as ser:
                bridge.serial_connected, bridge.serial_port = True, port
                log.info("serial connected on %s", port)
                while not stop.is_set():
                    raw = ser.readline()
                    if not raw:
                        continue
                    line = raw.decode("utf-8", errors="replace").strip()
                    parsed = parse_frame_line(line)
                    if parsed is None:
                        log.debug("serial: %s", line)
                        continue
                    bridge.ingest_from_thread(*parsed)
        except (serial.SerialException, OSError) as exc:
            log.warning("serial %s unavailable (%s); retrying in %ss", port, exc, SERIAL_RETRY_S)
        bridge.serial_connected = False
        stop.wait(SERIAL_RETRY_S)


# ---------------------------------------------------------------------------
# Simulator
# ---------------------------------------------------------------------------


def _weighted(rng: random.Random, weights: dict[int, float]) -> int:
    return rng.choices(list(weights), weights=list(weights.values()))[0]


def random_frame(rng: random.Random, center: tuple[float, float], device_id: int, seq: int) -> bytes:
    """A realistic random frame around `center`, packed with the real packer."""
    priority = _weighted(rng, {0: 0.27, 1: 0.25, 2: 0.38, 3: 0.10})
    hazard = _weighted(rng, {
        0: .03, 1: .16, 2: .12, 3: .11, 4: .06, 5: .05, 6: .08, 7: .09,
        8: .04, 9: .03, 10: .04, 11: .05, 12: .04, 13: .02, 14: .05, 15: .03,
    })
    status = _weighted(rng, {
        0: {0: .70, 1: .12, 2: .03, 3: .15}, 1: {0: .35, 1: .25, 2: .25, 3: .15},
        2: {0: .10, 1: .30, 2: .50, 3: .10}, 3: {0: .10, 1: .30, 2: .40, 3: .20},
    }[priority])
    adults = rng.choices(range(9), weights=[3, 40, 25, 12, 8, 5, 3, 2, 2])[0]
    children = rng.choices(range(5), weights=[60, 20, 12, 5, 3])[0]
    if adults + children == 0:
        adults = 1
    n_medical = rng.choices([0, 1, 2], weights=[0.5, 0.35, 0.15] if priority >= 1 else [0.9, 0.1, 0])[0]
    flags = 0
    for bit in rng.sample(range(8), n_medical):
        flags |= 1 << bit
    if rng.random() < 0.10:  # third-party report with a stated location
        flags |= 0x0100 | 0x1000 | rng.choice([0x0200, 0x0400, 0x0800])
    gps_accuracy = 0 if rng.random() < 0.05 else rng.choices(range(1, 8), weights=[10, 30, 25, 15, 10, 5, 5])[0]
    if gps_accuracy == 0:
        lat, lon = 0.0, 0.0
    else:
        dist = rng.uniform(0, 2000)
        bearing = rng.uniform(0, 2 * math.pi)
        lat, lon = haversine_offset(center[0], center[1], dist * math.cos(bearing), dist * math.sin(bearing))
    return pack_frame(
        priority=priority, hazard=hazard, status=status, adults=adults, children=children, flags=flags,
        lat=lat, lon=lon, timestamp=int(time.time()), device_id=device_id, seq=seq,
        gps_accuracy=gps_accuracy,
    )


async def simulator(bridge: Bridge, center: tuple[float, float], interval: tuple[float, float]) -> None:
    rng = random.Random()
    seqs: dict[int, int] = {}
    recent: list[tuple[bytes, float, float]] = []
    log.info("simulator on: new frame every %.0f-%.0f s around %.4f,%.4f", *interval, *center)
    while True:
        await asyncio.sleep(rng.uniform(*interval))
        if recent and rng.random() < 0.10:  # a mesh repeat, to exercise dedup
            frame, rssi, snr = rng.choice(recent)
            rssi, snr = rssi + rng.uniform(-6, 6), snr + rng.uniform(-3, 3)
        else:
            device_id = rng.randint(1, 20)
            seq = seqs.get(device_id, rng.randint(0, 255))
            seqs[device_id] = (seq + 1) % 256
            frame = random_frame(rng, center, device_id, seq)
            rssi, snr = round(rng.uniform(-110, -40), 1), round(rng.uniform(-8, 11), 2)
            recent = (recent + [(frame, rssi, snr)])[-10:]
        try:
            await bridge.ingest(frame, round(rssi, 1), round(snr, 2))
        except ValueError as exc:
            log.warning("simulator produced a bad frame: %s", exc)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------


class DebugFrame(BaseModel):
    hex: str
    rssi: float | None = None
    snr: float | None = None


def create_app(
    db_path: str | Path = DEFAULT_DB,
    *,
    serial_port: str | None = None,
    use_serial: bool = True,
    simulate: bool = False,
    center: tuple[float, float] = DEFAULT_CENTER,
    sim_interval: tuple[float, float] = (3.0, 8.0),
    dashboard_dist: Path | None = DASHBOARD_DIST,
) -> FastAPI:
    bridge = Bridge(IncidentStore(db_path))

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        bridge.loop = asyncio.get_running_loop()
        stop = threading.Event()
        tasks = [asyncio.create_task(health_pusher())]
        if use_serial:
            threading.Thread(target=serial_reader, args=(bridge, serial_port, stop), daemon=True).start()
        if simulate:
            tasks.append(asyncio.create_task(simulator(bridge, center, sim_interval)))
        yield
        stop.set()
        for t in tasks:
            t.cancel()

    async def health_pusher() -> None:
        while True:
            await asyncio.sleep(HEALTH_INTERVAL_S)
            await bridge.hub.broadcast({"type": "health", "health": bridge.health()})

    app = FastAPI(title="CivicMesh-SOS bridge", lifespan=lifespan)
    app.state.bridge = bridge
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/incidents")
    def list_incidents(state: str = "active") -> list[dict[str, Any]]:
        if state not in ("active", "removed", "all"):
            raise HTTPException(400, "state must be active, removed or all")
        return bridge.store.list(state)

    async def _change_state(incident_id: str, state: str, event: str) -> dict[str, Any]:
        incident = bridge.store.set_state(incident_id, state)
        if incident is None:
            raise HTTPException(404, "incident not found")
        await bridge.hub.broadcast({"type": event, "incident": incident})
        return incident

    @app.post("/api/incidents/{incident_id}/remove")
    async def remove_incident(incident_id: str) -> dict[str, Any]:
        return await _change_state(incident_id, "removed", "incident.removed")

    @app.post("/api/incidents/{incident_id}/restore")
    async def restore_incident(incident_id: str) -> dict[str, Any]:
        return await _change_state(incident_id, "active", "incident.restored")

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return bridge.health()

    @app.post("/api/debug/frame")
    async def debug_frame(body: DebugFrame) -> dict[str, Any]:
        try:
            frame = hex_to_frame(body.hex)
            incident, is_new = await bridge.ingest(frame, body.rssi, body.snr)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {"incident": incident, "duplicate": not is_new}

    @app.websocket("/ws")
    async def ws(websocket: WebSocket) -> None:
        await websocket.accept()
        bridge.hub.clients.add(websocket)
        try:
            await websocket.send_json({"type": "health", "health": bridge.health()})
            while True:
                await websocket.receive_text()  # clients don't send anything; this detects disconnects
        except WebSocketDisconnect:
            pass
        finally:
            bridge.hub.clients.discard(websocket)

    if dashboard_dist is not None and dashboard_dist.is_dir():
        app.mount("/", StaticFiles(directory=str(dashboard_dist), html=True), name="dashboard")

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="CivicMesh-SOS bridge server")
    parser.add_argument("--port", help="base station serial port (default: auto-detect)")
    parser.add_argument("--no-serial", action="store_true", help="don't read from a serial port")
    parser.add_argument("--simulate", action="store_true", help="generate random frames every 3-8 s")
    parser.add_argument("--center", default=f"{DEFAULT_CENTER[0]},{DEFAULT_CENTER[1]}",
                        help="simulator center as LAT,LON")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite database path")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--http-port", type=int, default=8000)
    parser.add_argument("-v", "--verbose", action="store_true", help="also log non-FRAME serial lines")
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    lat, lon = (float(x) for x in args.center.split(","))
    app = create_app(args.db, serial_port=args.port, use_serial=not args.no_serial,
                     simulate=args.simulate, center=(lat, lon))

    import uvicorn  # noqa: PLC0415

    uvicorn.run(app, host=args.host, port=args.http_port, log_level="warning")


if __name__ == "__main__":
    main()
