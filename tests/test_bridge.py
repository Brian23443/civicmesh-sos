"""Bridge server tests (MASTER_PROMPT §13.3, contract K3)."""

import random

import pytest
from fastapi.testclient import TestClient

from bridge import frame_codec
from bridge.frame_codec import decode_frame, hex_to_frame
from bridge.server import IncidentStore, create_app, parse_frame_line, random_frame

VECTOR_1 = "861200012B0BF3BA7E6A68E77800BEEF0050"
VECTOR_2 = "9E0119002B0BF3BA7E6A68E7780000000040"


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path / "test.db", use_serial=False, dashboard_dist=None)
    with TestClient(app) as c:
        yield c


# --- frame codec ------------------------------------------------------------


def test_local_packer_reproduces_both_vectors():
    common = dict(lat=30.2672, lon=-97.7431, timestamp=1760000000)
    v1 = frame_codec._local_pack(priority=2, hazard=1, status=2, adults=2, children=1, flags=0x0001,
                                 device_id=0xBEEF, seq=0, gps_accuracy=2, **common)
    v2 = frame_codec._local_pack(priority=2, hazard=7, status=2, adults=1, children=0, flags=0x1900,
                                 device_id=0, seq=0, gps_accuracy=0, **common)
    assert v1.hex().upper() == VECTOR_1
    assert v2.hex().upper() == VECTOR_2


@pytest.mark.skipif(not frame_codec.shared_packer_available(), reason="Track 1 packer (K1) not on this branch yet")
def test_shared_packer_matches_local_packer():
    rng = random.Random(0)
    for seq in range(50):
        frame = random_frame(rng, (30.2672, -97.7431), device_id=7, seq=seq)  # uses the shared packer
        fields = decode_frame(frame)
        flags = sum(1 << frame_codec.MEDICAL_NAMES.index(m) for m in fields["medical"])
        flags |= int.from_bytes(frame[2:4], "big") & 0xFF00
        local = frame_codec._local_pack(
            priority=fields["priority"]["value"], hazard=fields["hazard"]["value"],
            status=fields["status"]["value"], adults=fields["adults"], children=fields["children"],
            flags=flags, lat=fields["lat"], lon=fields["lon"], timestamp=fields["sent_at"],
            device_id=7, seq=seq, gps_accuracy=fields["gps_accuracy"]["value"],
        )
        assert local == frame


def test_decode_vector_2_third_party_address():
    d = decode_frame(hex_to_frame(VECTOR_2))
    assert d["hazard"]["name"] == "MEDICAL_CRISIS"
    assert d["third_party"] is True
    assert d["location_type"] == "EXPLICIT_ADDRESS"
    assert d["location_discrepancy"] is True
    assert d["medical"] == []
    assert d["gps_accuracy"] == {"value": 0, "name": "NO_FIX", "meters_max": None}


def test_decode_rejects_bad_length_and_version():
    with pytest.raises(ValueError):
        decode_frame(bytes(17))
    bad_version = bytearray(hex_to_frame(VECTOR_1))
    bad_version[17] = (bad_version[17] & 0x3F) | (2 << 6)
    with pytest.raises(ValueError):
        decode_frame(bytes(bad_version))


def test_parse_frame_line():
    frame, rssi, snr = parse_frame_line(f"FRAME {VECTOR_1} -41.0 9.75")
    assert frame.hex().upper() == VECTOR_1 and rssi == -41.0 and snr == 9.75
    assert parse_frame_line(f"FRAME {VECTOR_1.lower()} -41 9") is not None
    assert parse_frame_line("CRC error, packet dropped") is None
    assert parse_frame_line("Unknown frame version, ignored") is None


# --- API ----------------------------------------------------------------------


def test_debug_frame_matches_k3_example(client):
    r = client.post("/api/debug/frame", json={"hex": VECTOR_1, "rssi": -41.0, "snr": 9.75})
    assert r.status_code == 200
    body = r.json()
    assert body["duplicate"] is False
    inc = body["incident"]
    expected = {
        "frame_hex": VECTOR_1, "device_id": 48879, "seq": 0, "rssi": -41.0, "snr": 9.75, "heard_count": 1,
        "priority": {"value": 2, "name": "IMMEDIATE", "color": "red"},
        "hazard": {"value": 1, "name": "FLOOD"},
        "status": {"value": 2, "name": "TRAPPED"},
        "adults": 2, "children": 1, "medical": ["INSULIN"],
        "third_party": False, "location_type": "DIRECT_ON_SCENE", "location_discrepancy": False,
        "lat": 30.2672, "lon": -97.7431,
        "gps_accuracy": {"value": 2, "name": "M10", "meters_max": 10},
        "sent_at": 1760000000, "state": "active", "removed_at": None,
    }
    for key, value in expected.items():
        assert inc[key] == pytest.approx(value) if isinstance(value, float) else inc[key] == value, key
    assert set(inc) == set(expected) | {"id", "received_at", "last_heard_at"}


def test_duplicate_updates_heard_count_and_best_signal(client):
    first = client.post("/api/debug/frame", json={"hex": VECTOR_1, "rssi": -90.0, "snr": -2.0}).json()
    second = client.post("/api/debug/frame", json={"hex": VECTOR_1.lower(), "rssi": -60.0, "snr": -5.0}).json()
    assert second["duplicate"] is True
    assert second["incident"]["id"] == first["incident"]["id"]
    assert second["incident"]["heard_count"] == 2
    assert second["incident"]["rssi"] == -60.0 and second["incident"]["snr"] == -2.0
    assert len(client.get("/api/incidents").json()) == 1


def test_remove_and_restore(client):
    inc = client.post("/api/debug/frame", json={"hex": VECTOR_1}).json()["incident"]
    assert inc["rssi"] is None and inc["snr"] is None

    removed = client.post(f"/api/incidents/{inc['id']}/remove").json()
    assert removed["state"] == "removed" and removed["removed_at"] is not None
    assert client.get("/api/incidents").json() == []
    assert len(client.get("/api/incidents?state=removed").json()) == 1

    restored = client.post(f"/api/incidents/{inc['id']}/restore").json()
    assert restored["state"] == "active" and restored["removed_at"] is None
    assert len(client.get("/api/incidents?state=all").json()) == 1
    assert client.post("/api/incidents/nope/remove").status_code == 404


def test_bad_frames_rejected(client):
    assert client.post("/api/debug/frame", json={"hex": "8612"}).status_code == 400
    assert client.post("/api/debug/frame", json={"hex": "ZZ" + VECTOR_1[2:]}).status_code == 400
    assert client.post("/api/debug/frame", json={"hex": VECTOR_1[:-2] + "10"}).status_code == 400
    assert client.get("/api/incidents?state=bogus").status_code == 400


def test_health(client):
    h = client.get("/api/health").json()
    assert h == {"serial_connected": False, "port": None, "last_frame_at": None, "active_count": 0}
    client.post("/api/debug/frame", json={"hex": VECTOR_1})
    h = client.get("/api/health").json()
    assert h["active_count"] == 1 and h["last_frame_at"] is not None


def test_websocket_events(client):
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "health"
        inc = client.post("/api/debug/frame", json={"hex": VECTOR_1}).json()["incident"]
        assert ws.receive_json() == {"type": "incident.new", "incident": inc}
        client.post("/api/debug/frame", json={"hex": VECTOR_1})
        assert ws.receive_json()["type"] == "incident.updated"
        client.post(f"/api/incidents/{inc['id']}/remove")
        assert ws.receive_json()["type"] == "incident.removed"
        client.post(f"/api/incidents/{inc['id']}/restore")
        assert ws.receive_json()["type"] == "incident.restored"


def test_store_survives_restart_and_dedup_window(tmp_path):
    path = tmp_path / "persist.db"
    frame = hex_to_frame(VECTOR_1)
    store = IncidentStore(path)
    inc, is_new = store.ingest(frame, -50.0, 5.0, now=1000.0)
    assert is_new
    _, is_new = store.ingest(frame, -50.0, 5.0, now=1000.0 + 599)
    assert not is_new
    _, is_new = store.ingest(frame, -50.0, 5.0, now=1000.0 + 1300)  # >10 min after the first → new pin
    assert is_new
    reopened = IncidentStore(path)
    assert {i["id"] for i in reopened.list("all")} >= {inc["id"]}


def test_simulator_frames_decode():
    rng = random.Random(1)
    for seq in range(200):
        d = decode_frame(random_frame(rng, (30.2672, -97.7431), device_id=3, seq=seq % 256))
        assert 0 <= d["adults"] <= 15 and 0 <= d["children"] <= 15
        if d["gps_accuracy"]["name"] != "NO_FIX":
            assert abs(d["lat"] - 30.2672) < 0.05 and abs(d["lon"] + 97.7431) < 0.05
