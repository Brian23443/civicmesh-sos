"""Resolver tests (MASTER_PROMPT §5.4).

Every sentence here was written for these tests. None comes from Appendix A
(data/benchmark_dataset.jsonl) — test_no_sentence_copies_the_test_set enforces it.
"""

import difflib

import pytest

from src.models.resolvers import resolve_headcount, resolve_location, resolve_medical
from src.schema import LocationConfidenceType as L
from src.schema import MedicalFlags as M
from src.schema import medical_names
from training.common import load_benchmark

# --- headcount -------------------------------------------------------------------

HEADCOUNT_CASES = [
    # the cases §5.4 names
    ("4 ppl stuck on the overpass ramp", (4, 0)),
    ("1 kid with me, we're cold", (1, 1)),
    ("ayuda, mi bebé tiene fiebre", (1, 1)),
    ("me and my 2 kids are in the closet", (1, 2)),
    ("3 of us hiding in the pantry", (3, 0)),
    ("two adults and a toddler in the truck", (2, 1)),
    # number words / digits / Spanish
    ("seven people waiting on the porch", (7, 0)),
    ("12 workers on the scaffold", (12, 0)),
    ("tres adultos en el techo", (3, 0)),
    ("somos cuatro personas", (4, 0)),
    ("dos personas y un niño atrapados", (1, 1)),
    ("a couple of people under the awning", (2, 0)),
    ("both of us are soaked", (2, 0)),
    ("twins in the back seat, I'm driving", (1, 2)),
    # generic count minus children
    ("5 people including 2 kids", (3, 2)),
    ("six of us, one is a baby", (5, 1)),
    # relations
    ("me and my husband on the balcony", (2, 0)),
    ("my sister and I can't get the door open", (2, 0)),
    # alone / default
    ("just me here, the stairs are gone", (1, 0)),
    ("I'm alone in the cellar", (1, 0)),
    ("water coming under the door", (1, 0)),
    # children without numbers, ages are not counts
    ("my daughter is with me", (1, 1)),
    ("my 8yr old son and me", (1, 1)),
    ("grabbed my 3 year old daughter", (1, 1)),
    # filler words, and no crossing a conjunction
    ("2 small kids and their grandma", (2, 2)),  # writer + grandma (§4 count rule)
    ("2 adults and toddler", (2, 1)),
    # no number given: count the people mentioned (§4), writer included unless relayed
    ("stuck in the basement with my mom", (2, 0)),
    ("roofing crew member fainted, the worker is not sweating", (2, 0)),
    ("the driver is slumped over the wheel", (2, 0)),
    ("my cousin texted me, her landlord is hurt", (1, 0)),
    ("mi abuela y mi tía están conmigo", (3, 0)),
    ("help us the water keeps rising", (2, 0)),
    ("we are hiding with the baby", (1, 1)),
    ("family of 5 waiting on the overpass", (5, 0)),
    ("two elderly sisters stuck in a sedan", (2, 0)),
    ("three guys burned by the blast", (3, 0)),
    # clamping
    ("40 passengers on the stranded bus", (15, 0)),
    ("20 children at the daycare", (1, 15)),
]


@pytest.mark.parametrize("text,expected", HEADCOUNT_CASES)
def test_headcount(text, expected):
    assert resolve_headcount(text) == expected


# --- medical ---------------------------------------------------------------------

MEDICAL_CASES = [
    ("sugar's crashing and he's shaky", {"INSULIN"}),
    ("she is type 1 and out of pens", {"INSULIN"}),
    ("mi papá es diabético", {"INSULIN"}),
    ("my dad cant breath, his inhaler is gone", {"OXYGEN"}),
    ("cannot breathe, smoke in the stairwell", {"OXYGEN"}),
    ("no puedo respirar", {"OXYGEN"}),
    ("gash on his arm, blood everywhere", {"BLEEDING"}),
    ("tourniquet on her thigh", {"BLEEDING"}),
    ("está sangrando mucho", {"BLEEDING"}),
    ("kid shivering and lips turning blue", {"HYPOTHERMIA"}),
    ("signs of hypothermia, been in the creek", {"HYPOTHERMIA"}),
    ("my grandpa is in a wheelchair", {"MOBILITY_IMPAIRED"}),
    ("leg pinned under the shelf", {"MOBILITY_IMPAIRED"}),
    ("broken hip, she can't walk", {"MOBILITY_IMPAIRED"}),
    ("chest pains for an hour", {"CARDIAC"}),
    ("he has a pacemaker", {"CARDIAC"}),
    ("dolor de pecho fuerte", {"CARDIAC"}),
    ("wife is pregnant, contractions 5 min apart", {"PREGNANCY_INFANT"}),
    ("newborn needs formula", {"PREGNANCY_INFANT"}),
    ("hands burned pulling him out", {"BURNS"}),
    ("steam scalded his back, blisters", {"BURNS"}),
    ("tiene quemaduras y está sangrando", {"BURNS", "BLEEDING"}),
    ("pregnant and diabetic, contractions started", {"PREGNANCY_INFANT", "INSULIN"}),
    # exclusions and negation
    ("got a sunburn at the shelter", set()),
    ("lit a burn barrel to stay warm", set()),
    ("we are not bleeding, nobody hurt", set()),
    ("not burned, just scared", set()),
    ("everyone fine, no injuries", set()),
]


@pytest.mark.parametrize("text,expected", MEDICAL_CASES)
def test_medical(text, expected):
    assert set(medical_names(resolve_medical(text))) == expected


def test_medical_only_sets_bits_0_to_7():
    every = " ".join(t for t, _ in MEDICAL_CASES)
    assert int(resolve_medical(every)) & ~0xFF == 0


# --- location --------------------------------------------------------------------

LOCATION_CASES = [
    ("help at 742 Evergreen Terrace", L.EXPLICIT_ADDRESS, "742 Evergreen Terrace"),
    ("my aunt lives at 18 Cedar Hill Rd.", L.EXPLICIT_ADDRESS, "18 Cedar Hill Rd"),
    ("grandpa fell at 9 Birch Ln", L.EXPLICIT_ADDRESS, "9 Birch Ln"),
    ("smoke behind the Costco", L.LANDMARK_POI, "Costco"),
    ("roof gone at the middle school gym", L.LANDMARK_POI, "middle school"),
    ("flooding down the street from the library", L.LANDMARK_POI, "library (down the street)"),
    ("fire 4 blocks north of here", L.PROXIMATE_OFFSET, "4 blocks north"),
    ("tree fell nearby", L.PROXIMATE_OFFSET, "nearby"),
    ("crash across the street", L.PROXIMATE_OFFSET, "across the street"),
    ("21 Pine Ct, 3 blocks north of the hospital", L.EXPLICIT_ADDRESS, "21 Pine Ct (3 blocks north)"),
    # not addresses
    ("3 people on the way", L.DIRECT_ON_SCENE, None),
    ("we are 2 adults at home", L.DIRECT_ON_SCENE, None),
    ("stuck on the 2nd floor", L.DIRECT_ON_SCENE, None),
]


@pytest.mark.parametrize("text,loc_type,loc_text", LOCATION_CASES)
def test_location(text, loc_type, loc_text):
    t, txt, flags = resolve_location(text)
    assert (t, txt) == (loc_type, loc_text)


@pytest.mark.parametrize("loc_type,flags", [
    (L.DIRECT_ON_SCENE, 0),
    (L.PROXIMATE_OFFSET, M.LOC_PROXIMATE | M.LOCATION_DISCREPANCY_ALERT),
    (L.LANDMARK_POI, M.LOC_LANDMARK | M.LOCATION_DISCREPANCY_ALERT),
    (L.EXPLICIT_ADDRESS, M.LOC_EXPLICIT_ADDRESS | M.LOCATION_DISCREPANCY_ALERT),
])
def test_location_flags(loc_type, flags):
    text = next(t for t, lt, _ in LOCATION_CASES if lt == loc_type)
    assert resolve_location(text)[2] == flags


# --- guard: these tests must not be fitted to the test set ----------------------------


def test_no_sentence_copies_the_test_set():
    ours = [t for t, _ in HEADCOUNT_CASES] + [t for t, _ in MEDICAL_CASES] + [t for t, _, _ in LOCATION_CASES]
    test_set = [r["text"].lower() for r in load_benchmark()]
    for sentence in ours:
        for msg in test_set:
            ratio = difflib.SequenceMatcher(None, sentence.lower(), msg).ratio()
            assert ratio < 0.55, f"{sentence!r} is too close to a test-set message ({ratio:.2f})"
