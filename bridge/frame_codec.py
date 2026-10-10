"""Frame v1 encode/decode for the bridge (MASTER_PROMPT §3, contract K3).

`decode_frame` turns 18 bytes into the triage/location part of the K3 Incident
JSON. `pack_frame` builds frames for `--simulate`.

This is a bridge-local implementation, allowed by contract K1 until Track 1's
`src/serialization/bit_packer.py` lands. When it does, `pack_frame` switches to
the shared packer automatically, and tests/test_bridge.py cross-checks that both
produce identical bytes.
"""

from __future__ import annotations

import math
from typing import Any

FRAME_LEN = 18
FRAME_VERSION = 1
INT24_MAX = (1 << 23) - 1

PRIORITY_NAMES = ["MINOR", "DELAYED", "IMMEDIATE", "DECEASED"]
PRIORITY_COLORS = ["green", "yellow", "red", "black"]
HAZARD_NAMES = [
    "NONE", "FLOOD", "FIRE_SMOKE", "STRUCTURAL_COLLAPSE", "HAZMAT_GAS", "ELECTRICAL_POWER",
    "EXTREME_WEATHER", "MEDICAL_CRISIS", "ACTIVE_VIOLENCE", "TSUNAMI_SURGE", "LANDSLIDE",
    "HYPOTHERMIA_FREEZE", "HEAT_STROKE", "SINKHOLE_SUBSIDENCE", "CONTAMINATED_WATER", "OTHER",
]
STATUS_NAMES = ["SHELTERED", "EXPOSED", "TRAPPED", "UNKNOWN"]
MEDICAL_NAMES = [
    "INSULIN", "OXYGEN", "BLEEDING", "HYPOTHERMIA",
    "MOBILITY_IMPAIRED", "CARDIAC", "PREGNANCY_INFANT", "BURNS",
]
GPS_NAMES = ["NO_FIX", "M5", "M10", "M25", "M50", "M100", "M500", "COARSE"]
GPS_METERS_MAX = [None, 5, 10, 25, 50, 100, 500, None]

THIRD_PARTY_REPORT = 0x0100
LOC_PROXIMATE = 0x0200
LOC_LANDMARK = 0x0400
LOC_EXPLICIT_ADDRESS = 0x0800
LOCATION_DISCREPANCY_ALERT = 0x1000


def _encode_coord(value: float, scale: float) -> int:
    v = round(value / scale * INT24_MAX)
    return max(-INT24_MAX, min(INT24_MAX, v))


def _decode_coord(raw: bytes, scale: float) -> float:
    v = int.from_bytes(raw, "big", signed=True)
    return v / INT24_MAX * scale


def _local_pack(
    *, priority: int, hazard: int, status: int, adults: int, children: int, flags: int,
    lat: float, lon: float, timestamp: int, device_id: int, seq: int, gps_accuracy: int,
) -> bytes:
    """Packs a v1 frame. `flags` must already include bits 8-12."""
    adults = max(0, min(15, adults))
    children = max(0, min(15, children))
    out = bytearray()
    out.append((priority & 0x03) | ((hazard & 0x0F) << 2) | ((status & 0x03) << 6))
    out.append(adults | (children << 4))
    out += (flags & 0xFFFF).to_bytes(2, "big")
    out += _encode_coord(lat, 90.0).to_bytes(3, "big", signed=True)
    out += _encode_coord(lon, 180.0).to_bytes(3, "big", signed=True)
    out += (timestamp & 0xFFFFFFFF).to_bytes(4, "big")
    out += (device_id & 0xFFFF).to_bytes(2, "big")
    out.append(seq & 0xFF)
    out.append(((gps_accuracy & 0x07) << 3) | (FRAME_VERSION << 6))
    return bytes(out)


def _shared_pack(**fields: Any) -> bytes:
    """Packs with Track 1's packer (K1). Raises ImportError until it exists."""
    from src.schema import (  # noqa: PLC0415 — optional dependency
        EmergencyPacket, GpsAccuracy, HazardClass, LocationConfidenceType, MedicalFlags,
        RescueStatus, TriagePriority, TriageSlotResult,
    )
    from src.serialization.bit_packer import pack_binary_frame  # noqa: PLC0415

    flags = fields["flags"]
    if flags & LOC_EXPLICIT_ADDRESS:
        loc = LocationConfidenceType.EXPLICIT_ADDRESS
    elif flags & LOC_LANDMARK:
        loc = LocationConfidenceType.LANDMARK_POI
    elif flags & LOC_PROXIMATE:
        loc = LocationConfidenceType.PROXIMATE_OFFSET
    else:
        loc = LocationConfidenceType.DIRECT_ON_SCENE
    slots = TriageSlotResult(
        priority=TriagePriority(fields["priority"]),
        hazard=HazardClass(fields["hazard"]),
        rescue_status=RescueStatus(fields["status"]),
        adult_count=fields["adults"],
        pediatric_count=fields["children"],
        medical_flags=MedicalFlags(flags & 0x00FF),
        is_third_party_report=bool(flags & THIRD_PARTY_REPORT),
        location_type=loc,
        confidence=1.0,
    )
    packet = EmergencyPacket(
        slots=slots, latitude=fields["lat"], longitude=fields["lon"],
        gps_accuracy=GpsAccuracy(fields["gps_accuracy"]), timestamp=fields["timestamp"],
        device_id=fields["device_id"], seq=fields["seq"],
    )
    return pack_binary_frame(packet)


def shared_packer_available() -> bool:
    try:
        import src.serialization.bit_packer  # noqa: F401, PLC0415
        import src.schema  # noqa: F401, PLC0415
    except ImportError:
        return False
    return True


def pack_frame(**fields: Any) -> bytes:
    """Packs a frame with the shared packer when available, else the local one."""
    if shared_packer_available():
        return _shared_pack(**fields)
    return _local_pack(**fields)


def decode_frame(data: bytes) -> dict[str, Any]:
    """Decodes a v1 frame into the K3 triage/location fields.

    Raises ValueError on a length other than 18 or a version other than 1.
    """
    if len(data) != FRAME_LEN:
        raise ValueError(f"frame must be {FRAME_LEN} bytes, got {len(data)}")
    version = data[17] >> 6
    if version != FRAME_VERSION:
        raise ValueError(f"unsupported frame version {version}")

    priority = data[0] & 0x03
    hazard = (data[0] >> 2) & 0x0F
    status = data[0] >> 6
    flags = int.from_bytes(data[2:4], "big")
    gps = (data[17] >> 3) & 0x07

    if flags & LOC_EXPLICIT_ADDRESS:
        location_type = "EXPLICIT_ADDRESS"
    elif flags & LOC_LANDMARK:
        location_type = "LANDMARK_POI"
    elif flags & LOC_PROXIMATE:
        location_type = "PROXIMATE_OFFSET"
    else:
        location_type = "DIRECT_ON_SCENE"

    lat = _decode_coord(data[4:7], 90.0)
    lon = _decode_coord(data[7:10], 180.0)

    return {
        "device_id": int.from_bytes(data[14:16], "big"),
        "seq": data[16],
        "priority": {"value": priority, "name": PRIORITY_NAMES[priority], "color": PRIORITY_COLORS[priority]},
        "hazard": {"value": hazard, "name": HAZARD_NAMES[hazard]},
        "status": {"value": status, "name": STATUS_NAMES[status]},
        "adults": data[1] & 0x0F,
        "children": data[1] >> 4,
        "medical": [name for bit, name in enumerate(MEDICAL_NAMES) if flags & (1 << bit)],
        "third_party": bool(flags & THIRD_PARTY_REPORT),
        "location_type": location_type,
        "location_discrepancy": bool(flags & LOCATION_DISCREPANCY_ALERT),
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "gps_accuracy": {"value": gps, "name": GPS_NAMES[gps], "meters_max": GPS_METERS_MAX[gps]},
        "sent_at": int.from_bytes(data[10:14], "big"),
    }


def frame_to_hex(data: bytes) -> str:
    return data.hex().upper()


def hex_to_frame(text: str) -> bytes:
    text = text.strip()
    if len(text) != 2 * FRAME_LEN:
        raise ValueError(f"frame hex must be {2 * FRAME_LEN} characters, got {len(text)}")
    try:
        return bytes.fromhex(text)
    except ValueError as exc:
        raise ValueError("frame hex contains non-hex characters") from exc


def haversine_offset(lat: float, lon: float, north_m: float, east_m: float) -> tuple[float, float]:
    """Moves a point by the given metres (used by the simulator)."""
    dlat = north_m / 111_320.0
    dlon = east_m / (111_320.0 * max(0.01, math.cos(math.radians(lat))))
    return lat + dlat, lon + dlon
