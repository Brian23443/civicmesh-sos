You are helping build training data for a disaster-triage classifier. The classifier runs offline on a survivor's phone and reads distress messages people type during floods, fires, earthquakes, storms and other disasters, when cell service is down. It must decide how urgent each message is, so the training data has to look like what real, scared people actually type, and every label has to be exactly right.

This batch is about **length extremes**. Write **50 messages in one reply**:

- **25 very short messages (2–8 words).** These are what people send when they're panicking, injured, typing one-handed, or on a dying battery. For example: "attic water rising", "cant breathe smoke", "were ok", "mom not waking up". Many short messages leave out where the victims are or how many there are; label those `Unknown` and use the default counts described below.
- **25 very long messages (60–90 words; never more than 90).** These ramble: emotional, run-on, details out of order. The facts that decide urgency are buried in the middle or near the end, mixed with irrelevant detail (pets, belongings, the weather, what they were doing when it happened, apologies). Some long messages describe a serious emergency in rambling, calm language; others describe a minor situation at great, anxious length.

## Output format

Output only JSON Lines inside a single code block, one object per line, with no commentary before or after the block. Number the ids chatB_001 to chatB_050: the short messages are chatB_001–025 and the long ones chatB_026–050.

```
{"id": "chatB_001", "text": "...", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "style": "...", "language": "English", "writer": "chatbot"}
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

## Required mix across all 50 messages

- **Priority**: 18 Immediate, 12 Delayed, 13 Minor, 7 Deceased, split roughly evenly between the short and long groups.
- **Status**: at least 12 `Unknown` (mostly short messages), and the rest spread across Trapped, Exposed and Sheltered.
- **Hazard**: use at least 12 different hazard categories; no category more than 6 times.
- **Medical**: at least 4 messages each implying `INSULIN`, `CARDIAC` and `BURNS`.
- **Language**: 40 English, 5 Spanish, 5 mixed English and Spanish.
- **Third party**: at least 10 third-party reports.

## Realism rules (be messier than feels natural)

- Real crisis texts are much messier than polished prose:
  - typos and autocorrect errors ("ceiling" → "sealing", "can't" → "cant")
  - missing punctuation, ALL CAPS, doubled letters, and SMS shorthand ("u", "ppl", "pls", "rn", "idk")
  - lowercase sentence starts, and words dropped mid-sentence
- At least half the messages should have several typos or no punctuation at all.
- Never use the words "triage", "priority", "red", "yellow", "green" or "black", and never use the label names themselves.
- Never reuse an opening, phrase, name, street or scenario.
- Count the words in every message. Short means 2–8 words; long means 60–90 words.
- Double-check each label against its message before writing the line. If a short message is too vague to support a label, make it slightly clearer rather than guess.
