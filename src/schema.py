"""Triage fields shared by every component (MASTER_PROMPT §2, contract K1).

These exact names and values are used in Python, JS and C.
"""

from __future__ import annotations

import math
import time
from enum import IntEnum, IntFlag
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, Field, PlainSerializer


class TriagePriority(IntEnum):
    """2 bits."""

    MINOR = 0
    DELAYED = 1
    IMMEDIATE = 2
    DECEASED = 3

    @property
    def label(self) -> str:
        return _PRIORITY_LABELS[self]

    @property
    def color(self) -> str:
        return _PRIORITY_COLORS[self]

    @classmethod
    def from_label(cls, label: str) -> TriagePriority:
        return cls(_PRIORITY_LABELS.index(label))


_PRIORITY_LABELS = ["Minor", "Delayed", "Immediate", "Deceased"]
_PRIORITY_COLORS = ["Green", "Yellow", "Red", "Black"]


class HazardClass(IntEnum):
    """4 bits. The label string is the enum name."""

    NONE = 0
    FLOOD = 1
    FIRE_SMOKE = 2
    STRUCTURAL_COLLAPSE = 3
    HAZMAT_GAS = 4
    ELECTRICAL_POWER = 5
    EXTREME_WEATHER = 6
    MEDICAL_CRISIS = 7
    ACTIVE_VIOLENCE = 8
    TSUNAMI_SURGE = 9
    LANDSLIDE = 10
    HYPOTHERMIA_FREEZE = 11
    HEAT_STROKE = 12
    SINKHOLE_SUBSIDENCE = 13
    CONTAMINATED_WATER = 14
    OTHER = 15

    @property
    def label(self) -> str:
        return self.name

    @classmethod
    def from_label(cls, label: str) -> HazardClass:
        return cls[label]


class RescueStatus(IntEnum):
    """2 bits."""

    SHELTERED = 0
    EXPOSED = 1
    TRAPPED = 2
    UNKNOWN = 3

    @property
    def label(self) -> str:
        return self.name.capitalize()

    @classmethod
    def from_label(cls, label: str) -> RescueStatus:
        return cls[label.upper()]


class MedicalFlags(IntFlag):
    """16-bit flags. Bits 0-7 are medical needs; 8-12 are report/location flags; 13-15 reserved."""

    NONE = 0
    INSULIN = 0x0001
    OXYGEN = 0x0002
    BLEEDING = 0x0004
    HYPOTHERMIA = 0x0008
    MOBILITY_IMPAIRED = 0x0010
    CARDIAC = 0x0020
    PREGNANCY_INFANT = 0x0040
    BURNS = 0x0080
    THIRD_PARTY_REPORT = 0x0100
    LOC_PROXIMATE = 0x0200
    LOC_LANDMARK = 0x0400
    LOC_EXPLICIT_ADDRESS = 0x0800
    LOCATION_DISCREPANCY_ALERT = 0x1000


# The 8 medical needs, in bit order (bits 0-7).
MEDICAL_FLAG_ORDER: list[MedicalFlags] = [MedicalFlags(1 << bit) for bit in range(8)]
MEDICAL_MASK = 0x00FF
FLAGS_MASK = 0x1FFF  # bits 13-15 are reserved and always 0


def medical_names(flags: int) -> list[str]:
    """Names of the medical needs (bits 0-7) set in `flags`, in bit order."""
    return [f.name for f in MEDICAL_FLAG_ORDER if flags & f]


def medical_from_names(names: list[str]) -> MedicalFlags:
    out = MedicalFlags.NONE
    for name in names:
        out |= MedicalFlags[name]
    return out


class LocationConfidenceType(IntEnum):
    """Not transmitted directly; it sets flag bits."""

    DIRECT_ON_SCENE = 0
    PROXIMATE_OFFSET = 1
    LANDMARK_POI = 2
    EXPLICIT_ADDRESS = 3


class GpsAccuracy(IntEnum):
    """3 bits."""

    NO_FIX = 0
    M5 = 1
    M10 = 2
    M25 = 3
    M50 = 4
    M100 = 5
    M500 = 6
    COARSE = 7

    @classmethod
    def from_meters(cls, m: float | None) -> GpsAccuracy:
        """Buckets the browser's `coords.accuracy` (meters). None or negative → NO_FIX."""
        if m is None or m < 0 or math.isnan(m):
            return cls.NO_FIX
        for limit, bucket in _GPS_BUCKETS:
            if m <= limit:
                return bucket
        return cls.COARSE

    @property
    def meters_max(self) -> int | None:
        """Upper bound of the bucket in meters (None for NO_FIX and COARSE)."""
        return {1: 5, 2: 10, 3: 25, 4: 50, 5: 100, 6: 500}.get(int(self))


_GPS_BUCKETS = [
    (5, GpsAccuracy.M5), (10, GpsAccuracy.M10), (25, GpsAccuracy.M25),
    (50, GpsAccuracy.M50), (100, GpsAccuracy.M100), (500, GpsAccuracy.M500),
]


# --- Pydantic models -------------------------------------------------------------


def _clamp_count(v: Any) -> int:
    return max(0, min(15, int(v)))


def _to_flags(v: Any) -> MedicalFlags:
    if isinstance(v, (list, tuple)):
        return medical_from_names(list(v))
    return MedicalFlags(int(v) & 0xFFFF)


# Counts clamp to 0-15 rather than raising (§2).
HeadCount = Annotated[int, BeforeValidator(_clamp_count)]
# Pydantic's enum validation rejects composite IntFlag values, so validate/serialize by hand.
FlagsField = Annotated[MedicalFlags, BeforeValidator(_to_flags), PlainSerializer(int, return_type=int)]


class TriageSlotResult(BaseModel):
    priority: TriagePriority
    hazard: HazardClass = HazardClass.NONE
    rescue_status: RescueStatus = RescueStatus.UNKNOWN
    adult_count: HeadCount = 1
    pediatric_count: HeadCount = 0
    medical_flags: FlagsField
    is_third_party_report: bool
    location_type: LocationConfidenceType
    extracted_location_text: str | None = None
    confidence: float
    raw_text: str | None = None
    extraction_latency_ms: float | None = None

    def summary(self) -> str:
        """The confirmation line, e.g. `Red · FLOOD · Trapped · 2 adults + 1 child · INSULIN`."""
        return summary_line(self.priority, self.hazard, self.rescue_status,
                            self.adult_count, self.pediatric_count, self.medical_flags)


class EmergencyPacket(BaseModel):
    slots: TriageSlotResult
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    gps_accuracy: GpsAccuracy = GpsAccuracy.NO_FIX
    timestamp: int = Field(default_factory=lambda: int(time.time()))
    device_id: int = Field(default=0, ge=0, le=65535)
    seq: int = Field(default=0, ge=0, le=255)


def summary_line(priority: int, hazard: int, status: int, adults: int, children: int, flags: int) -> str:
    def people(n: int, one: str, many: str) -> str:
        return f"{n} {one if n == 1 else many}"

    who = people(adults, "adult", "adults")
    if children:
        who += " + " + people(children, "child", "children")
    parts = [TriagePriority(priority).color, HazardClass(hazard).name, RescueStatus(status).label, who]
    meds = medical_names(flags)
    if meds:
        parts.append(", ".join(meds))
    return " · ".join(parts)
