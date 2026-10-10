"""Writes the JS parity fixtures for Track 4 (contract K5).

    tests/fixtures/packer_vectors.json     both §3 vectors + round-trip points + GPS buckets
    tests/fixtures/parity_sentences.jsonl  50 sentences with Python resolver outputs and,
                                           once the embedder is exported, Stage 1 results

    python3 -m stage1.make_fixtures              # resolvers + Stage 1 (INT8 ONNX and PyTorch)
    python3 -m stage1.make_fixtures --no-model   # resolvers only

The sentences are written for parity testing and never come from Appendix A
(checked against the test set on every run).
"""

from __future__ import annotations

import argparse
import difflib
import json
from pathlib import Path

from src.models.resolvers import resolve_headcount, resolve_location, resolve_medical, resolve_status
from training.common import load_benchmark

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"
MODEL_DIR = ROOT / "web" / "public" / "model"

SENTENCES = [
    # headcount variety
    "4 ppl stuck on the overpass ramp, car battery dead",
    "me and my 2 kids are hiding in the closet, wind is insane",
    "two adults and a toddler in the pickup, road is gone",
    "3 of us on the second floor, the stairs washed away",
    "somos cuatro personas en el techo, el agua sigue subiendo",
    "dos personas y un niño atrapados en el carro",
    "just me here, the porch fell on my leg and it's pinned",
    "my 8yr old son and me in the bathtub, roof is shaking",
    "12 workers on the scaffold, the crane tipped over",
    "a couple of people under the awning, hail the size of golf balls",
    "both of us soaked and freezing, shivering bad",
    "twins in the back seat and I can't open the doors",
    "6 of us at the cabin including 2 babies, out of formula",
    "my sister and I are fine but the garage is on fire",
    "40 passengers on a stranded bus, driver unconscious",
    # medical variety
    "sugar's crashing and he's shaky, no insulin left",
    "my dad cant breath, his inhaler is gone and there's smoke",
    "gash on her forehead, blood everywhere, she's dizzy",
    "kid is shivering and his lips are turning blue",
    "grandpa uses a wheelchair and the elevator is out",
    "chest pains for an hour, he had a heart attack last year",
    "wife is pregnant, contractions are 5 minutes apart",
    "steam pipe burst, he got scalded and has blisters on his arms",
    "tiene quemaduras en las manos y está sangrando",
    "mi esposa está embarazada y no puedo respirar bien",
    "mi papá es diabético y se le acabó la insulina",
    "dolor de pecho fuerte, tiene un marcapasos",
    # negation / exclusions / minor
    "we are not bleeding, nobody hurt, just no power",
    "got a sunburn waiting in line at the shelter, otherwise ok",
    "lit a burn barrel to stay warm, everyone fine",
    "everyone fine here, no injuries, need drinking water tomorrow",
    "no one is trapped, the water stopped at the curb",
    # location variety
    "help at 742 Evergreen Terrace, old man collapsed",
    "my aunt called, she's at 18 Cedar Hill Rd. and can't get up",
    "grandma fell at 9 Birch Ln, she lives alone",
    "smoke pouring out behind the Costco on the frontage road",
    "roof gone at the middle school gym, kids inside",
    "flooding down the street from the library, cars floating",
    "fire 4 blocks north of here, ash falling on us",
    "a tree fell on a car nearby, someone is inside",
    "crash across the street, the driver isn't moving",
    "21 Pine Ct, 3 blocks north of the hospital, gas smell",
    "3 people on the way to the shelter, water knee deep",
    "stuck on the 2nd floor of the parking garage",
    # mixed language / typos / shouting
    "AYUDA water in the house my abuela cant walk",
    "PLEASE HURRY MY HUSBAND IS PINNED UNDER THE BEAM",
    "pls send someone asap 5 ppl here 1 is bleeding rn",
    "neighbor found unresponsive in the yard, no pulse, cold",
    "landslide hit the back of the house two miles away from town",
    "the hospital generator failed, oxygen patients on battery",
]


def packer_vectors() -> dict:
    common = {"lat": 30.2672, "lon": -97.7431, "timestamp": 1760000000}
    return {
        "vectors": [
            {"name": "vector 1", "hex": "861200012B0BF3BA7E6A68E77800BEEF0050",
             "fields": {"priority": 2, "hazard": 1, "status": 2, "adults": 2, "children": 1, "medical": 1,
                        "third_party": False, "location_type": 0, **common, "device_id": 0xBEEF, "seq": 0,
                        "gps_accuracy": 2}},
            {"name": "vector 2 (third-party + address, flags 0x1900)", "hex": "9E0119002B0BF3BA7E6A68E7780000000040",
             "fields": {"priority": 2, "hazard": 7, "status": 2, "adults": 1, "children": 0, "medical": 0,
                        "third_party": True, "location_type": 3, **common, "device_id": 0, "seq": 0,
                        "gps_accuracy": 0}},
        ],
        "round_trip_points": [[90, 180], [-90, -180], [0, 0], [-33.8688, 151.2093], [64.1466, -21.9426]],
        "round_trip_tolerance": {"lat": 1.1e-5, "lon": 2.2e-5},
        "gps_buckets": [[None, 0], [3.2, 1], [10, 2], [480, 6], [2000, 7]],
    }


def check_not_from_test_set() -> None:
    test_set = [r["text"].lower() for r in load_benchmark()]
    for s in SENTENCES:
        best = max(difflib.SequenceMatcher(None, s.lower(), t).ratio() for t in test_set)
        if best >= 0.55:
            raise SystemExit(f"parity sentence too close to a test-set message ({best:.2f}): {s!r}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-model", action="store_true", help="resolver outputs only")
    args = parser.parse_args()
    assert len(SENTENCES) == 50, len(SENTENCES)
    check_not_from_test_set()

    rows = []
    for text in SENTENCES:
        adults, children = resolve_headcount(text)
        loc_type, loc_text, loc_flags = resolve_location(text)
        rows.append({"text": text, "headcount": [adults, children], "medical_mask": int(resolve_medical(text)),
                     "location": {"type": loc_type.name, "text": loc_text, "flags": int(loc_flags)},
                     "status_keyword": (lambda st: None if st is None else st.name)(resolve_status(text))})

    if not args.no_model and (MODEL_DIR / "embedder.onnx.gz").exists():
        from src.models.prototype_classifier import PrototypeClassifier, onnx_embed_fn  # noqa: PLC0415

        int8 = PrototypeClassifier(MODEL_DIR, embed_fn=onnx_embed_fn(MODEL_DIR))
        torch_ref = PrototypeClassifier(MODEL_DIR)
        from transformers import AutoTokenizer  # noqa: PLC0415

        tok = AutoTokenizer.from_pretrained(str(MODEL_DIR))
        for row, r8, rt in zip(rows, int8.classify_many(SENTENCES), torch_ref.classify_many(SENTENCES)):
            row["input_ids"] = tok(row["text"], truncation=True, max_length=128)["input_ids"]
            row["stage1"] = {k: r8[k] for k in ("priority", "hazard", "status", "scores")}
            row["stage1_summary"] = int8.to_slots(row["text"], r8).summary()  # model + every resolver
            row["stage1_pytorch"] = {k: rt[k] for k in ("priority", "hazard", "status")}
        print("added Stage 1 results (INT8 ONNX, with PyTorch for reference) and token ids")

    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "packer_vectors.json").write_text(json.dumps(packer_vectors(), indent=2) + "\n")
    with (FIXTURES / "parity_sentences.jsonl").open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"wrote {FIXTURES / 'packer_vectors.json'} and {FIXTURES / 'parity_sentences.jsonl'} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
