"""Frame packer tests — every bullet of MASTER_PROMPT §3 "Required packer tests"."""

import pytest

from src.schema import (
    EmergencyPacket,
    GpsAccuracy,
    HazardClass,
    LocationConfidenceType,
    MedicalFlags,
    RescueStatus,
    TriagePriority,
    TriageSlotResult,
)
from src.serialization.bit_packer import (
    FRAME_LEN,
    frame_to_hex,
    hex_to_frame,
    pack_binary_frame,
    unpack_binary_frame,
)

VECTOR_1 = "861200012B0BF3BA7E6A68E77800BEEF0050"
VECTOR_2 = "9E0119002B0BF3BA7E6A68E7780000000040"


def make_packet(
    priority=TriagePriority.IMMEDIATE, hazard=HazardClass.FLOOD, status=RescueStatus.TRAPPED,
    adults=2, children=1, medical=MedicalFlags.INSULIN, third_party=False,
    location=LocationConfidenceType.DIRECT_ON_SCENE, lat=30.2672, lon=-97.7431,
    ts=1760000000, device=0xBEEF, seq=0, gps=GpsAccuracy.M10,
) -> EmergencyPacket:
    slots = TriageSlotResult(
        priority=priority, hazard=hazard, rescue_status=status, adult_count=adults,
        pediatric_count=children, medical_flags=medical, is_third_party_report=third_party,
        location_type=location, confidence=1.0,
    )
    return EmergencyPacket(slots=slots, latitude=lat, longitude=lon, gps_accuracy=gps,
                           timestamp=ts, device_id=device, seq=seq)


def test_vector_1():
    assert frame_to_hex(pack_binary_frame(make_packet())) == VECTOR_1


def test_vector_2_third_party_address():
    p = make_packet(hazard=HazardClass.MEDICAL_CRISIS, adults=1, children=0, medical=MedicalFlags.NONE,
                    third_party=True, location=LocationConfidenceType.EXPLICIT_ADDRESS,
                    device=0, gps=GpsAccuracy.NO_FIX)
    frame = pack_binary_frame(p)
    assert frame_to_hex(frame) == VECTOR_2
    assert frame[2:4] == b"\x19\x00"  # flags become 0x1900


def test_every_frame_is_18_bytes():
    for prio in TriagePriority:
        for gps in GpsAccuracy:
            assert len(pack_binary_frame(make_packet(priority=prio, gps=gps))) == FRAME_LEN


def test_byte_0_and_1_bit_positions():
    f = pack_binary_frame(make_packet(priority=TriagePriority.DECEASED, hazard=HazardClass.OTHER,
                                      status=RescueStatus.UNKNOWN, adults=5, children=9))
    assert f[0] & 0x03 == 3            # priority bits 0-1
    assert (f[0] >> 2) & 0x0F == 15    # hazard bits 2-5
    assert f[0] >> 6 == 3              # status bits 6-7
    assert f[1] & 0x0F == 5            # adults bits 0-3
    assert f[1] >> 4 == 9              # children bits 4-7

    f = pack_binary_frame(make_packet(priority=TriagePriority.DELAYED, hazard=HazardClass.FIRE_SMOKE,
                                      status=RescueStatus.EXPOSED, adults=0, children=0))
    assert f[0] == 0b01_0010_01
    assert f[1] == 0


def test_headcounts_saturate_at_15():
    p = make_packet(adults=40, children=99)
    assert p.slots.adult_count == 15 and p.slots.pediatric_count == 15
    assert pack_binary_frame(p)[1] == 0xFF
    p.slots.adult_count = 200  # bypassing validation: the packer still clamps
    assert pack_binary_frame(p)[1] & 0x0F == 15


@pytest.mark.parametrize("lat,lon", [(90, 180), (-90, -180), (90, -180), (-90, 180), (0, 0),
                                     (-33.8688, 151.2093), (64.1466, -21.9426)])
def test_coordinate_round_trip(lat, lon):
    out = unpack_binary_frame(pack_binary_frame(make_packet(lat=lat, lon=lon)))
    assert abs(out.latitude - lat) <= 1.1e-5
    assert abs(out.longitude - lon) <= 2.2e-5


def test_tail_bytes_land_in_the_right_places():
    f = pack_binary_frame(make_packet(ts=0x01020304, device=0xA1B2, seq=0xC3, gps=GpsAccuracy.M500))
    assert f[10:14] == bytes([1, 2, 3, 4])   # timestamp
    assert f[14:16] == bytes([0xA1, 0xB2])   # device id
    assert f[16] == 0xC3                     # seq
    assert f[17] & 0x07 == 0                 # spare
    assert (f[17] >> 3) & 0x07 == 6          # GPS bucket M500
    assert f[17] >> 6 == 1                   # version


def test_wrong_version_rejected():
    f = bytearray(hex_to_frame(VECTOR_1))
    for version in (0, 2, 3):
        f[17] = (f[17] & 0x3F) | (version << 6)
        with pytest.raises(ValueError):
            unpack_binary_frame(bytes(f))


@pytest.mark.parametrize("length", [0, 17, 19, 36])
def test_wrong_length_rejected(length):
    with pytest.raises(ValueError):
        unpack_binary_frame(bytes(length))


@pytest.mark.parametrize("meters,bucket", [(None, 0), (3.2, 1), (10, 2), (480, 6), (2000, 7),
                                           (-1, 0), (0, 1), (5, 1), (25, 3), (50, 4), (100, 5), (500, 6)])
def test_gps_bucketing(meters, bucket):
    assert GpsAccuracy.from_meters(meters) == bucket


def test_unpack_round_trip_fields():
    p = unpack_binary_frame(hex_to_frame(VECTOR_1))
    s = p.slots
    assert (s.priority, s.hazard, s.rescue_status) == (TriagePriority.IMMEDIATE, HazardClass.FLOOD,
                                                        RescueStatus.TRAPPED)
    assert (s.adult_count, s.pediatric_count) == (2, 1)
    assert s.medical_flags == MedicalFlags.INSULIN
    assert not s.is_third_party_report and s.location_type == LocationConfidenceType.DIRECT_ON_SCENE
    assert (p.timestamp, p.device_id, p.seq, p.gps_accuracy) == (1760000000, 0xBEEF, 0, GpsAccuracy.M10)
    assert frame_to_hex(pack_binary_frame(p)) == VECTOR_1


def test_unpack_derives_third_party_and_location_priority():
    p = unpack_binary_frame(hex_to_frame(VECTOR_2))
    assert p.slots.is_third_party_report
    assert p.slots.location_type == LocationConfidenceType.EXPLICIT_ADDRESS
    assert frame_to_hex(pack_binary_frame(p)) == VECTOR_2

    # ADDRESS > LANDMARK > PROXIMATE when several LOC bits are set.
    f = bytearray(hex_to_frame(VECTOR_1))
    f[2:4] = (MedicalFlags.LOC_PROXIMATE | MedicalFlags.LOC_LANDMARK).to_bytes(2, "big")
    assert unpack_binary_frame(bytes(f)).slots.location_type == LocationConfidenceType.LANDMARK_POI
    f[2:4] = MedicalFlags.LOC_PROXIMATE.to_bytes(2, "big")
    assert unpack_binary_frame(bytes(f)).slots.location_type == LocationConfidenceType.PROXIMATE_OFFSET


@pytest.mark.parametrize("location,expected", [
    (LocationConfidenceType.PROXIMATE_OFFSET, 0x1200),
    (LocationConfidenceType.LANDMARK_POI, 0x1400),
    (LocationConfidenceType.EXPLICIT_ADDRESS, 0x1800),
    (LocationConfidenceType.DIRECT_ON_SCENE, 0x0000),
])
def test_location_flags(location, expected):
    f = pack_binary_frame(make_packet(medical=MedicalFlags.NONE, location=location))
    assert int.from_bytes(f[2:4], "big") == expected


def test_hex_helpers():
    assert hex_to_frame(VECTOR_1.lower()) == hex_to_frame(VECTOR_1)
    with pytest.raises(ValueError):
        hex_to_frame("8612")
    with pytest.raises(ValueError):
        hex_to_frame("ZZ" + VECTOR_1[2:])


def test_medical_flags_accept_composites_and_names():
    s = TriageSlotResult(priority=TriagePriority.MINOR, medical_flags=0x0005, is_third_party_report=False,
                         location_type=LocationConfidenceType.DIRECT_ON_SCENE, confidence=0.5)
    assert s.medical_flags == MedicalFlags.INSULIN | MedicalFlags.BLEEDING
    s2 = TriageSlotResult(priority=0, medical_flags=["CARDIAC", "BURNS"], is_third_party_report=False,
                          location_type=0, confidence=0.5)
    assert s2.medical_flags == MedicalFlags.CARDIAC | MedicalFlags.BURNS
    assert s2.model_dump()["medical_flags"] == 0xA0


def test_summary_line():
    p = make_packet()
    assert p.slots.summary() == "Red · FLOOD · Trapped · 2 adults + 1 child · INSULIN"
