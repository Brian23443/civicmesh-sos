# Evaluation — `stage1-onnx` on `benchmark_dataset`

54 rows. On a 54-row set, one message ≈ 1.9 points of accuracy and one Red ≈ 3.6 points of Red recall — don't over-read small differences.

## Headline

| Metric | Value |
|---|---|
| **Red recall** | **89.3%** (25/28) |
| **Red precision** | **89.3%** (25/28) |
| **Whole-summary accuracy** | **14.8%** |
| Priority accuracy | 83.3% |
| Hazard accuracy | 68.5% |
| Status accuracy | 51.9% |
| Exact headcounts (adults and children) | 79.6% |
| Exact adults / exact children | 83.3% / 94.4% |
| Exact medical set | 72.2% |
| Medical F1 (micro) | 71.2% |
| Third-party accuracy | 88.9% |

## Priority confusion

| gold \ predicted | Minor | Delayed | Immediate | Deceased |
|---|---|---|---|---|
| **Minor** | 12 | 0 | 1 | 0 |
| **Delayed** | 1 | 6 | 1 | 2 |
| **Immediate** | 0 | 1 | 25 | 2 |
| **Deceased** | 0 | 0 | 1 | 2 |

## Status confusion

| gold \ predicted | Sheltered | Exposed | Trapped | Unknown |
|---|---|---|---|---|
| **Sheltered** | 8 | 17 | 1 | 0 |
| **Exposed** | 0 | 5 | 2 | 0 |
| **Trapped** | 1 | 4 | 15 | 0 |
| **Unknown** | 0 | 0 | 1 | 0 |

## Medical flags

| Flag | Recall | Precision | Hits | Missed | False alarms |
|---|---|---|---|---|---|
| INSULIN | 100.0% | 66.7% | 2 | 0 | 1 |
| OXYGEN | 87.5% | 100.0% | 7 | 1 | 0 |
| BLEEDING | 75.0% | 100.0% | 3 | 1 | 0 |
| HYPOTHERMIA | 100.0% | 66.7% | 2 | 0 | 1 |
| MOBILITY_IMPAIRED | 20.0% | 100.0% | 2 | 8 | 0 |
| CARDIAC | 100.0% | 100.0% | 2 | 0 | 0 |
| PREGNANCY_INFANT | 33.3% | 100.0% | 2 | 4 | 0 |
| BURNS | 50.0% | 100.0% | 1 | 1 | 0 |

## Top hazard confusions

| Gold | Predicted | Count |
|---|---|---|
| FLOOD | CONTAMINATED_WATER | 2 |
| STRUCTURAL_COLLAPSE | EXTREME_WEATHER | 2 |
| NONE | STRUCTURAL_COLLAPSE | 2 |
| NONE | FIRE_SMOKE | 2 |
| FLOOD | HYPOTHERMIA_FREEZE | 1 |
| EXTREME_WEATHER | STRUCTURAL_COLLAPSE | 1 |
| ELECTRICAL_POWER | CONTAMINATED_WATER | 1 |
| FLOOD | NONE | 1 |
| MEDICAL_CRISIS | NONE | 1 |
| EXTREME_WEATHER | SINKHOLE_SUBSIDENCE | 1 |

## Example errors (up to 25 per field)

### priority (9 wrong)

- `yellow_03` gold **Delayed**, predicted **Minor** — Tree fell across front porch blocking door. We can climb out back window if needed. 1 broken wrist on teenager, 2 adults. Safe from storm for now.
- `green_03` gold **Minor**, predicted **Immediate** — Water in yard but house dry. Family of 3 with baby, we have 4 days food. Inquiring about evacuation shelter status.
- `tricky_05` gold **Immediate**, predicted **Deceased** — Active shooter reported down street, barricaded in classroom with 14 students and 1 teacher. Nobody wounded yet.
- `yellow_05` gold **Delayed**, predicted **Immediate** — Basement flooded with 2 feet of water. Furnaces off. 3 adults stranded on main floor. Cold but dry, need evacuation assist tomorrow.
- `yellow_08` gold **Delayed**, predicted **Deceased** — Grandmother's oxygen machine backup battery has 6 hours remaining. She is resting comfortably now with 2 adults watching her.
- `yellow_10` gold **Delayed**, predicted **Deceased** — Boat engine died in floodwaters, drifting in slow eddy near trees. 3 adults wearing life vests, no immediate tipping danger.
- `black_03` gold **Deceased**, predicted **Immediate** — Found car submerged in canal, driver trapped underwater for 30 minutes, unrecoverable, dead. Calling from bank 1 person.
- `tricky_08` gold **Immediate**, predicted **Delayed** — Overturned tour bus on highway overpass with 25 adults and children injured, multiple people trapped in wreckage.
- `tsunami_01` gold **Immediate**, predicted **Deceased** — Tsunami warning sounded, ocean receded. 4 people running up hill toward high ground, completely exposed, no injuries yet.

### hazard (17 wrong)

- `flood_02` gold **FLOOD**, predicted **HYPOTHERMIA_FREEZE** — roof caved in water up to our chests 3 people here hypothermia setting in cant swim help us please
- `flood_04` gold **FLOOD**, predicted **CONTAMINATED_WATER** — stuck on second floor water reached 1st floor ceiling. Just me here, power out, oxygen concentrator battery dying fast 15% left
- `yellow_01` gold **EXTREME_WEATHER**, predicted **STRUCTURAL_COLLAPSE** — Roof sustained minor leak. My father slipped and dislocated shoulder, cannot move arm. We have food and dry shelter for 3 people.
- `yellow_03` gold **STRUCTURAL_COLLAPSE**, predicted **EXTREME_WEATHER** — Tree fell across front porch blocking door. We can climb out back window if needed. 1 broken wrist on teenager, 2 adults. Safe from storm for now.
- `green_01` gold **ELECTRICAL_POWER**, predicted **CONTAMINATED_WATER** — Power is out for 24 hours. We are 4 adults safe in house with non-perishable food. Just need drinking water delivery when available.
- `green_02` gold **NONE**, predicted **STRUCTURAL_COLLAPSE** — Minor scratches from broken glass, bandaged already. 2 people safe in community center basement. No immediate danger.
- `tricky_01` gold **FLOOD**, predicted **NONE** — Water is outside the door but we are NOT trapped and NOT injured. 3 adults and 2 golden retrievers safe inside.
- `tricky_03` gold **NONE**, predicted **STRUCTURAL_COLLAPSE** — me, my husband, our two young daughters and my elderly grandmother trapped in attic. grandmother has heart failure and chest pain.
- `collapse_04` gold **STRUCTURAL_COLLAPSE**, predicted **EXTREME_WEATHER** — Tornado hit neighborhood. Our roof collapsed into hallway, 1 adult pinned under ceiling joist with broken pelvis and severe arterial bleeding.
- `yellow_07` gold **FLOOD**, predicted **CONTAMINATED_WATER** — Bridge washed out behind our subdivision. 8 adults cut off from main road. Everyone uninjured, seeking supplies.
- `yellow_08` gold **MEDICAL_CRISIS**, predicted **NONE** — Grandmother's oxygen machine backup battery has 6 hours remaining. She is resting comfortably now with 2 adults watching her.
- `yellow_09` gold **EXTREME_WEATHER**, predicted **SINKHOLE_SUBSIDENCE** — Chimney collapsed into yard. 4 adults, one cuts on arm cleaned and dressed. Road impassable due to fallen oak tree.
- `green_08` gold **NONE**, predicted **FIRE_SMOKE** — Minor burn on finger from cooking candle, ointment applied. 1 adult. Safe in garage.
- `tricky_06` gold **NONE**, predicted **FIRE_SMOKE** — Do not send ambulance, no one is hurt. Fire is 3 blocks away, not threatening our house. 5 adults here safe.
- `tricky_08` gold **STRUCTURAL_COLLAPSE**, predicted **FLOOD** — Overturned tour bus on highway overpass with 25 adults and children injured, multiple people trapped in wreckage.
- `tricky_09` gold **FIRE_SMOKE**, predicted **STRUCTURAL_COLLAPSE** — MY MOM CANNOT BREATH. ASH EVERYWHERE. WE ARE 3 ADULTS TRAPPED IN BASEMENT DOOR JAMMED.
- `tricky_10` gold **ELECTRICAL_POWER**, predicted **HYPOTHERMIA_FREEZE** — Just 1 elderly person here, power is out. I have my insulin in a cooler with ice, so I am good for 48 hours. No assistance needed yet.

### status (26 wrong)

- `flood_02` gold **Trapped**, predicted **Exposed** — roof caved in water up to our chests 3 people here hypothermia setting in cant swim help us please
- `fire_01` gold **Trapped**, predicted **Exposed** — Flames surrounding driveway, car won't start. 2 people, severe 3rd degree burns on hands and face.
- `fire_02` gold **Trapped**, predicted **Exposed** — Heavy black smoke filling apartment, coughing blood. Elderly grandmother unable to walk without wheelchair.
- `yellow_01` gold **Sheltered**, predicted **Exposed** — Roof sustained minor leak. My father slipped and dislocated shoulder, cannot move arm. We have food and dry shelter for 3 people.
- `yellow_02` gold **Sheltered**, predicted **Exposed** — Road is washed out by river. We are 5 adults stranded at camp cabin. Stable, but out of prescription cardiac medication since yesterday.
- `yellow_03` gold **Sheltered**, predicted **Exposed** — Tree fell across front porch blocking door. We can climb out back window if needed. 1 broken wrist on teenager, 2 adults. Safe from storm for now.
- `yellow_04` gold **Sheltered**, predicted **Exposed** — Car broke down in blizzard off highway 80. Engine running low on fuel. 2 adults and infant. Warm clothes but need towing before dark.
- `green_03` gold **Sheltered**, predicted **Exposed** — Water in yard but house dry. Family of 3 with baby, we have 4 days food. Inquiring about evacuation shelter status.
- `black_01` gold **Exposed**, predicted **Trapped** — One body found under collapsed masonry, no pulse for over 2 hours, unresponsive. Survivor 1 adult uninjured nearby.
- `tricky_01` gold **Sheltered**, predicted **Exposed** — Water is outside the door but we are NOT trapped and NOT injured. 3 adults and 2 golden retrievers safe inside.
- `tricky_02` gold **Sheltered**, predicted **Exposed** — There are zero injuries here. Power line sparking on street outside. 1 person alone inside looking out window.
- `tricky_05` gold **Sheltered**, predicted **Exposed** — Active shooter reported down street, barricaded in classroom with 14 students and 1 teacher. Nobody wounded yet.
- `med_01` gold **Sheltered**, predicted **Exposed** — 72-year-old grandfather in severe diabetic ketoacidosis, unconscious, insulin was destroyed in flood. 2 adults here.
- `med_02` gold **Sheltered**, predicted **Exposed** — Chainsaw accident while clearing storm debris, deep laceration to thigh, spurting blood, tourniquet applied. 1 victim.
- `freeze_01` gold **Sheltered**, predicted **Exposed** — Furnace failed in -20F blizzard. 2 adults and 3 children under blankets, 1 baby showing signs of severe hypothermia lips turning blue.
- `power_01` gold **Trapped**, predicted **Sheltered** — High voltage power line fell onto our occupied SUV in rain. 2 adults inside. Tires smoking, afraid to step out.
- `yellow_05` gold **Sheltered**, predicted **Exposed** — Basement flooded with 2 feet of water. Furnaces off. 3 adults stranded on main floor. Cold but dry, need evacuation assist tomorrow.
- `yellow_07` gold **Sheltered**, predicted **Trapped** — Bridge washed out behind our subdivision. 8 adults cut off from main road. Everyone uninjured, seeking supplies.
- `yellow_09` gold **Sheltered**, predicted **Exposed** — Chimney collapsed into yard. 4 adults, one cuts on arm cleaned and dressed. Road impassable due to fallen oak tree.
- `green_05` gold **Sheltered**, predicted **Exposed** — Water main broke down street, no tap water. 1 person alone in apartment. Plenty of canned food, just requesting drinking water.
- `green_06` gold **Sheltered**, predicted **Exposed** — Hail broke skylight, water on rug. Cleaned up, plastic tarp placed. 2 adults doing fine.
- `black_02` gold **Sheltered**, predicted **Exposed** — Elderly neighbor passed away overnight from hypothermia, cold and stiff, no breathing or pulse. 1 survivor adult here.
- `black_03` gold **Exposed**, predicted **Trapped** — Found car submerged in canal, driver trapped underwater for 30 minutes, unrecoverable, dead. Calling from bank 1 person.
- `tricky_07` gold **Sheltered**, predicted **Exposed** — We are NOT out of food or water, no bleeding, no injuries. Tree fell in back yard. 2 adults.
- `proxy_02` gold **Unknown**, predicted **Trapped** — I live a few blocks away from a Walmart. I heard the building collapsed and people are screaming. Send help.

### adults (9 wrong)

- `black_01` gold **2**, predicted **1** — One body found under collapsed masonry, no pulse for over 2 hours, unresponsive. Survivor 1 adult uninjured nearby.
- `tricky_03` gold **3**, predicted **2** — me, my husband, our two young daughters and my elderly grandmother trapped in attic. grandmother has heart failure and chest pain.
- `tricky_05` gold **1**, predicted **14** — Active shooter reported down street, barricaded in classroom with 14 students and 1 teacher. Nobody wounded yet.
- `med_02` gold **1**, predicted **2** — Chainsaw accident while clearing storm debris, deep laceration to thigh, spurting blood, tourniquet applied. 1 victim.
- `yellow_08` gold **3**, predicted **2** — Grandmother's oxygen machine backup battery has 6 hours remaining. She is resting comfortably now with 2 adults watching her.
- `black_02` gold **2**, predicted **1** — Elderly neighbor passed away overnight from hypothermia, cold and stiff, no breathing or pulse. 1 survivor adult here.
- `black_03` gold **2**, predicted **1** — Found car submerged in canal, driver trapped underwater for 30 minutes, unrecoverable, dead. Calling from bank 1 person.
- `proxy_02` gold **3**, predicted **1** — I live a few blocks away from a Walmart. I heard the building collapsed and people are screaming. Send help.
- `proxy_04` gold **3**, predicted **1** — Can see smoke rising from North High School down the street. Roof partially caved in. People running outside.

### children (3 wrong)

- `tricky_05` gold **14**, predicted **0** — Active shooter reported down street, barricaded in classroom with 14 students and 1 teacher. Nobody wounded yet.
- `freeze_01` gold **3**, predicted **4** — Furnace failed in -20F blizzard. 2 adults and 3 children under blankets, 1 baby showing signs of severe hypothermia lips turning blue.
- `tricky_08` gold **5**, predicted **1** — Overturned tour bus on highway overpass with 25 adults and children injured, multiple people trapped in wreckage.

### medical (15 wrong)

- `flood_03` gold **PREGNANCY_INFANT**, predicted **none** — ON THE ROOF WITH 2 BABIES AND MY WIFE. FLOOD WATER CURRENT IS STRONG. PLEASE SEND A BOAT
- `fire_02` gold **OXYGEN, MOBILITY_IMPAIRED**, predicted **none** — Heavy black smoke filling apartment, coughing blood. Elderly grandmother unable to walk without wheelchair.
- `yellow_01` gold **MOBILITY_IMPAIRED**, predicted **none** — Roof sustained minor leak. My father slipped and dislocated shoulder, cannot move arm. We have food and dry shelter for 3 people.
- `yellow_03` gold **MOBILITY_IMPAIRED**, predicted **none** — Tree fell across front porch blocking door. We can climb out back window if needed. 1 broken wrist on teenager, 2 adults. Safe from storm for now.
- `green_03` gold **PREGNANCY_INFANT**, predicted **none** — Water in yard but house dry. Family of 3 with baby, we have 4 days food. Inquiring about evacuation shelter status.
- `tricky_03` gold **MOBILITY_IMPAIRED, CARDIAC**, predicted **CARDIAC** — me, my husband, our two young daughters and my elderly grandmother trapped in attic. grandmother has heart failure and chest pain.
- `flood_05` gold **PREGNANCY_INFANT**, predicted **none** — Flash flood carried truck into ditch. Water up to dashboard and rising. 2 adults 1 baby trapped inside cab!
- `fire_03` gold **OXYGEN, BURNS**, predicted **OXYGEN** — Wildfire jumped ridge line, house caught fire! 3 of us trapped in swimming pool with wet towels, extreme smoke inhalation cannot breath.
- `freeze_01` gold **HYPOTHERMIA, PREGNANCY_INFANT**, predicted **HYPOTHERMIA** — Furnace failed in -20F blizzard. 2 adults and 3 children under blankets, 1 baby showing signs of severe hypothermia lips turning blue.
- `landslide_01` gold **MOBILITY_IMPAIRED**, predicted **none** — Mudslide swept through living room. My sister is buried to her waist in mud and debris, unable to extract her. 2 people total.
- `yellow_06` gold **MOBILITY_IMPAIRED**, predicted **none** — Earthquake cracked our walls, door is stuck shut but structure seems stable. 2 adults, 1 has sprained ankle. Food supplies good.
- `black_02` gold **none**, predicted **HYPOTHERMIA** — Elderly neighbor passed away overnight from hypothermia, cold and stiff, no breathing or pulse. 1 survivor adult here.
- `tricky_08` gold **BLEEDING, MOBILITY_IMPAIRED**, predicted **none** — Overturned tour bus on highway overpass with 25 adults and children injured, multiple people trapped in wreckage.
- `tricky_10` gold **none**, predicted **INSULIN** — Just 1 elderly person here, power is out. I have my insulin in a cooler with ice, so I am good for 48 hours. No assistance needed yet.
- `proxy_01` gold **MOBILITY_IMPAIRED**, predicted **none** — My mom just called me and I heard her fall. She lives at 123 Applyberry Lane and has had previous medicial issues. PLEASE HURRY!

### third_party (6 wrong)

- `black_01` gold **False**, predicted **True** — One body found under collapsed masonry, no pulse for over 2 hours, unresponsive. Survivor 1 adult uninjured nearby.
- `hazmat_01` gold **False**, predicted **True** — Train derailment nearby, strong chlorine gas smell burning eyes and throat, 4 people vomiting and gasping for air.
- `yellow_07` gold **False**, predicted **True** — Bridge washed out behind our subdivision. 8 adults cut off from main road. Everyone uninjured, seeking supplies.
- `green_07` gold **False**, predicted **True** — Checking in for our block. 6 neighbors sheltering in church hall. Plenty of blankets and warm soup, no injuries whatsoever.
- `tricky_06` gold **False**, predicted **True** — Do not send ambulance, no one is hurt. Fire is 3 blocks away, not threatening our house. 5 adults here safe.
- `tricky_08` gold **False**, predicted **True** — Overturned tour bus on highway overpass with 25 adults and children injured, multiple people trapped in wreckage.

## Summary-line examples

| id | Gold | Predicted | ✓ |
|---|---|---|---|
| `flood_01` | Red · FLOOD · Trapped · 2 adults + 1 child · INSULIN | Red · FLOOD · Trapped · 2 adults + 1 child · INSULIN | ✓ |
| `flood_02` | Red · FLOOD · Trapped · 3 adults · HYPOTHERMIA | Red · HYPOTHERMIA_FREEZE · Exposed · 3 adults · HYPOTHERMIA | ✗ |
| `flood_03` | Red · FLOOD · Exposed · 2 adults + 2 children · PREGNANCY_INFANT | Red · FLOOD · Exposed · 2 adults + 2 children | ✗ |
| `flood_04` | Red · FLOOD · Trapped · 1 adult · OXYGEN | Red · CONTAMINATED_WATER · Trapped · 1 adult · OXYGEN | ✗ |
| `collapse_01` | Red · STRUCTURAL_COLLAPSE · Trapped · 2 adults · BLEEDING, MOBILITY_IMPAIRED | Red · STRUCTURAL_COLLAPSE · Trapped · 2 adults · BLEEDING, MOBILITY_IMPAIRED | ✓ |
| `collapse_02` | Red · STRUCTURAL_COLLAPSE · Trapped · 4 adults · PREGNANCY_INFANT | Red · STRUCTURAL_COLLAPSE · Trapped · 4 adults · PREGNANCY_INFANT | ✓ |
| `collapse_03` | Red · STRUCTURAL_COLLAPSE · Trapped · 1 adult + 1 child · OXYGEN | Red · STRUCTURAL_COLLAPSE · Trapped · 1 adult + 1 child · OXYGEN | ✓ |
| `fire_01` | Red · FIRE_SMOKE · Trapped · 2 adults · BURNS | Red · FIRE_SMOKE · Exposed · 2 adults · BURNS | ✗ |
| `fire_02` | Red · FIRE_SMOKE · Trapped · 2 adults · OXYGEN, MOBILITY_IMPAIRED | Red · FIRE_SMOKE · Exposed · 2 adults | ✗ |
| `yellow_01` | Yellow · EXTREME_WEATHER · Sheltered · 3 adults · MOBILITY_IMPAIRED | Yellow · STRUCTURAL_COLLAPSE · Exposed · 3 adults | ✗ |
| `yellow_02` | Yellow · FLOOD · Sheltered · 5 adults · CARDIAC | Yellow · FLOOD · Exposed · 5 adults · CARDIAC | ✗ |
| `yellow_03` | Yellow · STRUCTURAL_COLLAPSE · Sheltered · 2 adults + 1 child · MOBILITY_IMPAIRED | Green · EXTREME_WEATHER · Exposed · 2 adults + 1 child | ✗ |
| `yellow_04` | Yellow · HYPOTHERMIA_FREEZE · Sheltered · 2 adults + 1 child · PREGNANCY_INFANT | Yellow · HYPOTHERMIA_FREEZE · Exposed · 2 adults + 1 child · PREGNANCY_INFANT | ✗ |
| `green_01` | Green · ELECTRICAL_POWER · Sheltered · 4 adults | Green · CONTAMINATED_WATER · Sheltered · 4 adults | ✗ |
| `green_02` | Green · NONE · Sheltered · 2 adults | Green · STRUCTURAL_COLLAPSE · Sheltered · 2 adults | ✗ |
