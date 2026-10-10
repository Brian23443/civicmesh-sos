You are helping build training data for a disaster-triage classifier. The classifier runs offline on a survivor's phone and reads short distress messages people type during floods, fires, earthquakes, storms and other disasters, when cell service is down. It must decide how urgent each message is, so the training data has to look like what real, scared, hurried people actually type, and every label has to be exactly right.

Write **200 distress messages**, each with labels. Send them in **4 replies of 50**. After each reply, stop and wait for me to say "continue".

## Output format

Output only JSON Lines inside a single code block, one object per line, with no commentary before or after the block:

```
{"id": "chatA_001", "text": "...", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["INSULIN"], "is_third_party": false, "style": "panicked, ALL CAPS, typos", "language": "English", "writer": "chatbot"}
```

Number the ids chatA_001 to chatA_200 in order across all four replies.

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

## Required mix across all 200 messages

Keep a running tally so the full set hits these numbers:

- **Priority**: 70 Immediate, 50 Delayed, 55 Minor, 25 Deceased.
- **Hazard**: every category from FLOOD to CONTAMINATED_WATER at least 6 times, NONE at least 10 times, OTHER at least 3 times. FLOOD and FIRE_SMOKE at most 25 each.
- **Status**: about 60 Trapped, 50 Exposed, 60 Sheltered, 30 Unknown.
- **Language**: 170 English, 15 Spanish, 15 mixed English and Spanish.
- **Length**: about 70 short (5–15 words), 90 medium (15–40 words), 40 long (40–80 words).
- **Medical**: about 90 messages with no medical flags, 80 with one, 30 with two or more. Every flag should appear at least 10 times.
- **Third party**: at least 40 third-party reports where the writer is not at the scene (relatives who phoned them, incidents seen from down the street), including about 15 of the Deceased messages.

## Hard cases (these matter most)

Include at least this many of each:

- **25 negations or false alarms**: hazard words that are not an emergency. For example: "water is in the yard but we're NOT trapped and nobody is hurt", "smelled smoke, it was the neighbor's grill, all good". These are usually Minor.
- **15 downplayed emergencies**: calm or apologetic wording for a truly Immediate situation. For example: "sorry to bother, my husband's leg is pinned under the beam and he's gone quiet".
- **15 dramatic non-emergencies**: panicked wording for a Minor situation.
- **10 resolved situations**: the message describes something that already happened and is now over, plus the current state ("was trapped but neighbors got us out, everyone ok now").
- **10 urgency without keywords**: life-threatening but never using words like "help", "emergency", "urgent" or "trapped". For example: "water at my chin in the attic cant open the vent".
- **10 messages with irrelevant detail**: pets, belongings or weather mixed in with the important facts.
- **10 messages that give a street address, intersection or landmark.**

## Realism rules

- Write the way people actually type on a phone in a crisis:
  - typos and autocorrect errors
  - missing punctuation, ALL CAPS, and SMS shorthand ("u", "ppl", "pls", "rn")
  - run-on sentences, and fragments
  - details out of order
- Vary the writers: teenagers, elderly people, parents, non-native speakers, exhausted people who have been waiting for hours, calm professionals.
- Never use the words "triage", "priority", "red", "yellow", "green" or "black", and never use the label names themselves (for example "immediate", "delayed").
- Never reuse an opening, phrase, name, street or scenario. Every message should feel like a different person in a different place.
- Double-check each label against its message before writing the line. Better a slightly less dramatic message than a wrong label.

Start with messages chatA_001 to chatA_050.
