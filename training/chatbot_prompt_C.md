You are helping build training data for a disaster-triage classifier. The classifier runs offline on a survivor's phone and reads distress messages people type during floods, fires, earthquakes, storms and other disasters, when cell service is down. It must decide how urgent each message is, so the training data has to look like what real, scared people actually type, and every label has to be exactly right.

This batch fills specific gaps in the existing data. Write **60 messages in one reply**.

## What this batch needs

1. **30 messages where the victims' situation is `Unknown`.** The message gives the danger and how urgent it is, but never reveals where the victims are or whether they can move or get out. For example: "please hurry my dad is having chest pains and his insulin ran out", "smoke everywhere cant see my son anymore", "something exploded at the plant, guys are burned bad". Don't mention being inside, outside, trapped, on a roof, in a car, at a shelter, or anything else that gives away location or mobility.
2. **At least 22 `Delayed` messages in total.** These are serious but stable: a broken bone with no heavy bleeding, an elderly person without medication for a day, stranded with water and food but no way out, a wound that has been bandaged, hypothermia risk hours away. This is the hardest category: make each one clearly not life-threatening right now, but clearly more than a minor inconvenience.
3. **At least 8 messages each implying `INSULIN`, `CARDIAC` and `BURNS`.** Vary how they're described: "sugar's dropping", "out of my pens", "type 1"; "chest feels crushed", "his pacemaker", "heart attack last year and now pain again"; "skin blistered from the steam", "chemical splashed on her arms", "hands burned pulling him out".

These overlap: a single message can be `Unknown`, `Delayed` and imply `CARDIAC`.

## Output format

Output only JSON Lines inside a single code block, one object per line, with no commentary before or after the block. Number the ids chatC_001 to chatC_060.

```
{"id": "chatC_001", "text": "...", "triage_priority": "Delayed", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Unknown", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["INSULIN"], "is_third_party": false, "style": "...", "language": "English", "writer": "chatbot"}
```

## Label definitions (use these exact values)

- **triage_priority**, how urgent the situation really is:
  - `Minor`: safe, or only minor injuries; needs supplies or information, not rescue
  - `Delayed`: serious but stable; injured or stranded but not about to die; rescue can wait hours
  - `Immediate`: life-threatening right now; severe bleeding, can't breathe, unconscious, or trapped with a rising danger (water, fire, gas, collapse)
  - `Deceased`: the victim is dead, or unresponsive with no signs of life
- **hazard_class**, the main environmental danger: `NONE`, `FLOOD`, `FIRE_SMOKE`, `STRUCTURAL_COLLAPSE`, `HAZMAT_GAS`, `ELECTRICAL_POWER`, `EXTREME_WEATHER`, `MEDICAL_CRISIS` (a medical emergency with no environmental hazard), `ACTIVE_VIOLENCE`, `TSUNAMI_SURGE`, `LANDSLIDE`, `HYPOTHERMIA_FREEZE`, `HEAT_STROKE`, `SINKHOLE_SUBSIDENCE`, `CONTAMINATED_WATER`, `OTHER`
- **rescue_status**:
  - `Sheltered`: inside a secure building, not trapped
  - `Exposed`: outdoors or exposed to the elements (on a roof, in water, in a car, on the street)
  - `Trapped`: can't get out (pinned, stuck in an attic, under rubble, cut off)
  - `Unknown`: the message does not reveal where the victims are or whether they can move
- **adult_count** / **pediatric_count**: the number of adults and children **at the scene of the emergency**, from 0 to 15: the people responders would find when they arrive, including anyone deceased. Include the writer if the writer is there. If no number is given, count the people the message mentions (a writer alone at the scene is 1 adult). Pets don't count.
- **medical_flags**: a list using only these values. Include a value only if the message clearly implies it, and include every one it implies. Use `[]` for none.
  - `INSULIN`: diabetic or needs insulin
  - `OXYGEN`: trouble breathing or oxygen-dependent
  - `BLEEDING`: heavy bleeding or a serious wound
  - `HYPOTHERMIA`: dangerously cold or soaked in cold water
  - `MOBILITY_IMPAIRED`: can't walk (wheelchair, broken leg, elderly and immobile, pinned)
  - `CARDIAC`: chest pain, heart attack, or heart condition
  - `PREGNANCY_INFANT`: pregnant, in labor, or a newborn or infant needs care
  - `BURNS`: burns
- **is_third_party**: `true` only when the writer is **not at the scene**, so the phone's location is not where help is needed (a relative who phoned them, an incident seen from blocks away). A writer at the scene reporting about someone next to them ("my husband is pinned", "found a man in the ditch") is `false`.
- **style**: a few words describing the writing style you used.
- **language**: `English`, `Spanish`, or `mixed English and Spanish`.

## Required mix across all 60 messages

- **Priority**: 18 Immediate, 22 Delayed, 12 Minor, 8 Deceased.
- **Status**: 30 Unknown, 10 Trapped, 10 Exposed, 10 Sheltered.
- **Hazard**: use at least 12 different categories; `MEDICAL_CRISIS` at most 12 times; no other category more than 6 times.
- **Length**: about 20 short (5–15 words), 30 medium (15–40 words), 10 long (40–80 words).
- **Language**: 46 English, 8 Spanish, 6 mixed English and Spanish.
- **Third party**: at least 15 third-party reports.

## Realism rules (be messier than feels natural)

- Real crisis texts are much messier than polished prose:
  - typos and autocorrect errors
  - missing punctuation, ALL CAPS, and SMS shorthand ("u", "ppl", "pls", "rn")
  - lowercase sentence starts, and run-ons
  - words dropped mid-sentence
- At least half the messages should have several typos or no punctuation at all.
- Never use the words "triage", "priority", "red", "yellow", "green" or "black", and never use the label names themselves.
- Never reuse an opening, phrase, name, street or scenario.
- Double-check each label against its message before writing the line, especially that every `Unknown` message truly gives no clue about location or mobility.
