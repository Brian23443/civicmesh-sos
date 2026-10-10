"""Builds Stage 1 class prototypes (MASTER_PROMPT §5.0) → web/public/model/prototypes.json.

Each prototype is the mean of the normalised embeddings of its example sentences,
re-normalised to unit length (contract K4), so cosine similarity = dot product.
The example sentences are copied verbatim from §5.0 (typos included).

    python3 -m stage1.build_prototypes
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from torch import nn

from src.models.embedder import BASE_MODEL, TextEmbedder

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "web" / "public" / "model" / "prototypes.json"

# §5.0, verbatim. Keys are in §2 enum order. No OTHER hazard, no UNKNOWN status.
PRIORITY_EXAMPLES = {
    "MINOR": [
        "Minor cuts, safe from danger, walking wounded, house intact, requesting drinking water or power update.",
        "We are safe and uninjured, plenty of food, no emergency medical need.",
    ],
    "DELAYED": [
        "Serious injury, broken bones, dislocated shoulder, non-ambulatory, but stable in safe shelter.",
        "Road washed out, bridge collapsed, stranded but safe inside with food, non-critical medical condition.",
    ],
    "IMMEDIATE": [
        "Critical life-threatening emergency! Active arterial bleeding, cannot breath, trapped in rising flood "
        "water or fire.",
        "Trapped in collapsing building or attic with water rising. Unconscious victim, severe trauma, urgent "
        "rescue needed!",
    ],
    "DECEASED": [
        "Victim unresponsive, no pulse, cold and stiff, deceased body found under rubble.",
        "Fatal head trauma, no sign of life, victim has died.",
    ],
}

HAZARD_EXAMPLES = {
    "NONE": ["no hazard, clear area, normal safe conditions"],
    "FLOOD": ["rising flood water, submerged, drowning, river overflow, boat rescue"],
    "FIRE_SMOKE": ["active fire, thick black smoke, flames burning, wildfire surrounding"],
    "STRUCTURAL_COLLAPSE": ["building collapsed, rubble, trapped under concrete slab or beam"],
    "HAZMAT_GAS": ["strong gas leak smell, toxic chemical fumes, chlorine leak, vomiting"],
    "ELECTRICAL_POWER": ["sparking power line, downed high voltage line, transformer exploded"],
    "EXTREME_WEATHER": ["tornado, hurricane wind, hail broke roof, severe storm damage"],
    "MEDICAL_CRISIS": ["severe medical emergency, diabetic shock, arterial bleeding, heart attack"],
    "ACTIVE_VIOLENCE": ["active shooter, gunfire, barricaded in room, hostile threat"],
    "TSUNAMI_SURGE": ["tsunami warning, ocean receding, storm surge wave approaching"],
    "LANDSLIDE": ["mudslide, landslide swept house, buried in mud debris"],
    "HYPOTHERMIA_FREEZE": ["freezing blizzard, subzero cold, severe hypothermia, blue lips"],
    "HEAT_STROKE": ["extreme heat wave, no air conditioning, overheating, heat stroke, confused and not sweating"],
    "SINKHOLE_SUBSIDENCE": ["sinkhole opened up, ground collapsing under the road or house, earth giving way"],
    "CONTAMINATED_WATER": ["water main broke, tap water contaminated, no clean drinking water"],
}

STATUS_EXAMPLES = {
    "SHELTERED": ["safe inside house, dry shelter, protected in basement or hall"],
    "EXPOSED": ["outdoors in storm, stranded on roof, in water, exposed to elements"],
    "TRAPPED": ["trapped inside, pinned under rubble, attic door stuck, cannot escape"],
}

FIELDS = {"priority": PRIORITY_EXAMPLES, "hazard": HAZARD_EXAMPLES, "status": STATUS_EXAMPLES}


def build(embedder: TextEmbedder) -> dict:
    out: dict = {"dim": None, "base_model": embedder.base_model}
    for field, classes in FIELDS.items():
        out[field] = {}
        for name, sentences in classes.items():
            proto = embedder.embed(sentences).mean(dim=0)
            proto = nn.functional.normalize(proto, p=2, dim=0)
            out[field][name] = [round(float(x), 7) for x in proto]
            out["dim"] = len(proto)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-model", default=BASE_MODEL)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    protos = build(TextEmbedder(args.base_model))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(protos))
    counts = {f: len(protos[f]) for f in FIELDS}
    print(f"wrote {args.out} (dim {protos['dim']}, classes {counts}, {args.out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
