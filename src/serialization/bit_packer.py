"""The 18-byte frame, format version 1 (MASTER_PROMPT §3, contract K1).

Big-endian, exactly 18 bytes, no application checksum (the SX1262 hardware CRC
protects the radio hop; TCP protects the Wi-Fi hop).

    byte 0      priority (bits 0-1) | hazard (2-5) | rescue_status (6-7)
    byte 1      adult_count (0-3) | pediatric_count (4-7), each clamped 0-15
    bytes 2-3   flags (MedicalFlags, >H)
    bytes 4-6   latitude  int24 = round(lat / 90  * (2^23 - 1))
    bytes 7-9   longitude int24 = round(lon / 180 * (2^23 - 1))
    bytes 10-13 timestamp uint32
    bytes 14-15 device_id uint16
    byte 16     seq uint8
    byte 17     spare (0-2) | gps_accuracy (3-5) | version (6-7) = 1

Rounding note: Python's round() is round-half-to-even, JS Math.round rounds half
toward +inf and C lround rounds half away from zero. Exact .5 ties essentially
never occur with real coordinates, so all three produce the same bytes; the two
§3 test vectors are checked byte-exact in every language.
"""

from __future__ import annotations

from src.schema import (
    FLAGS_MASK,
    EmergencyPacket,
    GpsAccuracy,
    HazardClass,
    LocationConfidenceType,
    MedicalFlags,
    RescueStatus,
    TriagePriority,
    TriageSlotResult,
)

FRAME_LEN = 18
FRAME_VERSION = 1
INT24_MAX = (1 << 23) - 1

_LOCATION_FLAGS = {
    LocationConfidenceType.DIRECT_ON_SCENE: MedicalFlags.NONE,
    LocationConfidenceType.PROXIMATE_OFFSET: MedicalFlags.LOC_PROXIMATE | MedicalFlags.LOCATION_DISCREPANCY_ALERT,
    LocationConfidenceType.LANDMARK_POI: MedicalFlags.LOC_LANDMARK | MedicalFlags.LOCATION_DISCREPANCY_ALERT,
    LocationConfidenceType.EXPLICIT_ADDRESS: (
        MedicalFlags.LOC_EXPLICIT_ADDRESS | MedicalFlags.LOCATION_DISCREPANCY_ALERT
    ),
}


def frame_flags(slots: TriageSlotResult) -> int:
    """The 16-bit flags word the packer transmits (§3 "Packer rule for the flag bits")."""
    flags = int(slots.medical_flags)
    if slots.is_third_party_report:
        flags |= MedicalFlags.THIRD_PARTY_REPORT | MedicalFlags.LOCATION_DISCREPANCY_ALERT
    flags |= _LOCATION_FLAGS[slots.location_type]
    return flags & FLAGS_MASK


def _encode_coord(value: float, scale: float) -> int:
    v = round(value / scale * INT24_MAX)
    return max(-INT24_MAX, min(INT24_MAX, v))


def _decode_coord(raw: bytes, scale: float) -> float:
    return int.from_bytes(raw, "big", signed=True) / INT24_MAX * scale


def pack_binary_frame(packet: EmergencyPacket) -> bytes:
    s = packet.slots
    adults = max(0, min(15, s.adult_count))
    children = max(0, min(15, s.pediatric_count))
    out = bytearray()
    out.append((int(s.priority) & 0x03) | ((int(s.hazard) & 0x0F) << 2) | ((int(s.rescue_status) & 0x03) << 6))
    out.append(adults | (children << 4))
    out += frame_flags(s).to_bytes(2, "big")
    out += _encode_coord(packet.latitude, 90.0).to_bytes(3, "big", signed=True)
    out += _encode_coord(packet.longitude, 180.0).to_bytes(3, "big", signed=True)
    out += (packet.timestamp & 0xFFFFFFFF).to_bytes(4, "big")
    out += packet.device_id.to_bytes(2, "big")
    out.append(packet.seq)
    out.append(((int(packet.gps_accuracy) & 0x07) << 3) | (FRAME_VERSION << 6))
    assert len(out) == FRAME_LEN
    return bytes(out)


def unpack_binary_frame(data: bytes) -> EmergencyPacket:
    """Decodes a v1 frame. Raises ValueError on a length other than 18 or a version other than 1.

    `slots.medical_flags` keeps the whole transmitted flags word (bits 0-12), so nothing
    on the wire is lost; `is_third_party_report` and `location_type` are derived from it.
    `confidence` is not transmitted and is set to 0.0.
    """
    if len(data) != FRAME_LEN:
        raise ValueError(f"frame must be {FRAME_LEN} bytes, got {len(data)}")
    version = data[17] >> 6
    if version != FRAME_VERSION:
        raise ValueError(f"unsupported frame version {version}")

    flags = MedicalFlags(int.from_bytes(data[2:4], "big") & FLAGS_MASK)
    if flags & MedicalFlags.LOC_EXPLICIT_ADDRESS:
        location_type = LocationConfidenceType.EXPLICIT_ADDRESS
    elif flags & MedicalFlags.LOC_LANDMARK:
        location_type = LocationConfidenceType.LANDMARK_POI
    elif flags & MedicalFlags.LOC_PROXIMATE:
        location_type = LocationConfidenceType.PROXIMATE_OFFSET
    else:
        location_type = LocationConfidenceType.DIRECT_ON_SCENE

    slots = TriageSlotResult(
        priority=TriagePriority(data[0] & 0x03),
        hazard=HazardClass((data[0] >> 2) & 0x0F),
        rescue_status=RescueStatus(data[0] >> 6),
        adult_count=data[1] & 0x0F,
        pediatric_count=data[1] >> 4,
        medical_flags=flags,
        is_third_party_report=bool(flags & MedicalFlags.THIRD_PARTY_REPORT),
        location_type=location_type,
        confidence=0.0,
    )
    return EmergencyPacket(
        slots=slots,
        latitude=_decode_coord(data[4:7], 90.0),
        longitude=_decode_coord(data[7:10], 180.0),
        gps_accuracy=GpsAccuracy((data[17] >> 3) & 0x07),
        timestamp=int.from_bytes(data[10:14], "big"),
        device_id=int.from_bytes(data[14:16], "big"),
        seq=data[16],
    )


def frame_to_hex(data: bytes) -> str:
    """36 uppercase hex characters."""
    return data.hex().upper()


def hex_to_frame(s: str) -> bytes:
    """Accepts upper or lower case. Raises ValueError on bad length or characters."""
    s = s.strip()
    if len(s) != 2 * FRAME_LEN:
        raise ValueError(f"frame hex must be {2 * FRAME_LEN} characters, got {len(s)}")
    return bytes.fromhex(s)
