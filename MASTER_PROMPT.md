# CivicMesh-SOS — Master Build Prompt (build from scratch)

> **How to use:** give this entire document to the assistant at the start of the hackathon (attach the file or paste it). It is the complete specification. **No code or data exists yet.** Everything must be built from this document. Every number here is decided; do not substitute your own values. Items marked **OPEN** must be asked about or verified before relying on them.

---

## 0. Role, goal, and ground rules

You are my engineering partner for a 24-hour hackathon. We are building **CivicMesh-SOS**, an offline disaster-triage pipeline:

1. A survivor types a free-text distress message on a phone in **Airplane Mode**.
2. An **on-device encoder model** turns it into structured triage fields.
3. The phone shows a confirmation screen and the survivor taps Send.
4. The fields are bit-packed into an **18-byte frame**.
5. The frame goes over **local Wi-Fi** to a LoRa field node, then over **915 MHz LoRa** to a base station.
6. A laptop decodes it and drops a color-coded pin on an **offline map dashboard**.

Ground rules:

1. **Demo first, fine-tuning last.** Phase A builds a complete working demo with an untrained (zero-shot) model (§5.0). Fine-tuning (Phase B) starts only after the demo works end to end and is frozen. **Build in the order of §15.** Each step has a "done when" check. Don't move on until it passes.
2. **Never fit anything to the test set.** The 54 hand-labeled messages in Appendix A are the test set.
   - Never train on them.
   - Never tune thresholds on them.
   - Never add keyword rules containing phrases from them.

   Keyword overrides copied from test messages make accuracy look much better than it is. Don't add them.
3. **Report honestly.** For any evaluation, report Red recall and Red precision, per-field accuracy, and whole-summary accuracy (§9), not just overall accuracy.
4. **Stay on budget.** Model download ≤ **30 MB gzipped**. Inference ≤ **50 ms** per message on a phone. Data-generation API spend is about $2.
5. **Verify unverified APIs with a single call before any batch run** (§16).
6. **Write tests** for the frame packer (both test vectors in §3), the resolvers (§5.4) and the data importer.
7. The user runs macOS with zsh and Python 3.13, on an Apple Silicon Mac (PyTorch MPS is available).

---

## 1. Hardware

| Qty | Part | Role |
|---|---|---|
| 2 | **Heltec WiFi LoRa 32 V3**, 915 MHz version: ESP32-S3FN8 (240 MHz dual core), 8 MB flash, 512 KB SRAM, Semtech **SX1262** radio, 0.96" 128×64 **SSD1306** OLED | One **field node** and one **base station** |
| 2 | 915 MHz antennas (u.FL/IPEX) | **Always attach before transmitting**; transmitting without one can damage the SX1262 |
| 2 | USB-C **data** cables (not charge-only) | Programming the boards; the base station's serial link to the laptop |
| 1 | 5 V USB power bank (a 3.7 V LiPo on the board's JST 1.25 mm connector also works) | Powers the field node |
| 1 | iPhone or Android phone | Runs the PWA |
| 1 | Laptop | Runs the bridge and the dashboard, and powers the base station |

### Heltec V3 pin map

| Signal | GPIO |
|---|---|
| LoRa NSS (chip select) | 8 |
| LoRa SCK | 9 |
| LoRa MOSI | 10 |
| LoRa MISO | 11 |
| LoRa RST | 12 |
| LoRa BUSY | 13 |
| LoRa DIO1 | 14 |
| OLED SDA | 17 |
| OLED SCL | 18 |
| OLED RST | 21 (pulse LOW for 20 ms, then HIGH) |
| Vext (OLED power) | 36 — drive **LOW** to power the OLED |

OLED I²C address: 0x3C.

### Radio settings

These are identical on both boards. The boards won't hear each other if any setting differs.

- Configure the SX1262 with RadioLib using:
  - frequency 915.0 MHz
  - bandwidth 125 kHz
  - **spreading factor 7** (a single constant, so it can be changed in one place)
  - coding rate 4/5
  - private sync word 0x12
  - 14 dBm transmit power
  - 8-symbol preamble
  - **1.8 V TCXO**
  - 2-byte hardware CRC, enabled explicitly
- SPI uses the pins in the table above (SCK 9, MISO 11, MOSI 10, NSS 8). RadioLib's SX1262 module is constructed with NSS 8, DIO1 14, RST 12, BUSY 13.
- **Why SF7:** the demo range is at most a street block.
- **Time on air for 18 bytes:**

  | SF | Time on air |
  |---|---|
  | SF7 | 51 ms |
  | SF9 | 185 ms |
  | SF10 | 330 ms |
  | SF12 | 1,319 ms |

  Use SF9–10 only for longer range. Stay ≤ SF10, under the 400 ms US dwell limit.
- **Range check:** if the receiver's SNR stays above ~0 dB at the demo distance, SF7 is enough.

### Arduino toolchain

- Arduino IDE 2.x. On a Mac: **Arduino IDE → Settings… (⌘,) → Additional boards manager URLs**, add `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
- Boards Manager: install **"esp32 by Espressif Systems"** (not "Arduino ESP32 Boards"). Board: **Heltec WiFi LoRa 32(V3)**.
- Libraries:
  - **RadioLib** (Jan Gromes)
  - **ESP8266 and ESP32 OLED driver for SSD1306 displays** (ThingPulse)
- Uploading is flashing. No separate erase is needed. If the board misbehaves after replacing Meshtastic or the factory demo, set Tools → Erase All Flash Before Sketch Upload → Enabled.
- If an upload hangs at "Connecting…": hold PRG, tap RST, release PRG.
- If no serial port appears on macOS, try another cable, then install the Silicon Labs CP210x VCP driver.
- **Appendix B** describes the radio-link test to write first. Write it during the event and flash it to both boards before anything else.

---

## 2. Triage fields

Create `src/schema.py` with Python `IntEnum` / `IntFlag` and Pydantic v2 models. These exact names and values are used everywhere: Python, JS and C.

### TriagePriority (2 bits)

| Value | Name | Label string | Color | Meaning |
|---|---|---|---|---|
| 0 | MINOR | `Minor` | Green | Safe, or only minor injuries; walking wounded; needs supplies or information, not rescue |
| 1 | DELAYED | `Delayed` | Yellow | Serious but stable; injured or stranded but not in immediate danger of dying; rescue can wait hours |
| 2 | IMMEDIATE | `Immediate` | Red | Life-threatening right now: severe bleeding, can't breathe, unconscious, or trapped with a rising hazard (water, fire, gas, collapse) |
| 3 | DECEASED | `Deceased` | Black | Dead, or unresponsive with no signs of life |

### HazardClass (4 bits)

The label string is the enum name.

| Value | Name | Description (also used as the checker's option text) |
|---|---|---|
| 0 | NONE | no hazard mentioned |
| 1 | FLOOD | flooding, rising water, submerged roads or homes |
| 2 | FIRE_SMOKE | fire, flames, smoke, wildfire |
| 3 | STRUCTURAL_COLLAPSE | building, roof, wall, stairwell or bridge collapse; rubble |
| 4 | HAZMAT_GAS | gas leak, chemical spill, toxic fumes |
| 5 | ELECTRICAL_POWER | downed power lines, sparking, electrocution risk |
| 6 | EXTREME_WEATHER | tornado, hurricane winds, hail, severe storm |
| 7 | MEDICAL_CRISIS | a medical emergency is the main problem, with no environmental hazard |
| 8 | ACTIVE_VIOLENCE | shooter, assault, looting, hostile people |
| 9 | TSUNAMI_SURGE | tsunami, storm surge, ocean water coming inland |
| 10 | LANDSLIDE | landslide, mudslide, debris flow |
| 11 | HYPOTHERMIA_FREEZE | extreme cold, blizzard, freezing conditions |
| 12 | HEAT_STROKE | extreme heat, heat stroke, no cooling |
| 13 | SINKHOLE_SUBSIDENCE | sinkhole, ground giving way |
| 14 | CONTAMINATED_WATER | unsafe or contaminated drinking water, no clean water |
| 15 | OTHER | a hazard that fits none of the other categories |

### RescueStatus (2 bits)

| Value | Name | Label string | Meaning |
|---|---|---|---|
| 0 | SHELTERED | `Sheltered` | inside a secure building or shelter, not trapped |
| 1 | EXPOSED | `Exposed` | outdoors or exposed to the elements: on a roof, in water, in a car, on the street |
| 2 | TRAPPED | `Trapped` | cannot get out: pinned, stuck in an attic, under rubble, in a vehicle, cut off |
| 3 | UNKNOWN | `Unknown` | the message does not say where the victims are or whether they can move |

### Flags (16-bit `IntFlag`, `MedicalFlags`)

| Bit | Mask | Name | Meaning (bits 0–7 also used as the checker's question text: "Does the message indicate that …?") |
|---|---|---|---|
| 0 | 0x0001 | INSULIN | someone is diabetic or needs insulin |
| 1 | 0x0002 | OXYGEN | someone has trouble breathing or depends on oxygen |
| 2 | 0x0004 | BLEEDING | someone is bleeding heavily or has a serious wound |
| 3 | 0x0008 | HYPOTHERMIA | someone is dangerously cold, hypothermic, or soaked in cold water |
| 4 | 0x0010 | MOBILITY_IMPAIRED | someone cannot walk: wheelchair, broken leg or pelvis, elderly and immobile, pinned |
| 5 | 0x0020 | CARDIAC | someone has chest pain, a heart attack, or a heart condition flaring up |
| 6 | 0x0040 | PREGNANCY_INFANT | someone is pregnant or in labor, or a newborn or infant needs care |
| 7 | 0x0080 | BURNS | someone has burns |
| 8 | 0x0100 | THIRD_PARTY_REPORT | the writer is not at the scene (§4) |
| 9 | 0x0200 | LOC_PROXIMATE | incident is nearby ("a few blocks away") |
| 10 | 0x0400 | LOC_LANDMARK | a named landmark is mentioned |
| 11 | 0x0800 | LOC_EXPLICIT_ADDRESS | a street address is mentioned |
| 12 | 0x1000 | LOCATION_DISCREPANCY_ALERT | the phone's GPS is probably not the incident location |
| 13–15 | — | reserved | 0 |

### LocationConfidenceType (not transmitted directly; it sets flag bits)

| Value | Name |
|---|---|
| 0 | DIRECT_ON_SCENE |
| 1 | PROXIMATE_OFFSET |
| 2 | LANDMARK_POI |
| 3 | EXPLICIT_ADDRESS |

### GpsAccuracy (3 bits)

`GpsAccuracy.from_meters(m)` buckets the browser's `coords.accuracy`, in meters. `None` or a negative value → NO_FIX.

| Value | Name | Accuracy |
|---|---|---|
| 0 | NO_FIX | lat/lon are meaningless |
| 1 | M5 | ≤ 5 m |
| 2 | M10 | ≤ 10 m |
| 3 | M25 | ≤ 25 m |
| 4 | M50 | ≤ 50 m |
| 5 | M100 | ≤ 100 m |
| 6 | M500 | ≤ 500 m |
| 7 | COARSE | > 500 m |

### Models

**`TriageSlotResult`:**

| Field | Type / default |
|---|---|
| priority | TriagePriority |
| hazard | HazardClass, default NONE |
| rescue_status | RescueStatus, default UNKNOWN |
| adult_count | int, 0–15, clamped, default 1 |
| pediatric_count | int, 0–15, clamped, default 0 |
| medical_flags | MedicalFlags |
| is_third_party_report | bool |
| location_type | LocationConfidenceType |
| extracted_location_text | optional str |
| confidence | float |
| raw_text | optional str |
| extraction_latency_ms | optional float |

**`EmergencyPacket`:**

| Field | Type / default |
|---|---|
| slots | TriageSlotResult |
| latitude | float, −90 to 90 |
| longitude | float, −180 to 180 |
| gps_accuracy | GpsAccuracy, default NO_FIX |
| timestamp | int, default `int(time.time())` |
| device_id | int, 0–65535, default 0 |
| seq | int, 0–255, default 0 |

---

## 3. The 18-byte frame, format version 1 (`src/serialization/bit_packer.py`)

Big-endian. Exactly 18 bytes. **No application checksum:** the SX1262 hardware CRC protects the radio hop, and TCP protects the Wi-Fi hop. No CBOR wrapper.

| Byte(s) | Bits | Field | Encoding |
|---|---|---|---|
| 0x00 | 0–1 (LSB) | priority | TriagePriority |
| 0x00 | 2–5 | hazard | HazardClass |
| 0x00 | 6–7 | rescue_status | RescueStatus |
| 0x01 | 0–3 | adult_count | 0–15, clamped |
| 0x01 | 4–7 | pediatric_count | 0–15, clamped |
| 0x02–0x03 | 16 | flags | MedicalFlags, `>H` |
| 0x04–0x06 | 24 | latitude | signed int24 = `round(lat / 90 × (2²³−1))`, clamped to ±(2²³−1). ~1.2 m resolution. |
| 0x07–0x09 | 24 | longitude | signed int24 = `round(lon / 180 × (2²³−1))`. ~2.4 m at the equator. |
| 0x0A–0x0D | 32 | timestamp | uint32 POSIX seconds |
| 0x0E–0x0F | 16 | device_id | uint16, random per app install |
| 0x10 | 8 | seq | uint8 per-device counter, wraps at 255. `(device_id, seq)` deduplicates mesh repeats and retries. |
| 0x11 | 0–2 | spare | 0 |
| 0x11 | 3–5 | gps_accuracy | GpsAccuracy |
| 0x11 | 6–7 | version | **1**. The unpacker raises `ValueError` on any other version or on a length ≠ 18. |

**Packer rule for the flag bits:** start from `slots.medical_flags`, then:
- if `is_third_party_report`: add THIRD_PARTY_REPORT | LOCATION_DISCREPANCY_ALERT
- if location_type is PROXIMATE_OFFSET: add LOC_PROXIMATE | LOCATION_DISCREPANCY_ALERT
- if location_type is LANDMARK_POI: add LOC_LANDMARK | LOCATION_DISCREPANCY_ALERT
- if location_type is EXPLICIT_ADDRESS: add LOC_EXPLICIT_ADDRESS | LOCATION_DISCREPANCY_ALERT

The unpacker derives `is_third_party_report` from THIRD_PARTY_REPORT. It derives `location_type` from the LOC_* bits, with priority ADDRESS > LANDMARK > PROXIMATE.

**Coordinate math:** use **double precision** in C and JS. A float32 version is off by one unit (~2 m).

### Test vectors

Every implementation (Python, JS, C) must reproduce these exactly.

1. **Main vector.**
   - Fields:
     - priority = IMMEDIATE, hazard = FLOOD, status = TRAPPED
     - 2 adults, 1 child
     - flags = INSULIN
     - lat 30.2672, lon −97.7431
     - ts 1760000000, device 0xBEEF, seq 0
     - gps_accuracy = M10
   - Bytes: `861200012B0BF3BA7E6A68E77800BEEF0050`
2. **Third-party / address vector.**
   - Fields:
     - priority = IMMEDIATE, hazard = MEDICAL_CRISIS, status = TRAPPED
     - 1 adult, 0 children
     - medical_flags = none
     - is_third_party_report = true, location_type = EXPLICIT_ADDRESS (so flags become 0x1900)
     - same lat, lon and ts as vector 1
     - device 0, seq 0, gps NO_FIX
   - Bytes: `9E0119002B0BF3BA7E6A68E7780000000040`

### Required packer tests

- every frame is 18 bytes
- byte 0 and 1 bit positions are correct
- headcounts saturate at 15
- round-trip coordinates within 1.1e-5° (latitude) and 2.2e-5° (longitude) at (±90, ±180), (0, 0), (−33.8688, 151.2093) and (64.1466, −21.9426)
- the tail bytes (timestamp, device, seq, GPS bucket, version) land in the right places
- wrong version and wrong length are rejected
- GPS bucketing: None→0, 3.2→1, 10→2, 480→6, 2000→7
- both test vectors

---

## 4. Labeling rules (version 2) — use these everywhere

These rules apply to the generator prompt, the checker's questions, chatbot prompts and the test set.

- **Headcounts:** the number of people at the scene of the emergency, including the writer if the writer is there: the people responders would find on arrival, **including anyone deceased**.
  - Pets don't count.
  - If no number is given, count the people the message mentions. A writer alone at the scene is 1 adult.
- **Third-party (`is_third_party`):** true **only** when the writer is NOT at the scene, so the phone's location is not where help is needed (e.g. a relative who phoned them, an incident seen from blocks away).
  - A writer at the scene reporting about someone next to them is NOT a third party ("my husband is pinned", "found a man in the ditch").
- **Unknown status:** the message reveals nothing about where the victims are or whether they can move.
- **Row format for every dataset** (JSONL, one object per line):
  ```
  {"id": str, "text": str, "triage_priority": "Minor|Delayed|Immediate|Deceased", "hazard_class": "<HazardClass name>",
   "rescue_status": "Sheltered|Exposed|Trapped|Unknown", "adult_count": int, "pediatric_count": int,
   "medical_flags": [<subset of the 8 medical names>], "is_third_party": bool,
   "style": str, "language": "English|Spanish|mixed English and Spanish", "writer": str, "label_version": 2}
  ```
  The test set (Appendix A) also has `location_type` and sometimes `location_text`.

Put `LABEL_VERSION = 2` and the two rules above, as `COUNT_RULE` and `THIRD_PARTY_RULE` strings, in `training/common.py`. The generator prompt, the checker's questions and the chatbot prompts all use that same text.

---

## 5. The on-device model

### 5.0 Two stages: an untrained demo model first, fine-tuning last

**Stage 1 — demo model (built first, no training).**
- Use `BAAI/bge-small-en-v1.5` **zero-shot**, by prototype matching:
  1. Embed the message: masked mean pooling over the last hidden state, then L2-normalize.
  2. For each class, the prototype is the mean of the normalized embeddings of its example sentences (below).
  3. Per field, pick the class with the highest cosine similarity.
- Prototypes are precomputed once in Python (`stage1/build_prototypes.py` → `prototypes.json`, 384 floats per class, label order as in §2). The browser only embeds the message.
- **Priority, hazard and status** come from prototypes.
- **Status UNKNOWN:** predict it when the top status similarity minus the second is below `unknown_margin`. Tune `unknown_margin` on the chatbot rows (§8), **never on Appendix A**. Start at 0.02.
- **Medical flags:** the keyword resolver (§5.4) is the only source in Stage 1.
- **Third-party:** the website asks the user directly: "Are you at the emergency?" (§12). The location resolver pre-fills a suggestion.
- **Headcounts and location:** the resolvers (§5.4).
- **No prototype for OTHER.** The user can pick it on the confirmation screen.
- **Expected quality:** prototype matching tends to judge a message by its topic rather than its severity, and it ignores negation. Expect it to over-call Red. That is acceptable for a demo, because the survivor confirms or edits every field before sending. Measure it on Appendix A and the chatbot rows during the event.

**Stage 2 — fine-tuned classifier (§5.1–5.3, §6–9), built only after the demo works end to end (§15).**
- Swap it in only if it beats Stage 1 on **both** Appendix A and validation, on Red recall and whole-summary accuracy.

**Swappable model interface.** The website reads `model/model.json`:

| `kind` | Files | `classify(text)` returns |
|---|---|---|
| `"prototype"` (Stage 1) | `embedder.onnx.gz` + `prototypes.json` + `tokenizer.json` + thresholds | priority/hazard/status scores; medical = null; third_party = null |
| `"classifier"` (Stage 2) | `classifier.onnx.gz` + `tokenizer.json` + thresholds | the five head outputs |

`classify(text)` always returns `{priority, hazard, status, medicalProbs | null, thirdPartyProb | null, scores}`. The rest of the app never needs to know which stage is loaded.

**Stage 1 example sentences (verbatim).** These were written alongside the test set, so Stage 1's scores on Appendix A will be optimistic.

- **IMMEDIATE:**
  - "Critical life-threatening emergency! Active arterial bleeding, cannot breath, trapped in rising flood water or fire."
  - "Trapped in collapsing building or attic with water rising. Unconscious victim, severe trauma, urgent rescue needed!"
- **DELAYED:**
  - "Serious injury, broken bones, dislocated shoulder, non-ambulatory, but stable in safe shelter."
  - "Road washed out, bridge collapsed, stranded but safe inside with food, non-critical medical condition."
- **MINOR:**
  - "Minor cuts, safe from danger, walking wounded, house intact, requesting drinking water or power update."
  - "We are safe and uninjured, plenty of food, no emergency medical need."
- **DECEASED:**
  - "Victim unresponsive, no pulse, cold and stiff, deceased body found under rubble."
  - "Fatal head trauma, no sign of life, victim has died."
- **Hazards (one sentence each):**

  | Hazard | Sentence |
  |---|---|
  | NONE | "no hazard, clear area, normal safe conditions" |
  | FLOOD | "rising flood water, submerged, drowning, river overflow, boat rescue" |
  | FIRE_SMOKE | "active fire, thick black smoke, flames burning, wildfire surrounding" |
  | STRUCTURAL_COLLAPSE | "building collapsed, rubble, trapped under concrete slab or beam" |
  | HAZMAT_GAS | "strong gas leak smell, toxic chemical fumes, chlorine leak, vomiting" |
  | ELECTRICAL_POWER | "sparking power line, downed high voltage line, transformer exploded" |
  | EXTREME_WEATHER | "tornado, hurricane wind, hail broke roof, severe storm damage" |
  | MEDICAL_CRISIS | "severe medical emergency, diabetic shock, arterial bleeding, heart attack" |
  | ACTIVE_VIOLENCE | "active shooter, gunfire, barricaded in room, hostile threat" |
  | TSUNAMI_SURGE | "tsunami warning, ocean receding, storm surge wave approaching" |
  | LANDSLIDE | "mudslide, landslide swept house, buried in mud debris" |
  | HYPOTHERMIA_FREEZE | "freezing blizzard, subzero cold, severe hypothermia, blue lips" |
  | HEAT_STROKE | "extreme heat wave, no air conditioning, overheating, heat stroke, confused and not sweating" |
  | SINKHOLE_SUBSIDENCE | "sinkhole opened up, ground collapsing under the road or house, earth giving way" |
  | CONTAMINATED_WATER | "water main broke, tap water contaminated, no clean drinking water" |

- **Status:**

  | Status | Sentence |
  |---|---|
  | TRAPPED | "trapped inside, pinned under rubble, attic door stuck, cannot escape" |
  | EXPOSED | "outdoors in storm, stranded on roof, in water, exposed to elements" |
  | SHELTERED | "safe inside house, dry shelter, protected in basement or hall" |

Also build a Python reference (`src/models/prototype_classifier.py`, same interface as the Stage 2 extractor), so `evaluate_dataset.py` can score Stage 1 and the JS version can be parity-tested against it.

### 5.1 Base model (Stage 2 — fine-tuned classifier)

Decision rule: train **both** candidates on the same data. Ship the one with:
1. the higher **Red recall** on the 54-message test set, then
2. the higher **whole-summary accuracy**,

as long as it fits the 30 MB gzipped budget.

| Role | Hugging Face id | Size | Notes |
|---|---|---|---|
| **Primary** | `BAAI/bge-small-en-v1.5` | 33.4M params, 12 layers, 384 hidden | Strong small embedding model. Expect roughly 20–25 MB as gzipped INT8 ONNX (estimate from parameter count; measure it). |
| **Fallback** | `sentence-transformers/all-MiniLM-L6-v2` | 22.7M params, 6 layers, 384 hidden | Smaller and faster (half the layers). Use it if bge-small is too big or slow on the phone. |

**Out of scope:** generative small language models (too slow and too large for the phone budget, and they can emit malformed output) and models much larger than ~35M parameters (the size budget).

### 5.2 Stage 2 architecture (`src/models/triage_classifier.py`, class `TriageClassifier(nn.Module)`)

- **Encoder:** `AutoModel.from_pretrained(base_model)`.
- **Pooling:** masked **mean pooling** over the last hidden state.
- **Dropout:** 0.1.
- **Five linear heads** on the pooled vector:

  | Head | Outputs | Activation |
  |---|---|---|
  | priority | 4 | softmax |
  | hazard | 16 | softmax |
  | status | 4 | softmax |
  | medical | 8 | sigmoid; bit order = flag bits 0–7 |
  | third_party | 1 | sigmoid |

- `forward(input_ids, attention_mask)` returns a dict of logits per head.
- **Tokenization:** the base model's tokenizer, `truncation=True, max_length=128`. That is ~85–100 words of messy text, so training messages stay ≤ 90 words.

### 5.3 Stage 2 decoding (`FinetunedTriageExtractor(model_dir)`)

The extractor loads `config.json`, the tokenizer and `model.pt`.

- **Priority:** if P(IMMEDIATE) ≥ `red_threshold`, predict IMMEDIATE. Otherwise predict the argmax of the other three classes.
- **Hazard and status:** argmax.
- **Medical flag *i*:** on if sigmoid_i ≥ `medical_thresholds[i]`. Then **OR** the result with the medical keyword backstop (§5.4).
- **Third party:** sigmoid ≥ `third_party_threshold`, **from the model only**. If true, set THIRD_PARTY_REPORT | LOCATION_DISCREPANCY_ALERT.
- **Headcounts:** the headcount resolver (§5.4).
- **Location type and text:** the location resolver (§5.4). Its flags are OR'd in.
- Fill `extraction_latency_ms`.

### 5.4 Deterministic resolvers (`src/models/resolvers.py`, used by both stages)

Write these as **generic** patterns. **Do not copy phrases from Appendix A.** Test them with your own example sentences.

#### Headcount resolver → `(adults, children)`

**Number words:**
- digits 0–99
- English: one–twenty
- "a couple" = 2, "both of us" = 2, "twins" = 2 children
- Spanish: un/uno/una, dos, tres, cuatro, cinco, seis, siete, ocho, nueve, diez

**Nouns:**
- **Child nouns:** baby/babies, infant(s), newborn(s), toddler(s), kid(s), child/children, son(s), daughter(s), boy(s), girl(s), teen(s)/teenager(s); Spanish bebé/bebe(s), niño/niña(s), hijo/hija(s).
- **Adult or generic nouns:** adult(s), people, **ppl**, person(s), "of us", men, women, neighbors, workers, passengers, students, guests; Spanish personas, adultos.

**Rules:**
1. "N <child noun>" → children = N. A child noun without a number → children = 1.
2. "N <adult noun>" → adults = N. If the noun is generic ("people", "of us"…) and children were found and N > children, then adults = N − children.
3. "me and my <adult relation: wife/husband/mom/dad/sister/brother/partner/friend/grandma…>" → at least 2 adults. "me and my N kids" → 1 adult + N children.
4. "alone" / "just me" → 1 adult.
5. Default: 1 adult, 0 children.
6. Clamp both to 0–15.

Unit-test it, including "4 ppl", "1 kid", "mi bebé", "me and my 2 kids", "3 of us" and "two adults and a toddler".

#### Medical keyword backstop → MedicalFlags bits 0–7

Case-insensitive. Use word-boundary regex. Handle common typos ("cant breath").

| Flag | Keywords |
|---|---|
| INSULIN | insulin, diabetic, diabetes, blood sugar, "sugar is/sugar's", type 1, type 2; insulina, diabétic- |
| OXYGEN | can't/cant/cannot breathe/breath, trouble breathing, gasping, choking on smoke, oxygen, inhaler, asthma; no puedo respirar |
| BLEEDING | bleeding, blood everywhere, hemorrhag-, gash, deep cut, tourniquet; sangr- |
| HYPOTHERMIA | hypotherm-, freezing cold, shivering, frostbite, blue lips; hipotermia |
| MOBILITY_IMPAIRED | wheelchair, can't/cannot walk, broken leg/hip/pelvis, pinned, bedridden, paralyz-; silla de ruedas |
| CARDIAC | chest pain, heart attack, cardiac, pacemaker, heart condition; dolor de pecho, infarto |
| PREGNANCY_INFANT | pregnant, contractions, in labor, water broke, newborn, infant; embarazada |
| BURNS | burned, burns, burnt, scald-, blister-; quemad- — but not "burn barrel" or "sunburn" |

#### Location resolver → `(location_type, location_text, flags)`

1. **Explicit street address** (case-insensitive): a house number of 1–5 digits, then a street name of a few words, then a street-type word: Lane/Ln, Street/St, Road/Rd, Avenue/Ave, Boulevard/Blvd, Drive/Dr, Court/Ct, Way, Highway/Hwy, Terrace, Place/Pl. → EXPLICIT_ADDRESS, with the matched address as the location text.
2. **Landmark:** any of these words as whole words: walmart, target, costco, home depot, kroger, heb, safeway, walgreens, cvs, high school, middle school, elementary school, school, hospital, clinic, church, stadium, mall, library, city hall, airport, fire station, police station, bridge, overpass. → LANDMARK_POI, unless an address was already found.
3. **Offset:** any of these phrases: "a few blocks away", "down the street", "across the street", "nearby", "around the corner", "blocks north", "blocks south", "miles away". → PROXIMATE_OFFSET if nothing else was found; otherwise appended to the location text in parentheses.

---

## 6. Training data generation (`training/generate.py`)

All LLM calls go through **OpenRouter**: base URL `https://openrouter.ai/api/v1`, header `Authorization: Bearer $OPENROUTER_API_KEY`. Use `requests` with a `ThreadPoolExecutor`.

**Retries:** up to 5 attempts, with exponential backoff `min(30, 2^attempt + rand)`, on network errors and on HTTP 408, 429, 500, 502, 503, 524 and 529. Raise on any other 4xx.

### 6.1 Writers

| Role | Model | Share of batches |
|---|---|---|
| Main writer | `deepseek/deepseek-v4-flash-0731` | 65% |
| Second writer | `xiaomi/mimo-v2.6-flash` | 35% |

Both can be overridden with the env vars `WRITER_MAIN` and `WRITER_ALT`.

### 6.2 Method

**Labels are sampled first. Then a writer is asked to write a message conveying exactly those facts.** Every row is therefore labeled by construction.

**Request format:**
- 10 specs per request.
- `POST /chat/completions` with:
  - `temperature: 1.0`
  - `response_format: {"type": "json_object"}`
  - `reasoning: {"enabled": false}`
  - system = the prompt in §6.4
  - user = `"Specs:\n"` followed by one JSON spec per line
- Parse the reply after stripping any ``` fences. Join the texts back to specs by `id`.
- Drop empty texts and texts over 600 characters.

**Batch handling:**
- 30 workers.
- Append rows to `data/synthetic/raw.jsonl` as batches finish.
- **Resumable:** `--n` counts only rows whose `writer` is one of the two writer models.
- Show a tqdm bar with rows written and failed batches.

**Each written row:**
- `id = "syn_" + spec id` (a 10-hex uuid)
- the labels from the spec
- style, language, writer
- `label_version: 2`

### 6.3 Spec sampling (exact)

- **Priority:** Immediate 0.38, Delayed 0.25, Minor 0.27, Deceased 0.10.
- **Hazard:**

  | Hazard | Weight |
  |---|---|
  | NONE | .03 |
  | FLOOD | .16 |
  | FIRE_SMOKE | .12 |
  | STRUCTURAL_COLLAPSE | .11 |
  | HAZMAT_GAS | .06 |
  | ELECTRICAL_POWER | .05 |
  | EXTREME_WEATHER | .08 |
  | MEDICAL_CRISIS | .09 |
  | ACTIVE_VIOLENCE | .04 |
  | TSUNAMI_SURGE | .03 |
  | LANDSLIDE | .04 |
  | HYPOTHERMIA_FREEZE | .05 |
  | HEAT_STROKE | .04 |
  | SINKHOLE_SUBSIDENCE | .02 |
  | CONTAMINATED_WATER | .05 |
  | OTHER | .03 |

  If priority is Minor, set hazard = NONE with probability 0.25.
- **Status, depending on priority:**

  | Priority | Trapped | Exposed | Sheltered | Unknown |
  |---|---|---|---|---|
  | Immediate | .50 | .30 | .10 | .10 |
  | Delayed | .25 | .25 | .35 | .15 |
  | Minor | .03 | .12 | .70 | .15 |
  | Deceased | .40 | .30 | .10 | .20 |

- **Adults:** 0–8 with weights [3, 40, 25, 12, 8, 5, 3, 2, 2]. With probability 0.02, use a uniform 9–15 instead.
- **Children:** 0–4 with weights [60, 20, 12, 5, 3].
- **Number of medical flags, depending on priority:**

  | Priority | 0 flags | 1 flag | 2 flags |
  |---|---|---|---|
  | Immediate | .30 | .50 | .20 |
  | Delayed | .45 | .45 | .10 |
  | Minor | .90 | .10 | — |
  | Deceased | .80 | .20 | — |

- **Which medical flags:** for each flag to draw:
  - With probability 0.6, draw from the pool that fits the hazard:

    | Hazard | Pool |
    |---|---|
    | FIRE_SMOKE | BURNS, OXYGEN |
    | STRUCTURAL_COLLAPSE | BLEEDING, MOBILITY_IMPAIRED |
    | FLOOD | HYPOTHERMIA, INSULIN |
    | TSUNAMI_SURGE | HYPOTHERMIA, BLEEDING |
    | HYPOTHERMIA_FREEZE | HYPOTHERMIA |
    | HAZMAT_GAS | OXYGEN |
    | ELECTRICAL_POWER | BURNS, CARDIAC |
    | ACTIVE_VIOLENCE | BLEEDING |
    | HEAT_STROKE | CARDIAC |
    | LANDSLIDE | MOBILITY_IMPAIRED, BLEEDING |

  - Otherwise, draw from all 8.
  - No duplicates.
  - If there are children, add PREGNANCY_INFANT with probability 0.1.
- **Third-party:** probability 0.50 if Deceased, otherwise 0.18. **Forced true** when the style is the "relaying" style.
- **Headcount adjustments:**
  - If adults + children = 0, set adults = 1.
  - If not third-party and adults = 0, set adults = 1 (the writer is counted).
- **Language:** English .88, Spanish .06, mixed English and Spanish .06.
- **Length:** "5-15 words" .35, "15-40 words" .45, "40-80 words" .20.
- **Style:** uniform over these 16 strings:
  1. panicked text message, ALL CAPS, typos, no punctuation
  2. panicked text message with typos and autocorrect errors
  3. SMS shorthand (u, ppl, pls, rn, asap), lowercase
  4. calm, factual, complete sentences
  5. very short fragment, under 10 words
  6. rambling, run-on, emotional, details out of order
  7. elderly person, polite and formal, slightly confused
  8. teenager, casual slang
  9. exhausted and terse after hours of waiting
  10. someone relaying what they heard from a neighbor or family member on the phone
  11. mentions a street address, intersection, or landmark
  12. downplays the situation even though it is serious
  13. exaggerates and is dramatic even though it is minor
  14. includes irrelevant details (pets, belongings, the weather) mixed with the important ones
  15. uses negation, e.g. says what is NOT happening as well as what is
  16. describes something that already happened and is now over, plus the current situation
- **Spec JSON keys:** id, priority, hazard, status, adults, children, medical, third_party, style, language, length.

### 6.4 Writer system prompt (verbatim)

`{COUNT_RULE}` and `{THIRD_PARTY_RULE}` are replaced with the §4 text.

```
You write realistic emergency distress messages for training a disaster-triage classifier.
People type these on phones during floods, fires, earthquakes and storms, often scared, hurried, and misspelling things.

For each spec you get, write ONE message that conveys exactly the facts in the spec and nothing that contradicts it:
- priority: how urgent the situation really is. Convey it through the facts described, never with words like "red", "immediate", "priority", "triage".
- hazard: the main danger. NONE means no environmental hazard.
- status: Sheltered / Exposed / Trapped. If "Unknown", do NOT reveal where the victims are or whether they can move.
- adults / children: the exact number of adults and children at the scene: {COUNT_RULE} Imply counts naturally ("me and my 2 kids" = 1 adult, 2 children). 0 children means don't mention any children at the scene.
- medical: every listed need must be clearly implied; do not imply any need that isn't listed.
- third_party: {THIRD_PARTY_RULE} When false, the writer is at the scene and counted in adults.
- Follow the style, language and length exactly. Vary names, places and wording; never reuse phrasing across messages.

Return JSON: {"messages": [{"id": "<spec id>", "text": "<message>"}, ...]} with one entry per spec, in order.
```

**Target:** `python3 -m training.generate --n 5000 --workers 30`. Expected cost under ~$2. **First** run `--n 200` and read about 20 rows by hand.

---

## 7. Label checking (`training/verify.py`)

- **Checker model:** **TypeSafe Jev** `typesafe/jev-1.13`, a "decision" model. It returns calibrated probabilities instead of text, and output tokens are free.
- **Endpoint (OPEN — verify first):** `POST https://openrouter.ai/api/v1/systemone`.
  - TypeSafe's own docs describe `POST /v1/systemone` at `https://api.typesafe.ai`.
  - **Request body:**
    ```
    {"model": "typesafe/jev-1.13", "state": {"distress_message": "<text>"}, "questions": {<name>: <question>, ...}}
    ```
  - **Question types:**
    - `{"type": "choice", "instructions": str, "criteria": {option: description or null}}` — max 255 options
    - `{"type": "noul", "instructions": str, "criteria": {"true": str, "false": str}}` — the criteria are optional
    - `score` — not used here
  - **Response:** `{"model", "answers": {name: answer}, "usage": {"input_tokens", "output_tokens"}}`
    - choice answer: `{"type": "choice", "choice": option, "probabilities": {option: p}, "confidence": p}`
    - noul answer: `{"type": "noul", "noul": p}`
- **14 questions per message, in one request:**

  | Name | Type | Instructions | Criteria |
  |---|---|---|---|
  | priority | choice | "Using START/FEMA disaster triage, how urgent is the situation described in this distress message?" | `Minor`/`Delayed`/`Immediate`/`Deceased`, each described as "GREEN: …", "YELLOW: …", "RED: …", "BLACK: …" using the §2 meanings |
  | hazard | choice | "What is the main environmental hazard endangering the people in this message?" | the 16 hazard names, with the §2 descriptions |
  | status | choice | "What is the physical situation of the victims?" | the 4 status strings, with the §2 meanings |
  | adults | choice | "How many adults are at the scene? Count adults only, using this rule: {COUNT_RULE}" | options "0"…"15" (null descriptions, except "15": "15 or more") |
  | children | choice | "How many children or infants are at the scene of the emergency? 0 if none are mentioned." | options "0"…"15" |
  | third_party | noul | "Is the writer somewhere other than the scene of the emergency?" | true: "Third-party report: {THIRD_PARTY_RULE}"; false: "The writer is at the scene of the emergency" |
  | med_<FLAG> ×8 | noul | "Does the message indicate that <§2 flag meaning>?" | — |

- **Store** on each row: `jev_priority`[4], `jev_hazard`[16], `jev_status`[4] (probabilities in enum order), `jev_adults`, `jev_children` (argmax ints), `jev_third_party` (p) and `jev_medical`[8] (p).
- **Keep a row only if all of these hold:**
  - P(intended priority) ≥ **0.35**
  - P(intended hazard) ≥ **0.25**
  - P(intended status) ≥ **0.25**
  - every listed medical flag scores ≥ **0.40**
  - every unlisted medical flag scores ≤ **0.60**
  - third-party: reject if labeled true and p < **0.20**, or labeled false and p > **0.80**

  Store `keep` and `reject_reasons` on the row.
- **Rows without `label_version` ≥ 2** (old-rule chatbot data): before judging, save the old values under `legacy_labels`, then replace `adult_count`, `pediatric_count` and `is_third_party` with Jev's answers, and set `label_version` = 2.
- **Output:** append to `data/synthetic/scored.jsonl`. Resumable: skip ids already scored.
- **Report:**
  - kept / total, overall and per writer
  - a count of each rejection reason
  - the priority mix of kept rows
- **Modes:**
  - `--benchmark`: score Jev on Appendix A and print per-field accuracy, Red recall, medical F1 and the priority confusion matrix. Save to `artifacts/jev_benchmark.json`. **Run this first**, as a sanity check on the checker itself.
  - `--refilter`: re-apply the thresholds without any API calls.

---

## 8. Hand-made chatbot data (validation writer)

- The three prompts in **Appendix C** produce **310 rows**:
  - Prompt C1: 200 rows with quotas and hard cases. Ids `chatA_###`.
  - Prompt C2: 25 very short + 25 very long. Ids `chatB_###`.
  - Prompt C3: 60 gap-fillers — Unknown status, Yellow, insulin/cardiac/burns. Ids `chatC_###`.
- Use any capable chatbot, **a fresh chat for each prompt**. Save each reply to `data/chatA.txt`, `data/chatB.txt` and `data/chatC.txt`.
- **Importer** `training/import_chatbot.py files... --writer chatbot [--label-version 2]`:
  - Parse only lines starting with `{`, so code fences and prose are skipped.
  - Validate every label against the vocabularies: priority, hazard and status strings; counts 0–15 ints; medical flags as a list of the 8 names; `is_third_party` bool; language one of the 3 strings. Report invalid lines with `file:line`.
  - Prefix ids with `chat_<writer>_`. Skip duplicate ids.
  - Set `writer` and `label_version`. Sort and dedupe medical flags.
  - Append to `data/synthetic/raw.jsonl`.
- **Before importing, check the batch:**
  - the label mix vs the prompt's quotas
  - the word-count spread
  - near-duplicates (difflib ratio > 0.7)
  - **similarity to every test message** (flag anything with ratio > 0.55)
- **Watch for chatbot habits:** chatbots tend to drift from quotas, write text that is cleaner than real crisis messages, and hit length targets with suspiciously uniform word counts. Check the mix and the word-count spread before importing.

---

## 9. Fine-tuning (`training/train.py`)

**Data:**
- Training: kept rows from `scored.jsonl`.
- `--val-writer chatbot`: every chatbot row is excluded from training and used for validation instead. Validation picks the best epoch, tunes every threshold, and exposes overfitting to the training writers' style.
- Without `--val-writer`: a 10% md5-hash split.
- `--unverified [--writer X]`: train on `raw.jsonl` without the check. For quick experiments only.

**Soft targets** for priority, hazard, status, medical and third-party:
`target = 0.7 × one_hot(intended label) + 0.3 × Jev's probabilities` (normalized).
Rows without Jev scores use the hard label.

**Loss:**
- **Priority:** soft cross-entropy, `−Σ target · w · log_softmax`, with **class weights [Minor 1, Delayed 1, Immediate 2, Deceased 1]**. A missed Red costs double.
- **Hazard and status:** soft cross-entropy.
- **Medical (8) and third-party (1):** `binary_cross_entropy_with_logits` with **pos_weight = clamp((N − positives) / positives, 1, 4)**, computed per label from the training rows.
  - Why: without a weight, rare flags are never worth predicting, so the model learns to always say "no". An uncapped or very high weight swings the other way into constant false alarms. **A cap of 4 plus per-flag thresholds tuned on validation** balances the two.
- **Total loss = 2.0·priority + 1.0·hazard + 1.0·status + 1.0·medical + 0.5·third_party.**

**Optimizer and schedule:**
- AdamW, encoder lr **5e-5**, heads lr **1e-3** (20×), weight decay **0.01**
- linear schedule with **6% warmup**
- gradient clip **1.0**
- batch size **32**, shuffled
- **4 epochs** for ~5,000 rows; **15** for a few hundred rows
- device: MPS, then CUDA, then CPU
- seed 0

**Best epoch:** after each epoch, predict on validation and compute the score `mean(priority_acc, red_recall, hazard_acc, status_acc, medical_f1)`, all at threshold 0.5. Keep a CPU copy of the best epoch's weights and reload them at the end.

**Thresholds, all tuned on validation with the best weights:**
- `red_threshold`: the **highest** t in 0.05…0.50 (step 0.01) whose validation Red recall is ≥ **0.95**. If none reaches it, use 0.05.
- `medical_thresholds[i]` and `third_party_threshold`: the t in 0.10…0.90 (step 0.05) with the best validation F1. Ties go to the t closest to 0.5. Use 0.5 if validation has fewer than 3 positives.

**Output** `models/triage-<name>/`:
- `model.pt` (state dict)
- tokenizer files
- `config.json`:
  - `base_model`
  - `red_threshold`, `medical_thresholds`, `third_party_threshold`
  - `labels`
  - `train_rows`, `val_rows`, `best_epoch`
  - `hyperparams`
  - `val_metrics`, `test_metrics`

**Print at the end:**
- the validation metrics
- the **test metrics on Appendix A**, labeled "never trained on"

**Commands:**
- `python3 -m training.train --val-writer chatbot --base-model BAAI/bge-small-en-v1.5 --out models/triage-bge-small`
- `python3 -m training.train --val-writer chatbot --out models/triage-minilm` (default base: MiniLM-L6)

### Evaluation script (`benchmark/evaluate_dataset.py`)

`--data <json|jsonl> --models <keys or model dirs> [--writer X] [--examples 25]`

It writes `artifacts/eval_<data>_<model>.md` with:
- per-field accuracy: priority (with Red recall and precision), hazard, status, exact headcounts, exact medical set, third-party
- **whole-summary accuracy**: every field of the confirmation line right
- confusion matrices for priority and status
- per-flag recall and precision, with missed and false-alarm counts
- the top hazard confusions
- up to N example errors per field
- 15 summary-line examples

The summary format is `Red · FLOOD · Trapped · 2 adults + 1 child · INSULIN`.

---

## 10. Targets and how to measure them

- Measure every model (Stage 1 and Stage 2) with `evaluate_dataset.py` on **Appendix A** and on the **chatbot rows** (validation). Report both.
- **Red recall ≥ 95%** on Appendix A, with Red precision reported alongside.
- **Whole-summary accuracy** (every field of the confirmation line right) as high as possible. This is the number that best predicts how often a survivor won't need to edit anything.
- Remember the scale: Appendix A has 54 messages, so one message ≈ 1.9 points of accuracy and one Red ≈ 3.6 points of Red recall. Don't over-read small differences.

---

## 11. Export to the browser (`training/export_onnx.py`)

### 11.1 Stage 1: embedding model (needed for the demo)

1. Wrap `AutoModel("BAAI/bge-small-en-v1.5")` so `forward(input_ids, attention_mask)` returns the **mean-pooled, L2-normalized embedding** `[batch, 384]`, with pooling inside the graph.
2. Export to ONNX: opset ≥ 17, dynamic batch and sequence axes.
3. INT8 dynamic quantization with `onnxruntime.quantization.quantize_dynamic`, then `gzip -9`.
4. **Parity check** on the chatbot rows:
   - mean cosine(PyTorch embedding, INT8 embedding) ≥ 0.99
   - the decoded fields match on ≥ 98% of fields
5. **Check the quantization cost:** compare INT8 against PyTorch on the chatbot rows. If INT8 loses more than 3 points of Red recall, also try `per_channel=True`, or ship FP16. Report the size.
6. Output `web/public/model/`:
   - `embedder.onnx.gz`
   - `tokenizer.json`
   - `prototypes.json`
   - `model.json`: `{"kind": "prototype", "unknown_margin": …, "labels": {…}}`

### 11.2 Stage 2: classifier (fine-tuning phase only)

1. Wrap `TriageClassifier` so it returns 5 logit tensors, in order: priority, hazard, status, medical, third_party.
2. Export the same way: ONNX opset ≥ 17, dynamic axes, INT8 dynamic quantization, `gzip -9`.
3. **Parity:** decoded fields from INT8 must match PyTorch on ≥ 98% of fields over 200 validation rows. The gzipped size must be ≤ 30 MB.
4. Output `classifier.onnx.gz` and `model.json`: `{"kind": "classifier", "red_threshold", "medical_thresholds", "third_party_threshold", "labels"}`. Swapping models is just replacing the files in `web/public/model/`.

---

## 12. Survivor website (PWA) — `web/`

**This is a website, not a native app.** No App Store, Swift or Xcode. It is a Progressive Web App: a normal website that caches itself and the model with a service worker, so after **one online visit** it opens and runs in Airplane Mode. It works in iOS Safari and Android Chrome from one codebase.

- **Why not native:** we need iPhone and Android in 24 hours, and a judge can't easily install a native app.
- **Why not serve it from the field node:** the model (~15–25 MB) doesn't fit in the ESP32's 8 MB flash.
- **For the demo:** use it in a normal browser tab. Open the site once while online, then switch to Airplane Mode. Home-screen installation is optional; it only matters for real-world use, against iOS storage eviction (`navigator.storage.persist()` + an "Add to Home Screen" hint).
- **Hosting:** deploy to any static HTTPS host (GitHub Pages, Netlify or Vercel). Service workers require HTTPS, except on localhost.

### 12.1 Stack

- **Vite + React + TypeScript + Tailwind CSS.** Icons from `lucide-react`. Fonts bundled locally (e.g. Inter); **no runtime CDN requests of any kind**.
- **Offline:** `vite-plugin-pwa` (Workbox), precaching the app and everything in `public/model/`. Raise `maximumFileSizeToCacheInBytes` to 40 MB.
- **Inference:** `onnxruntime-web`, WASM backend.
  - Serve the `.wasm` files locally and set `ort.env.wasm.wasmPaths`.
  - `numThreads = 1` for iOS safety.
  - Use WebGPU only if available and tested.
  - Decompress the model with `DecompressionStream('gzip')`.
- **Tokenizer:** `@huggingface/transformers` (transformers.js) `AutoTokenizer`, loading the local `tokenizer.json` with `env.allowRemoteModels = false`.
  - **OPEN:** verify this loads fully offline on iOS Safari.
  - Fallback: implement BERT WordPiece directly from `tokenizer.json` (lowercase, basic punctuation split, greedy longest-match with `##` continuation pieces, `[CLS]`/`[SEP]`, max 128).
- **Port to `src/lib/`:**
  - the §5.0 / §5.3 decoding
  - the §5.4 resolvers
  - the §3 packer (double precision)
- **Tests (Vitest):**
  - the JS packer reproduces both §3 test vectors
  - the JS resolvers and decoding match the Python reference on 50 sentences

### 12.2 Design process

1. **Before writing any UI,** browse **Dribbble** (dribbble.com) for references. Searches: "emergency app", "SOS app", "disaster relief app", "crisis report mobile", "medical emergency app", "safety app onboarding".
2. Pick **3–5 shots** and record them in `design/REFERENCES.md`: link, a screenshot or description, and **what to borrow** (layout, color, typography, card style, component patterns).
3. Write a short design-token section there too: colors, radii, spacing, type scale. Then build to it.

**Design direction:**
- Calm and trustworthy under stress, not alarming.
- Mobile-first and one-handed: tap targets ≥ 48 px, body text ≥ 17 px, high contrast. Works at 320 px wide.
- **Dark theme by default** (night use, OLED battery), plus a light theme.
- **Triage colors are reserved for triage only:** Red, Yellow, Green, and Black (shown as near-black with an outline in dark mode). Never use red for generic errors or buttons.
- Clear status at all times: "Ready offline ✓", GPS state, model state.
- Respect `prefers-reduced-motion`. Every control has an aria label.

### 12.3 Screens and flow

**1. First visit / loading**
- "Preparing emergency mode…" with a progress bar for the model download (~15–25 MB).
- Then **"Ready offline ✓ — you can now use this in Airplane Mode."**
- If the model fails to load: **manual mode**, where the survivor picks every field by hand. The app must always be able to send a report.

**2. Report (home)**
- Status pills: offline-ready, GPS (with ± accuracy), model ready.
- A large textarea: **"What's happening? Who needs help?"**, with a short placeholder example.
- Primary button **Analyze** (shows a spinner; inference should take well under 1 s).
- A link to **My reports**.

**3. Review (confirmation)**
- A large triage banner in the triage color: e.g. **"RED · Life-threatening"**.
- **Hazard** (icon + name), **Situation** (Trapped / Exposed / Sheltered / Unknown).
- **People:** steppers for adults and children.
- **Medical needs:** 8 toggle chips with icons.
- **"Are you at the emergency?"** — Yes / No, I'm reporting for someone else. This sets `third_party`.
- **Location:** GPS accuracy and coordinates. If a location was mentioned, a note: "You mentioned '123 Elm St' — GPS shows where you are, not necessarily the emergency."
- **Every field is editable by tap,** using bottom sheets.
- A collapsed **"What gets sent (18 bytes)"** section shows the hex frame and a one-line explanation. Judges love it.
- Primary button **Continue to send**.

**4. Send**
- Three steps with icons:
  1. Keep Airplane Mode on; turn on Wi-Fi.
  2. Join the network **CivicMesh-SOS**.
  3. Tap **Send**.
- **Send** saves the report to My reports (status "handed to relay"), then sets `location.href = "http://192.168.4.1/sos?d=<36 uppercase hex>"`. This must be a top-level navigation: an HTTPS page cannot `fetch()` plain HTTP.
- Then increment `seq`.

**5. Relay reply page** (served by the field node, §13.1)
- Shows "Sent ✓", with a **Back to CivicMesh** link to the app's hosted URL.

**6. My reports**
- A list of sent reports: time, triage color, hazard, seq. Stored in localStorage, with every access wrapped in try/catch.

**Identity and GPS:**
- `device_id` is a random uint16, created on first run and stored.
- GPS uses `navigator.geolocation.getCurrentPosition({enableHighAccuracy: true, timeout: 10000})`. Bucket `coords.accuracy` per §2. On failure → NO_FIX with lat/lon 0, and the Review screen says "No GPS fix".

---

## 13. Firmware, bridge server, operator dashboard

### 13.1 Field node firmware (`firmware/field_node/`, extend the radio test from Appendix B)

- Wi-Fi SoftAP with SSID `CivicMesh-SOS`, open, IP `192.168.4.1`. ESP32 `WebServer`.
- **`GET /sos?d=<hex>`:**
  1. Require exactly 36 hex chars and version bits = 1. Otherwise return 400 with a friendly HTML error.
  2. Transmit over LoRa.
  3. Show `SENT · RED · 3 ppl · seq 12` on the OLED.
  4. Return a small, self-contained HTML page (inline CSS, matching the website's dark design): **"Sent ✓ — your report is on the rescue network. Stay where you are if it is safe."**
  5. Include a **Back to CivicMesh** link to `APP_URL`, a `#define` holding the hosted website URL.
- **`GET /`:** "CivicMesh relay — open the CivicMesh website to send a report."
- **Idle OLED:** `READY · <n> sent`.
- **No captive-portal DNS redirect.** iOS's portal browser can't see the website's cached model.

### 13.2 Base station firmware (`firmware/base_station/`, Appendix B receiver role)

- Print one line per frame at 115200 baud: `FRAME <36 hex> <rssi> <snr>`.
- Print `CRC error, packet dropped` for CRC failures. Ignore unknown versions.
- OLED: the last frame's priority, headcount and seq, plus RSSI.
- **Optional ACK (Phase B polish):** transmit the 4-byte frame `[0xAC, device_id_hi, device_id_lo, seq]`. The field node shows "Received by Command".

### 13.3 Bridge server (`bridge/server.py`)

**Python FastAPI + uvicorn**, one process, port 8000. It also serves the dashboard's built files at `/`.

**Serial reader** (background thread):
- pyserial, reading from `--port` or auto-detecting `/dev/cu.usbserial*` / `/dev/cu.usbmodem*`.
- Parses `FRAME` lines and decodes them with `unpack_binary_frame`.
- Reconnects automatically if the board is unplugged.

**Deduplication** on `(device_id, seq)` within 10 minutes. A repeat doesn't create a new pin; it updates `heard_count`, `last_heard_at`, and the best RSSI/SNR.

**Incident store** in SQLite (`bridge/incidents.db`), so pins survive a restart.

| Column | |
|---|---|
| id | uuid |
| device_id, seq | |
| frame_hex | |
| decoded | JSON |
| rssi, snr | |
| heard_count | |
| received_at, last_heard_at | |
| state | `active` / `removed` |
| removed_at | |

**API:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/incidents?state=active\|removed\|all` | List incidents |
| POST | `/api/incidents/{id}/remove` | Remove a pin |
| POST | `/api/incidents/{id}/restore` | Undo a removal |
| GET | `/api/health` | `{serial_connected, port, last_frame_at, active_count}` |
| WS | `/ws` | Pushes `{"type": "incident.new" \| "incident.updated" \| "incident.removed" \| "incident.restored" \| "health", "incident"?: {...}}` |

**Incident JSON:**

| Group | Fields |
|---|---|
| Identity and radio | `id`, `frame_hex`, `device_id`, `seq`, `rssi`, `snr`, `heard_count` |
| Triage | `priority` {value, name, color}, `hazard` {value, name}, `status` {value, name}, `adults`, `children`, `medical` [names] |
| Location | `third_party`, `location_type`, `location_discrepancy`, `lat`, `lon`, `gps_accuracy` {value, name, meters_max} |
| Time and state | `sent_at` (frame timestamp), `received_at`, `last_heard_at`, `state` |

**Simulation, so the dashboard can be built without hardware:**
- `--simulate` packs realistic random frames with the real packer, every 3–8 s, around a configurable center point.
- `POST /api/debug/frame {"hex": "..."}` injects a frame.

### 13.4 Operator dashboard (`dashboard/`)

**Stack:**
- **Vite + React + TypeScript + Tailwind**, with the map in **MapLibre GL JS** (open source, vector, smooth, modern).
- **Offline basemap:** a **Protomaps PMTiles** extract of the demo area, loaded with the `pmtiles` protocol plugin and styled with the **dark** flavor of `@protomaps/basemaps`. Glyphs (fonts) and sprites are served locally.
  - Build the extract with the go-pmtiles CLI: `pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles dashboard/public/demo.pmtiles --bbox=<minLon,minLat,maxLon,maxLat> --maxzoom=15`.
  - **OPEN:** verify the current build URL, CLI flags and asset locations.
  - **Don't bulk-download openstreetmap.org tiles** — their usage policy forbids it. That's why we use a PMTiles extract instead of Leaflet with OSM tiles.
- **Fallback if the basemap fails:** a plain dark grid with pins. **The demo must never block on the map.**
- No runtime CDN requests.

**Design process:**
- Browse **Dribbble** for: "emergency dispatch dashboard", "incident command center", "fleet tracking map dashboard dark", "map dashboard UI", "real-time monitoring dashboard".
- Record 3–5 references and what to borrow in `design/REFERENCES.md`.
- Direction: a dark **command-center** look. The map takes ~70% of the width, with a right sidebar. Monospace for hex and coordinates. Triage colors only for triage. Calm motion.

**Layout and behavior:**

**Top bar**
- App name.
- Live status: WebSocket ●, radio serial ●, "last frame 12 s ago".
- Active counters per priority: Red, Yellow, Green, Black.
- Sound toggle.

**Map**
- Circle markers colored by priority; Red markers are larger, with a soft pulse.
- **New pins appear in real time:** a drop/pulse animation plus a toast ("New RED · FLOOD · 3 people"), and an optional chime for Red.
- A selected pin shows its GPS-accuracy circle and a ⚠ badge if the location-discrepancy flag is set.
- Incidents with no GPS fix aren't placed on the map; they're listed under **"No location"** in the sidebar.

**Sidebar list**
- Active incidents sorted **Red → Yellow → Green → Black**, then newest first.
- Each card: color bar, hazard icon and name, people count, medical icons, live age ("2 min ago"), seq.
- Filter chips by priority.
- A "Show removed" toggle shows removed incidents greyed out.

**Click a pin or card → detail drawer**
- **Triage:** priority banner, hazard, situation, people (adults / children), medical needs.
- **Location:**
  - lat/lon, with a copy button
  - GPS accuracy
  - if third-party: "Reporter is not at the scene — GPS shows the reporter, not the incident" and the location type
- **Timing:** sent time (from the frame) vs received time.
- **Radio:** RSSI, SNR, heard N times, device id.
- **Encoded message:**
  - the 36-hex frame in monospace
  - a **byte-by-byte breakdown table**: byte offset → hex → field → decoded value
  - a note: *"Only these 18 bytes traveled over the radio; the survivor's original text is never transmitted."*
- **Actions:**
  - **Remove pin:** a confirm dialog, then `POST …/remove`. The pin fades out, and an **Undo** toast stays for 10 s (→ `/restore`).
  - **Center on map.**

**Keyboard:** Esc closes the drawer. Delete removes the selected pin, with confirmation.

**Realtime:** after loading `GET /api/incidents?state=active`, apply WebSocket events. Reconnect with backoff and show "Reconnecting…" in the top bar.

### 13.5 Demo script

1. A judge's phone opens the website once while online ("Ready offline ✓"), then goes into Airplane Mode.
2. Type: "Water is rising fast, my mother needs insulin, 2 of us trapped in attic".
3. Review shows Red · Flood · Trapped · 2 adults · Insulin.
4. Join the `CivicMesh-SOS` Wi-Fi network and tap Send.
5. Within about 1 s, a pulsing Red pin appears on the dashboard. Click it to show the decoded fields and the 18-byte breakdown, then remove the pin and undo.

---

## 14. Project layout to create

```
civicmesh-sos/
├── requirements.txt          # torch transformers tokenizers onnx onnxruntime pydantic requests tqdm numpy pytest pyserial fastapi uvicorn
├── src/schema.py
├── src/serialization/bit_packer.py
├── src/models/resolvers.py
├── src/models/prototype_classifier.py   # Stage 1 Python reference
├── src/models/triage_classifier.py      # Stage 2
├── stage1/build_prototypes.py           # → web/public/model/prototypes.json
├── training/common.py        # label lists, descriptions, LABEL_VERSION, COUNT_RULE, THIRD_PARTY_RULE, OpenRouter client, JSONL helpers
├── training/export_onnx.py   # §11.1 and §11.2
├── training/generate.py  training/verify.py  training/import_chatbot.py  training/train.py
├── training/chatbot_prompt_A.md  _B.md  _C.md   # Appendix C
├── benchmark/evaluate_dataset.py
├── data/benchmark_dataset.jsonl   # Appendix A, verbatim
├── data/synthetic/                # raw.jsonl, scored.jsonl (generated)
├── firmware/radio_test/radio_test.ino   # written during the event from Appendix B's description
├── firmware/field_node/field_node.ino
├── firmware/base_station/base_station.ino
├── bridge/server.py               # FastAPI + serial + SQLite + WebSocket + --simulate
├── dashboard/                     # Vite + React + TS + Tailwind + MapLibre + PMTiles
├── web/                           # survivor PWA: Vite + React + TS + Tailwind + onnxruntime-web
├── design/REFERENCES.md           # Dribbble references + design tokens
└── tests/                         # packer, resolvers, importer; Vitest in web/ for JS parity
```

Run Python scripts as modules from the project root (`python3 -m training.generate`). Node.js 20+ for `web/` and `dashboard/`.

---

## 15. Hackathon schedule (24 h): demo first, fine-tuning last

### Phase A — Working demo with the Stage 1 model (hours 0–15)

| Hours | Work | Done when |
|---|---|---|
| 0–1 | Project skeleton, schema, packer and tests | Both §3 test vectors pass |
| 0–1 (in parallel) | Write the radio link test from Appendix B's description and flash both boards | Receiver prints `FRAME 861200012B0BF3BA7E6A68E77800BEEF0050 …` (bytes 10–13 and 16 change per frame) |
| 1–2 (in parallel, a human task) | Run the three chatbot prompts (Appendix C) in a chatbot; import with the pre-import checks | 310 rows in `raw.jsonl`, none close to a test message |
| 1–3 | Resolvers + tests; Stage 1 prototypes + Python reference; `evaluate_dataset.py`; tune `unknown_margin` on the chatbot rows | Stage 1 scored on Appendix A and the chatbot rows |
| 3–5 | §11.1 export: embedder INT8 + gzip + parity | Parity passes; size reported |
| 2–7 (in parallel) | Bridge server with `--simulate`; dashboard (Dribbble references first) | Simulated pins appear live; click shows the byte breakdown; remove + undo work |
| 5–7 (in parallel) | Field node firmware | A hand-typed `http://192.168.4.1/sos?d=…` puts a pin on the dashboard |
| 5–12 | Survivor website (Dribbble references first) | Vitest: the JS packer matches the test vectors, and JS/Python parity passes; works in Airplane Mode after one visit |
| 12–15 | End-to-end in Airplane Mode on iPhone **and** Android | The demo script (§13.5) works 5 times in a row → **DEMO FREEZE**: tag the commit and don't break it |

### Phase B — Fine-tuning (hours 15–22, only after the demo freeze)

| Hours | Work | Done when |
|---|---|---|
| 15–16 | Verify the OpenRouter and Jev endpoints with one call each; `verify --benchmark`; `generate --n 200` and read the rows | Endpoints confirmed; generated rows look realistic |
| 16–17 | `generate --n 5000`, then `verify` | Keep rate and per-writer report reviewed |
| 17–19 | Train bge-small (and MiniLM if time allows), `--val-writer chatbot` | Both scored on Appendix A and validation |
| 19–21 | §11.2 export; swap behind `model.json` on a branch | Ship **only** if it beats Stage 1 on Red recall and whole-summary accuracy on Appendix A **and** validation. Otherwise keep Stage 1. |

### Phase C — hours 22–24

Optional ACK, polish, slides, rehearsal, buffer.

**Optional speed-up:** generation is mostly waiting on the API. If someone is idle during Phase A, they can run Phase B's first two rows early in the background. Never at the expense of Phase A.

---

## 16. Pitfalls and open items

- **Map tiles:** never bulk-download openstreetmap.org tiles; use the PMTiles extract. Have the plain-grid fallback ready.
- **Offline means no CDNs:** no Google Fonts, unpkg or cdnjs at runtime in either web app. Bundle everything.
- **vite-plugin-pwa skips large files by default.** Raise `maximumFileSizeToCacheInBytes`, or the model won't be cached and the app breaks in Airplane Mode.
- **onnxruntime-web needs its `.wasm` files served locally** (`ort.env.wasm.wasmPaths`). Test in Airplane Mode on a real iPhone early: memory and speed on iOS Safari are unmeasured.
- **Quantization accuracy:** INT8 can cost a few points of accuracy. Measure it (§11.1).
- **Stage 1 judges topic more than severity,** so expect it to over-call Red. The Review screen is the mitigation; make editing priority one tap.
- **Original message text is never transmitted.** The dashboard shows decoded fields and the raw 18 bytes, not the survivor's words.
- **OPEN:** the OpenRouter `/systemone` path and payload for Jev. Test one call before any batch run. Fallback: TypeSafe's direct API.
- **OPEN:** whether both writer models accept `reasoning: {"enabled": false}` and `response_format: json_object`. Test one call each. If either is rejected, remove that field.
- Never tune or select anything on Appendix A. It has only 54 messages: one message ≈ 1.9 points of accuracy, one Red ≈ 3.6 points of Red recall.
- Appendix A's mix is 28 Immediate / 10 Delayed / 13 Minor / 3 Deceased, and status is 26 Sheltered / 20 Trapped / 7 Exposed / 1 Unknown. It barely tests Unknown and Deceased, so also report validation (chatbot-writer) metrics.
- Validating on the same writers you train on hides overfitting to style. Always use `--val-writer chatbot` for real runs.
- A Red threshold tuned on ~30 rows is noise.
- On macOS zsh, an unquoted `$var` in a `for` loop is not split into words. Write separate commands.
- Coordinates: double precision in C and JS (float32 is off by ~2 m).
- Both boards must use the same spreading factor, sync word and frequency.

---

## Appendix A — Test set (54 messages, verbatim). Save as `data/benchmark_dataset.jsonl`. NEVER train or tune on it.

````jsonl
{"id": "flood_01", "text": "Water rising fast in attic! 2 adults and 1 toddler trapped. Mother needs insulin urgently!!", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["INSULIN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "flood_02", "text": "roof caved in water up to our chests 3 people here hypothermia setting in cant swim help us please", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["HYPOTHERMIA"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "flood_03", "text": "ON THE ROOF WITH 2 BABIES AND MY WIFE. FLOOD WATER CURRENT IS STRONG. PLEASE SEND A BOAT", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Exposed", "adult_count": 2, "pediatric_count": 2, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "flood_04", "text": "stuck on second floor water reached 1st floor ceiling. Just me here, power out, oxygen concentrator battery dying fast 15% left", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "collapse_01", "text": "Concrete slab fell on my husband legs pinned and bleeding heavily from deep cut. 2 adults trapped in basement.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["BLEEDING", "MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "collapse_02", "text": "Stairwell collapsed, 4 of us on 3rd floor cannot get down, smoke coming up. One pregnant woman having contractions.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 4, "pediatric_count": 0, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "collapse_03", "text": "Building fell down. Cant breath dust everywhere. Me and my 8yr old son under table. Help us!!", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 1, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "fire_01", "text": "Flames surrounding driveway, car won't start. 2 people, severe 3rd degree burns on hands and face.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["BURNS"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "fire_02", "text": "Heavy black smoke filling apartment, coughing blood. Elderly grandmother unable to walk without wheelchair.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["OXYGEN", "MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_01", "text": "Roof sustained minor leak. My father slipped and dislocated shoulder, cannot move arm. We have food and dry shelter for 3 people.", "triage_priority": "Delayed", "hazard_class": "EXTREME_WEATHER", "rescue_status": "Sheltered", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_02", "text": "Road is washed out by river. We are 5 adults stranded at camp cabin. Stable, but out of prescription cardiac medication since yesterday.", "triage_priority": "Delayed", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 5, "pediatric_count": 0, "medical_flags": ["CARDIAC"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_03", "text": "Tree fell across front porch blocking door. We can climb out back window if needed. 1 broken wrist on teenager, 2 adults. Safe from storm for now.", "triage_priority": "Delayed", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_04", "text": "Car broke down in blizzard off highway 80. Engine running low on fuel. 2 adults and infant. Warm clothes but need towing before dark.", "triage_priority": "Delayed", "hazard_class": "HYPOTHERMIA_FREEZE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_01", "text": "Power is out for 24 hours. We are 4 adults safe in house with non-perishable food. Just need drinking water delivery when available.", "triage_priority": "Minor", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Sheltered", "adult_count": 4, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_02", "text": "Minor scratches from broken glass, bandaged already. 2 people safe in community center basement. No immediate danger.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_03", "text": "Water in yard but house dry. Family of 3 with baby, we have 4 days food. Inquiring about evacuation shelter status.", "triage_priority": "Minor", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "black_01", "text": "One body found under collapsed masonry, no pulse for over 2 hours, unresponsive. Survivor 1 adult uninjured nearby.", "triage_priority": "Deceased", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Exposed", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_01", "text": "Water is outside the door but we are NOT trapped and NOT injured. 3 adults and 2 golden retrievers safe inside.", "triage_priority": "Minor", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_02", "text": "There are zero injuries here. Power line sparking on street outside. 1 person alone inside looking out window.", "triage_priority": "Minor", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_03", "text": "me, my husband, our two young daughters and my elderly grandmother trapped in attic. grandmother has heart failure and chest pain.", "triage_priority": "Immediate", "hazard_class": "NONE", "rescue_status": "Trapped", "adult_count": 3, "pediatric_count": 2, "medical_flags": ["MOBILITY_IMPAIRED", "CARDIAC"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_04", "text": "Severe gas leak smell throughout hallway! Sparks from fusebox. 6 people unable to exit due to jammed fire door. Hurry!", "triage_priority": "Immediate", "hazard_class": "HAZMAT_GAS", "rescue_status": "Trapped", "adult_count": 6, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_05", "text": "Active shooter reported down street, barricaded in classroom with 14 students and 1 teacher. Nobody wounded yet.", "triage_priority": "Immediate", "hazard_class": "ACTIVE_VIOLENCE", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 14, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "flood_05", "text": "Flash flood carried truck into ditch. Water up to dashboard and rising. 2 adults 1 baby trapped inside cab!", "triage_priority": "Immediate", "hazard_class": "FLOOD", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 1, "medical_flags": ["PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "collapse_04", "text": "Tornado hit neighborhood. Our roof collapsed into hallway, 1 adult pinned under ceiling joist with broken pelvis and severe arterial bleeding.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["BLEEDING", "MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "fire_03", "text": "Wildfire jumped ridge line, house caught fire! 3 of us trapped in swimming pool with wet towels, extreme smoke inhalation cannot breath.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Trapped", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["OXYGEN", "BURNS"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "med_01", "text": "72-year-old grandfather in severe diabetic ketoacidosis, unconscious, insulin was destroyed in flood. 2 adults here.", "triage_priority": "Immediate", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["INSULIN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "med_02", "text": "Chainsaw accident while clearing storm debris, deep laceration to thigh, spurting blood, tourniquet applied. 1 victim.", "triage_priority": "Immediate", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["BLEEDING"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "freeze_01", "text": "Furnace failed in -20F blizzard. 2 adults and 3 children under blankets, 1 baby showing signs of severe hypothermia lips turning blue.", "triage_priority": "Immediate", "hazard_class": "HYPOTHERMIA_FREEZE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 3, "medical_flags": ["HYPOTHERMIA", "PREGNANCY_INFANT"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "hazmat_01", "text": "Train derailment nearby, strong chlorine gas smell burning eyes and throat, 4 people vomiting and gasping for air.", "triage_priority": "Immediate", "hazard_class": "HAZMAT_GAS", "rescue_status": "Exposed", "adult_count": 4, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "power_01", "text": "High voltage power line fell onto our occupied SUV in rain. 2 adults inside. Tires smoking, afraid to step out.", "triage_priority": "Immediate", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "landslide_01", "text": "Mudslide swept through living room. My sister is buried to her waist in mud and debris, unable to extract her. 2 people total.", "triage_priority": "Immediate", "hazard_class": "LANDSLIDE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_05", "text": "Basement flooded with 2 feet of water. Furnaces off. 3 adults stranded on main floor. Cold but dry, need evacuation assist tomorrow.", "triage_priority": "Delayed", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_06", "text": "Earthquake cracked our walls, door is stuck shut but structure seems stable. 2 adults, 1 has sprained ankle. Food supplies good.", "triage_priority": "Delayed", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 2, "pediatric_count": 0, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_07", "text": "Bridge washed out behind our subdivision. 8 adults cut off from main road. Everyone uninjured, seeking supplies.", "triage_priority": "Delayed", "hazard_class": "FLOOD", "rescue_status": "Sheltered", "adult_count": 8, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_08", "text": "Grandmother's oxygen machine backup battery has 6 hours remaining. She is resting comfortably now with 2 adults watching her.", "triage_priority": "Delayed", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Sheltered", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_09", "text": "Chimney collapsed into yard. 4 adults, one cuts on arm cleaned and dressed. Road impassable due to fallen oak tree.", "triage_priority": "Delayed", "hazard_class": "EXTREME_WEATHER", "rescue_status": "Sheltered", "adult_count": 4, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "yellow_10", "text": "Boat engine died in floodwaters, drifting in slow eddy near trees. 3 adults wearing life vests, no immediate tipping danger.", "triage_priority": "Delayed", "hazard_class": "FLOOD", "rescue_status": "Exposed", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_04", "text": "Cell service down. 2 adults and 2 kids at home, completely safe, house intact, checking when grid power will be restored.", "triage_priority": "Minor", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 2, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_05", "text": "Water main broke down street, no tap water. 1 person alone in apartment. Plenty of canned food, just requesting drinking water.", "triage_priority": "Minor", "hazard_class": "CONTAMINATED_WATER", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_06", "text": "Hail broke skylight, water on rug. Cleaned up, plastic tarp placed. 2 adults doing fine.", "triage_priority": "Minor", "hazard_class": "EXTREME_WEATHER", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_07", "text": "Checking in for our block. 6 neighbors sheltering in church hall. Plenty of blankets and warm soup, no injuries whatsoever.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 6, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "green_08", "text": "Minor burn on finger from cooking candle, ointment applied. 1 adult. Safe in garage.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "black_02", "text": "Elderly neighbor passed away overnight from hypothermia, cold and stiff, no breathing or pulse. 1 survivor adult here.", "triage_priority": "Deceased", "hazard_class": "HYPOTHERMIA_FREEZE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "black_03", "text": "Found car submerged in canal, driver trapped underwater for 30 minutes, unrecoverable, dead. Calling from bank 1 person.", "triage_priority": "Deceased", "hazard_class": "FLOOD", "rescue_status": "Exposed", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_06", "text": "Do not send ambulance, no one is hurt. Fire is 3 blocks away, not threatening our house. 5 adults here safe.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 5, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_07", "text": "We are NOT out of food or water, no bleeding, no injuries. Tree fell in back yard. 2 adults.", "triage_priority": "Minor", "hazard_class": "NONE", "rescue_status": "Sheltered", "adult_count": 2, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_08", "text": "Overturned tour bus on highway overpass with 25 adults and children injured, multiple people trapped in wreckage.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Trapped", "adult_count": 15, "pediatric_count": 5, "medical_flags": ["BLEEDING", "MOBILITY_IMPAIRED"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_09", "text": "MY MOM CANNOT BREATH. ASH EVERYWHERE. WE ARE 3 ADULTS TRAPPED IN BASEMENT DOOR JAMMED.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Trapped", "adult_count": 3, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tricky_10", "text": "Just 1 elderly person here, power is out. I have my insulin in a cooler with ice, so I am good for 48 hours. No assistance needed yet.", "triage_priority": "Minor", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Sheltered", "adult_count": 1, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "tsunami_01", "text": "Tsunami warning sounded, ocean receded. 4 people running up hill toward high ground, completely exposed, no injuries yet.", "triage_priority": "Immediate", "hazard_class": "TSUNAMI_SURGE", "rescue_status": "Exposed", "adult_count": 4, "pediatric_count": 0, "medical_flags": [], "is_third_party": false, "location_type": "DIRECT_ON_SCENE"}
{"id": "proxy_01", "text": "My mom just called me and I heard her fall. She lives at 123 Applyberry Lane and has had previous medicial issues. PLEASE HURRY!", "triage_priority": "Immediate", "hazard_class": "MEDICAL_CRISIS", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["MOBILITY_IMPAIRED"], "is_third_party": true, "location_type": "EXPLICIT_ADDRESS", "location_text": "123 Applyberry Lane"}
{"id": "proxy_02", "text": "I live a few blocks away from a Walmart. I heard the building collapsed and people are screaming. Send help.", "triage_priority": "Immediate", "hazard_class": "STRUCTURAL_COLLAPSE", "rescue_status": "Unknown", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": true, "location_type": "LANDMARK_POI", "location_text": "Walmart (a few blocks away)"}
{"id": "proxy_03", "text": "Reporting on behalf of my elderly father at 450 Elm Street. His oxygen concentrator shut off with the storm outage, he is gasping for air!", "triage_priority": "Immediate", "hazard_class": "ELECTRICAL_POWER", "rescue_status": "Trapped", "adult_count": 1, "pediatric_count": 0, "medical_flags": ["OXYGEN"], "is_third_party": true, "location_type": "EXPLICIT_ADDRESS", "location_text": "450 Elm Street"}
{"id": "proxy_04", "text": "Can see smoke rising from North High School down the street. Roof partially caved in. People running outside.", "triage_priority": "Immediate", "hazard_class": "FIRE_SMOKE", "rescue_status": "Exposed", "adult_count": 3, "pediatric_count": 0, "medical_flags": [], "is_third_party": true, "location_type": "LANDMARK_POI", "location_text": "High School (down the street)"}
````

## Appendix B — Radio link test (description; write the code during the event)

One Arduino sketch for both boards (`firmware/radio_test/radio_test.ino`). A compile-time constant `ROLE_SENDER` selects the role: 1 on the field node, 0 on the base station. A second constant sets the spreading factor (7).

**Libraries:** RadioLib (SX1262 driver) and the ThingPulse SSD1306 OLED driver.

**Setup (both roles):**
1. Start serial at 115200 baud.
2. Power the OLED: drive Vext (GPIO 36) LOW. Pulse OLED RST (GPIO 21) LOW for ~20 ms, then HIGH. Initialize the display at I²C address 0x3C on SDA 17 / SCL 18, with a small font.
3. Start SPI on the §1 pins and construct the SX1262 module (NSS 8, DIO1 14, RST 12, BUSY 13).
4. Configure the radio with the §1 settings: 915.0 MHz, 125 kHz, the SF constant, CR 4/5, sync word 0x12, 14 dBm, 8-symbol preamble, 1.8 V TCXO. Enable the 2-byte hardware CRC.
5. If any radio call returns an error, print the error code to serial, show "Radio init FAILED <code>" on the OLED, and halt.
6. Otherwise show "SENDER ready" or "RECEIVER ready".

**A small helper packs a v1 frame** exactly as §3 describes. Use double precision for the coordinates and big-endian byte order. Byte 17 = (gps_accuracy << 3) | (1 << 6).

**Sender loop:**
1. Every 3 seconds, pack test vector 1 from §3: RED, FLOOD, TRAPPED, 2 adults + 1 child, INSULIN, 30.2672 / −97.7431, device 0xBEEF, GPS bucket M10.
2. Vary only two fields per frame: the timestamp is 1760000000 + counter, and seq is counter mod 256.
3. Transmit it, timing the call.
4. Print "Sent seq N (X ms on air)" to serial and show the same on the OLED. On a transmit error, print and show the error code.
5. Increment the counter.

**Receiver loop:**
1. Block on receive for an 18-byte frame.
2. On success:
   - If the version bits (top 2 bits of byte 17) aren't 1, print "Unknown frame version, ignored" and skip it.
   - Otherwise read RSSI and SNR, and print one machine-readable line: `FRAME <36 uppercase hex chars> <rssi> <snr>`. The laptop bridge parses this.
   - Show on the OLED: the priority name (GREEN / YELLOW / RED / BLACK from the low 2 bits of byte 0), adults and children, device id (hex), seq, RSSI and SNR.
3. On a CRC error, print "CRC error, packet dropped".
4. Ignore receive timeouts. Print any other error code.

**Done when:** with antennas attached, the receiver prints `FRAME 861200012B0BF3BA7E6A68E77800BEEF0050 …` for the first frame. Later frames differ only in bytes 10–13 (timestamp) and byte 16 (seq). The sender reports roughly 50 ms on air at SF7.

## Appendix C — Chatbot data prompts (paste each into a FRESH chatbot chat; save replies as data/chatA.txt, chatB.txt, chatC.txt)

### C1 — 200 examples with quotas and hard cases (ids chatA_###; ask it to continue after each 50)

````markdown
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
````

### C2 — 25 very short + 25 very long (ids chatB_###)

````markdown
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
````

### C3 — 60 gap-fillers: Unknown status, Yellow, insulin/cardiac/burns (ids chatC_###)

````markdown
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
````

