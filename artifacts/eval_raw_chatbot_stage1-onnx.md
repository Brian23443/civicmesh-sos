# Evaluation — `stage1-onnx` on `raw_chatbot`

309 rows. On a 54-row set, one message ≈ 1.9 points of accuracy and one Red ≈ 3.6 points of Red recall — don't over-read small differences.

## Headline

| Metric | Value |
|---|---|
| **Red recall** | **94.3%** (99/105) |
| **Red precision** | **50.5%** (99/196) |
| **Whole-summary accuracy** | **2.9%** |
| Priority accuracy | 56.3% |
| Hazard accuracy | 58.9% |
| Status accuracy | 42.7% |
| Exact headcounts (adults and children) | 48.9% |
| Exact adults / exact children | 50.5% / 90.9% |
| Exact medical set | 67.3% |
| Medical F1 (micro) | 63.6% |
| Third-party accuracy | 77.3% |

## Priority confusion

| gold \ predicted | Minor | Delayed | Immediate | Deceased |
|---|---|---|---|---|
| **Minor** | 38 | 9 | 40 | 6 |
| **Delayed** | 14 | 17 | 42 | 3 |
| **Immediate** | 1 | 0 | 99 | 5 |
| **Deceased** | 0 | 0 | 15 | 20 |

## Status confusion

| gold \ predicted | Sheltered | Exposed | Trapped | Unknown |
|---|---|---|---|---|
| **Sheltered** | 36 | 77 | 13 | 0 |
| **Exposed** | 9 | 59 | 7 | 0 |
| **Trapped** | 12 | 19 | 37 | 0 |
| **Unknown** | 11 | 22 | 7 | 0 |

## Medical flags

| Flag | Recall | Precision | Hits | Missed | False alarms |
|---|---|---|---|---|---|
| INSULIN | 94.4% | 100.0% | 17 | 1 | 0 |
| OXYGEN | 31.4% | 100.0% | 11 | 24 | 0 |
| BLEEDING | 68.6% | 88.9% | 24 | 11 | 3 |
| HYPOTHERMIA | 83.3% | 83.3% | 10 | 2 | 2 |
| MOBILITY_IMPAIRED | 15.5% | 81.8% | 9 | 49 | 2 |
| CARDIAC | 33.3% | 87.5% | 7 | 14 | 1 |
| PREGNANCY_INFANT | 66.7% | 100.0% | 10 | 5 | 0 |
| BURNS | 88.2% | 88.2% | 15 | 2 | 2 |

## Top hazard confusions

| Gold | Predicted | Count |
|---|---|---|
| NONE | MEDICAL_CRISIS | 7 |
| TSUNAMI_SURGE | FLOOD | 6 |
| NONE | HAZMAT_GAS | 6 |
| NONE | STRUCTURAL_COLLAPSE | 5 |
| MEDICAL_CRISIS | HYPOTHERMIA_FREEZE | 5 |
| STRUCTURAL_COLLAPSE | MEDICAL_CRISIS | 5 |
| FLOOD | MEDICAL_CRISIS | 4 |
| EXTREME_WEATHER | STRUCTURAL_COLLAPSE | 4 |
| ELECTRICAL_POWER | MEDICAL_CRISIS | 4 |
| STRUCTURAL_COLLAPSE | EXTREME_WEATHER | 3 |

## Example errors (up to 25 per field)

### priority (135 wrong)

- `chat_chatbot_chatA_003` gold **Minor**, predicted **Immediate** — OMG OMG OMG MY DESIGNER BAG IS FLOATING DOWN 4TH AVE AND MY SHOES ARE RUINED PLEASE SOMEONE DO SOMETHING I AM SHAKING IN MY LIVING ROOM
- `chat_chatbot_chatA_006` gold **Deceased**, predicted **Immediate** — my brother called before his cell cut out. he is at 1420 maple ridge drive. ceiling collapsed on their bed. he says our elderly mom has no pulse and is cold to 
- `chat_chatbot_chatA_007` gold **Deceased**, predicted **Immediate** — mi hermana me llamo llorando desde colonia las palmas. hay un deslave de lodo sobre su casa. dice que su vecino don pedro quedo enterrado y no respira nada, ya 
- `chat_chatbot_chatA_009` gold **Minor**, predicted **Immediate** — basement flooded up to ankles, electric heater got wet but power is off. we are fine upstairs with dry clothes just need to know when power truck comes
- `chat_chatbot_chatA_012` gold **Delayed**, predicted **Immediate** — car stalled in rising wash out on county rd 12. water to doors not rising anymore. me and my teenage son inside. we got dry blankets and snacks, completely stab
- `chat_chatbot_chatA_014` gold **Delayed**, predicted **Immediate** — Tsunami siren sounded, surge hit first floor of hotel pacifico. We made it to 4th floor balcony. 3 adults 1 toddler. Toddler has high fever and diarrhea, crying
- `chat_chatbot_chatA_015` gold **Delayed**, predicted **Immediate** — tap water came out brown and smells like sour sulfur or gasoline. drank a sip before realizing. stomach hurts bad and throwing up violently, alone in apartment
- `chat_chatbot_chatA_018` gold **Minor**, predicted **Immediate** — Downed live wire sparking across our metal fence and sparking onto driveway. We are staying inside house, no fire, not touching anything outside, just reporting
- `chat_chatbot_chatA_023` gold **Minor**, predicted **Immediate** — I think there might be a gas leak outside the bodega at 12th and pine, smelling rotten eggs pretty strong while walking the dog. Nobody sick or coughing, just t
- `chat_chatbot_chatA_025` gold **Delayed**, predicted **Minor** — estamos atrapados en el segundo piso, el agua sigue subiendo y mi mama es diabetica necesita insulina que se quedo en la cocina inundada. ya son 10 horas sin me
- `chat_chatbot_chatA_027` gold **Minor**, predicted **Immediate** — THE WIND BLEW MY PATIO CHAIR INTO THE POOL AND THE POWER FLICKERED TWICE IM SO TERRIFIED WHAT IF THE ROOF FLIES OFF SEND NATIONAL GUARD PLEASE
- `chat_chatbot_chatA_028` gold **Delayed**, predicted **Immediate** — Looking through binoculars from my balcony on high ridge. House across the lake at 304 Shoreline Rd is completely underwater to eaves. Can see elderly couple si
- `chat_chatbot_chatA_029` gold **Delayed**, predicted **Immediate** — se cayo el puente viejo sobre el arroyo. vimos una camioneta caer. logramos sacar al chofer pero tiene pierna rota y golpe en la cabeza, esta consciente descans
- `chat_chatbot_chatA_034` gold **Immediate**, predicted **Minor** — my primo just texted me from his ranch near Rio Grande. 3 armed cartel guys took over their barn shooting rifles. one cousin shot in gut bleeding heavily uncons
- `chat_chatbot_chatA_035` gold **Minor**, predicted **Deceased** — ground opened up right across highway 9 near mile marker 14. sinkhole about 30 ft wide. traffic stopped both ways. no vehicles fell inside, everyone turned engi
- `chat_chatbot_chatA_036` gold **Delayed**, predicted **Minor** — Tsunami wave receded. We are stuck on third floor concrete parking structure. Car battery dead. 2 adults, 3 kids. Water clean in bottles. Nobody injured, just n
- `chat_chatbot_chatA_037` gold **Delayed**, predicted **Immediate** — heat dome index 112 outside. elderly lady in apt 2b ran out of drinking water yesterday. she is dizzy and weak but drinking tap water now with salt, staying in 
- `chat_chatbot_chatA_039` gold **Minor**, predicted **Deceased** — we thought my uncle had a heart attack during the tremor because he collapsed on the floor clutching his ribs. turned out he just tripped over the dog in the da
- `chat_chatbot_chatA_040` gold **Deceased**, predicted **Immediate** — submerged car upside down in canal near willow creek bridge. two occupants trapped inside underwater for over 20 minutes before bystanders arrived. pulled out o
- `chat_chatbot_chatA_041` gold **Minor**, predicted **Immediate** — smell bad chemicals coming from rail yard tank car behind cedar park elementary. eyes tearing up yellow residue on playground. no one playing outside, school ev
- `chat_chatbot_chatA_043` gold **Minor**, predicted **Immediate** — storm ripped off shingles and rain coming into attic insulation. our cats are super freaked out under the bed and we had to move our wedding photo albums into t
- `chat_chatbot_chatA_044` gold **Minor**, predicted **Immediate** — beehive fell out of fallen willow tree in back yard stung my cousin 4 times on arm. applied ice and baking soda paste. swelling going down, no allergy reaction,
- `chat_chatbot_chatA_045` gold **Minor**, predicted **Immediate** — city reservoir main broke dirty black silt coming out of taps. 14 people staying at church shelter. we have enough bottled gallon jugs for today but will need c
- `chat_chatbot_chatA_048` gold **Delayed**, predicted **Immediate** — hola por favor mi casa quedo aislada por el rio en camino real 55. somos 3 adultos y 2 ninos. tenemos comida seca y agua para dos dias. nadie herido solo no pod
- `chat_chatbot_chatA_051` gold **Deceased**, predicted **Immediate** — my brother sent audio from his apt on 4th st before his phone died. grease fire got out of control burned through stairs. says his roommate had third degree bur

### hazard (127 wrong)

- `chat_chatbot_chatA_001` gold **FLOOD**, predicted **HYPOTHERMIA_FREEZE** — WATER AT MY CHIN IN ATTIC ROOF VENT WONT BUDGE CANT SWIM 3 PPL HERE 2 KIDS
- `chat_chatbot_chatA_002` gold **STRUCTURAL_COLLAPSE**, predicted **EXTREME_WEATHER** — Hate to trouble anyone with everything going on, but a large oak branch fell through the roof onto my husband's chest. He stopped speaking and his lips look blu
- `chat_chatbot_chatA_003` gold **FLOOD**, predicted **HAZMAT_GAS** — OMG OMG OMG MY DESIGNER BAG IS FLOATING DOWN 4TH AVE AND MY SHOES ARE RUINED PLEASE SOMEONE DO SOMETHING I AM SHAKING IN MY LIVING ROOM
- `chat_chatbot_chatA_004` gold **FLOOD**, predicted **SINKHOLE_SUBSIDENCE** — water got up to the porch about an hour ago but it receded back to the ditch now. we had to kick a window out earlier to get grandma up high but neighbor pulled
- `chat_chatbot_chatA_007` gold **LANDSLIDE**, predicted **MEDICAL_CRISIS** — mi hermana me llamo llorando desde colonia las palmas. hay un deslave de lodo sobre su casa. dice que su vecino don pedro quedo enterrado y no respira nada, ya 
- `chat_chatbot_chatA_009` gold **FLOOD**, predicted **ELECTRICAL_POWER** — basement flooded up to ankles, electric heater got wet but power is off. we are fine upstairs with dry clothes just need to know when power truck comes
- `chat_chatbot_chatA_015` gold **CONTAMINATED_WATER**, predicted **HAZMAT_GAS** — tap water came out brown and smells like sour sulfur or gasoline. drank a sip before realizing. stomach hurts bad and throwing up violently, alone in apartment
- `chat_chatbot_chatA_021` gold **OTHER**, predicted **ACTIVE_VIOLENCE** — swarm of aggressive wild dogs cornered two hikers inside trail shelter near beacon rock. one has deep bite wound on leg not spurting. stuck inside cant leave tr
- `chat_chatbot_chatA_022` gold **NONE**, predicted **STRUCTURAL_COLLAPSE** — my neighbor mr carlson fell down cellar stairs. compound fracture bone sticking thru skin of left shin. bleeding controlled with clean towel. he is alert and ta
- `chat_chatbot_chatA_025` gold **FLOOD**, predicted **MEDICAL_CRISIS** — estamos atrapados en el segundo piso, el agua sigue subiendo y mi mama es diabetica necesita insulina que se quedo en la cocina inundada. ya son 10 horas sin me
- `chat_chatbot_chatA_029` gold **STRUCTURAL_COLLAPSE**, predicted **FIRE_SMOKE** — se cayo el puente viejo sobre el arroyo. vimos una camioneta caer. logramos sacar al chofer pero tiene pierna rota y golpe en la cabeza, esta consciente descans
- `chat_chatbot_chatA_031` gold **ELECTRICAL_POWER**, predicted **HYPOTHERMIA_FREEZE** — power went out 4 hours ago. fridge is warming up. is there ice distribution somewhere in ward 4? plenty of food and clean water here just worried about meat spo
- `chat_chatbot_chatA_036` gold **TSUNAMI_SURGE**, predicted **FLOOD** — Tsunami wave receded. We are stuck on third floor concrete parking structure. Car battery dead. 2 adults, 3 kids. Water clean in bottles. Nobody injured, just n
- `chat_chatbot_chatA_039` gold **NONE**, predicted **MEDICAL_CRISIS** — we thought my uncle had a heart attack during the tremor because he collapsed on the floor clutching his ribs. turned out he just tripped over the dog in the da
- `chat_chatbot_chatA_044` gold **OTHER**, predicted **HYPOTHERMIA_FREEZE** — beehive fell out of fallen willow tree in back yard stung my cousin 4 times on arm. applied ice and baking soda paste. swelling going down, no allergy reaction,
- `chat_chatbot_chatA_047` gold **ACTIVE_VIOLENCE**, predicted **ELECTRICAL_POWER** — my coworker phoned from downtown office tower. bomb or explosion on 12th floor. she is on 14th floor stairway blocked by smoke. she is with our boss who had a c
- `chat_chatbot_chatA_048` gold **FLOOD**, predicted **LANDSLIDE** — hola por favor mi casa quedo aislada por el rio en camino real 55. somos 3 adultos y 2 ninos. tenemos comida seca y agua para dos dias. nadie herido solo no pod
- `chat_chatbot_chatA_049` gold **MEDICAL_CRISIS**, predicted **HYPOTHERMIA_FREEZE** — chest tight cant breathe inhaler empty asthma attack getting worse turning blue sitting on porch
- `chat_chatbot_chatA_050` gold **NONE**, predicted **STRUCTURAL_COLLAPSE** — Saw a vehicle rollover 20 minutes ago on Route 9 by the stone bridge. Went down to check before fire crews arrive. Driver was thrown onto rocks, no signs of lif
- `chat_chatbot_chatA_051` gold **FIRE_SMOKE**, predicted **ELECTRICAL_POWER** — my brother sent audio from his apt on 4th st before his phone died. grease fire got out of control burned through stairs. says his roommate had third degree bur
- `chat_chatbot_chatA_052` gold **FIRE_SMOKE**, predicted **HAZMAT_GAS** — Sorry to bother emergency services, our woodstove pipe disconnected and the bedroom filled with dense fumes. My sister collapsed on the floor and is not waking 
- `chat_chatbot_chatA_054` gold **STRUCTURAL_COLLAPSE**, predicted **EXTREME_WEATHER** — roof caved in on kitchen earlier during peak gust but we crawled into hallway closet. storm wind died down completely now, walked over to neighbor house with do
- `chat_chatbot_chatA_055` gold **NONE**, predicted **HAZMAT_GAS** — I thought I smelled natural gas leaking near the meter at 714 Oak Avenue so I ran outside. Turned out city utility truck was just flushing the sewer line with d
- `chat_chatbot_chatA_056` gold **NONE**, predicted **MEDICAL_CRISIS** — called my elderly mother at 512 south pine st. she says our neighbor mr gomez had a heart attack on her porch during earthquake. she checked his neck and breath
- `chat_chatbot_chatA_057` gold **ACTIVE_VIOLENCE**, predicted **LANDSLIDE** — mi tia me mando mensaje desde su rancho en sonora. hubo tiroteo fuerte afuera de su cerca. vio a dos hombres tirados en el camino sin moverse desde hace tres ho

### status (177 wrong)

- `chat_chatbot_chatA_001` gold **Trapped**, predicted **Exposed** — WATER AT MY CHIN IN ATTIC ROOF VENT WONT BUDGE CANT SWIM 3 PPL HERE 2 KIDS
- `chat_chatbot_chatA_002` gold **Trapped**, predicted **Exposed** — Hate to trouble anyone with everything going on, but a large oak branch fell through the roof onto my husband's chest. He stopped speaking and his lips look blu
- `chat_chatbot_chatA_003` gold **Sheltered**, predicted **Trapped** — OMG OMG OMG MY DESIGNER BAG IS FLOATING DOWN 4TH AVE AND MY SHOES ARE RUINED PLEASE SOMEONE DO SOMETHING I AM SHAKING IN MY LIVING ROOM
- `chat_chatbot_chatA_004` gold **Sheltered**, predicted **Exposed** — water got up to the porch about an hour ago but it receded back to the ditch now. we had to kick a window out earlier to get grandma up high but neighbor pulled
- `chat_chatbot_chatA_005` gold **Sheltered**, predicted **Exposed** — there was a massive flash and loud pop, smelled smoke across the street at 842 elm st. ran over to check on mrs gable but it was just a squirrel hitting the tra
- `chat_chatbot_chatA_007` gold **Trapped**, predicted **Sheltered** — mi hermana me llamo llorando desde colonia las palmas. hay un deslave de lodo sobre su casa. dice que su vecino don pedro quedo enterrado y no respira nada, ya 
- `chat_chatbot_chatA_011` gold **Trapped**, predicted **Sheltered** — Active shooter outside corner bodega on Lincoln Ave. Guy came in with a rifle shot two clerks. Both bleeding on the floor behind counter conscious but losing bl
- `chat_chatbot_chatA_013` gold **Exposed**, predicted **Sheltered** — huge ground crater swallowed driveway and part of garage. no one fell in. house foundation looks cracked but we walked out to sidewalk with our luggage and parr
- `chat_chatbot_chatA_014` gold **Sheltered**, predicted **Exposed** — Tsunami siren sounded, surge hit first floor of hotel pacifico. We made it to 4th floor balcony. 3 adults 1 toddler. Toddler has high fever and diarrhea, crying
- `chat_chatbot_chatA_015` gold **Sheltered**, predicted **Exposed** — tap water came out brown and smells like sour sulfur or gasoline. drank a sip before realizing. stomach hurts bad and throwing up violently, alone in apartment
- `chat_chatbot_chatA_017` gold **Sheltered**, predicted **Exposed** — my aunt texted me from south hill. chlorine tank at the water plant ruptured green vapor rolling down valley toward her street. she says her eyes burn and she c
- `chat_chatbot_chatA_018` gold **Sheltered**, predicted **Exposed** — Downed live wire sparking across our metal fence and sparking onto driveway. We are staying inside house, no fire, not touching anything outside, just reporting
- `chat_chatbot_chatA_020` gold **Sheltered**, predicted **Exposed** — hail storm smashed back sunroof on subaru. got tiny glass cuts on fingers cleaned with alcohol wipe. storm passed now skies clearing
- `chat_chatbot_chatA_025` gold **Trapped**, predicted **Sheltered** — estamos atrapados en el segundo piso, el agua sigue subiendo y mi mama es diabetica necesita insulina que se quedo en la cocina inundada. ya son 10 horas sin me
- `chat_chatbot_chatA_027` gold **Sheltered**, predicted **Exposed** — THE WIND BLEW MY PATIO CHAIR INTO THE POOL AND THE POWER FLICKERED TWICE IM SO TERRIFIED WHAT IF THE ROOF FLIES OFF SEND NATIONAL GUARD PLEASE
- `chat_chatbot_chatA_030` gold **Sheltered**, predicted **Exposed** — I am terribly sorry if this ties up resources during the blizzard. My home generator sputtered out and my supplemental oxygen concentrator has about 12 minutes 
- `chat_chatbot_chatA_031` gold **Sheltered**, predicted **Exposed** — power went out 4 hours ago. fridge is warming up. is there ice distribution somewhere in ward 4? plenty of food and clean water here just worried about meat spo
- `chat_chatbot_chatA_032` gold **Trapped**, predicted **Exposed** — Mudslide swept down ravine behind school. Found 1 man buried under debris. Checked neck for carotid pulse for over 2 minutes, skin is stiff and cold, pupil dila
- `chat_chatbot_chatA_033` gold **Trapped**, predicted **Sheltered** — heavy smoke in hallway 3rd floor west building cant see exit doors 4 people here coughing spitting black soot
- `chat_chatbot_chatA_034` gold **Trapped**, predicted **Sheltered** — my primo just texted me from his ranch near Rio Grande. 3 armed cartel guys took over their barn shooting rifles. one cousin shot in gut bleeding heavily uncons
- `chat_chatbot_chatA_035` gold **Exposed**, predicted **Sheltered** — ground opened up right across highway 9 near mile marker 14. sinkhole about 30 ft wide. traffic stopped both ways. no vehicles fell inside, everyone turned engi
- `chat_chatbot_chatA_036` gold **Sheltered**, predicted **Exposed** — Tsunami wave receded. We are stuck on third floor concrete parking structure. Car battery dead. 2 adults, 3 kids. Water clean in bottles. Nobody injured, just n
- `chat_chatbot_chatA_037` gold **Sheltered**, predicted **Exposed** — heat dome index 112 outside. elderly lady in apt 2b ran out of drinking water yesterday. she is dizzy and weak but drinking tap water now with salt, staying in 
- `chat_chatbot_chatA_038` gold **Sheltered**, predicted **Exposed** — PARDON THE DISTURBANCE BUT WATER IS RUSHING THROUGH THE FRONT DOOR FRAME AND REACHING ELECTRIC OUTLETS CRACKLING LOUD SPARKING FAST
- `chat_chatbot_chatA_040` gold **Exposed**, predicted **Trapped** — submerged car upside down in canal near willow creek bridge. two occupants trapped inside underwater for over 20 minutes before bystanders arrived. pulled out o

### adults (153 wrong)

- `chat_chatbot_chatA_002` gold **2**, predicted **1** — Hate to trouble anyone with everything going on, but a large oak branch fell through the roof onto my husband's chest. He stopped speaking and his lips look blu
- `chat_chatbot_chatA_006` gold **2**, predicted **1** — my brother called before his cell cut out. he is at 1420 maple ridge drive. ceiling collapsed on their bed. he says our elderly mom has no pulse and is cold to 
- `chat_chatbot_chatA_007` gold **2**, predicted **1** — mi hermana me llamo llorando desde colonia las palmas. hay un deslave de lodo sobre su casa. dice que su vecino don pedro quedo enterrado y no respira nada, ya 
- `chat_chatbot_chatA_009` gold **2**, predicted **1** — basement flooded up to ankles, electric heater got wet but power is off. we are fine upstairs with dry clothes just need to know when power truck comes
- `chat_chatbot_chatA_010` gold **2**, predicted **1** — por favor help us mi abuelo is shivering uncontrollably lips blue soaked from storm cant stand up we are at corner of 5th and hidalgo
- `chat_chatbot_chatA_011` gold **3**, predicted **1** — Active shooter outside corner bodega on Lincoln Ave. Guy came in with a rifle shot two clerks. Both bleeding on the floor behind counter conscious but losing bl
- `chat_chatbot_chatA_012` gold **2**, predicted **1** — car stalled in rising wash out on county rd 12. water to doors not rising anymore. me and my teenage son inside. we got dry blankets and snacks, completely stab
- `chat_chatbot_chatA_013` gold **2**, predicted **1** — huge ground crater swallowed driveway and part of garage. no one fell in. house foundation looks cracked but we walked out to sidewalk with our luggage and parr
- `chat_chatbot_chatA_016` gold **2**, predicted **1** — HEAT IN APARTMENT IS 104 DEGREES ELDERLY DAD CONFUSED NOT SWEATING RED SKIN PASSED OUT ON FLOOR 88 YRS OLD
- `chat_chatbot_chatA_018` gold **2**, predicted **1** — Downed live wire sparking across our metal fence and sparking onto driveway. We are staying inside house, no fire, not touching anything outside, just reporting
- `chat_chatbot_chatA_019` gold **2**, predicted **1** — No disaster here just my sister went into labor 3 weeks early. contractions 2 mins apart baby head crowning right now in bedroom no ambulance responding
- `chat_chatbot_chatA_021` gold **2**, predicted **1** — swarm of aggressive wild dogs cornered two hikers inside trail shelter near beacon rock. one has deep bite wound on leg not spurting. stuck inside cant leave tr
- `chat_chatbot_chatA_022` gold **2**, predicted **1** — my neighbor mr carlson fell down cellar stairs. compound fracture bone sticking thru skin of left shin. bleeding controlled with clean towel. he is alert and ta
- `chat_chatbot_chatA_025` gold **2**, predicted **1** — estamos atrapados en el segundo piso, el agua sigue subiendo y mi mama es diabetica necesita insulina que se quedo en la cocina inundada. ya son 10 horas sin me
- `chat_chatbot_chatA_028` gold **2**, predicted **1** — Looking through binoculars from my balcony on high ridge. House across the lake at 304 Shoreline Rd is completely underwater to eaves. Can see elderly couple si
- `chat_chatbot_chatA_029` gold **2**, predicted **1** — se cayo el puente viejo sobre el arroyo. vimos una camioneta caer. logramos sacar al chofer pero tiene pierna rota y golpe en la cabeza, esta consciente descans
- `chat_chatbot_chatA_032` gold **2**, predicted **1** — Mudslide swept down ravine behind school. Found 1 man buried under debris. Checked neck for carotid pulse for over 2 minutes, skin is stiff and cold, pupil dila
- `chat_chatbot_chatA_034` gold **2**, predicted **1** — my primo just texted me from his ranch near Rio Grande. 3 armed cartel guys took over their barn shooting rifles. one cousin shot in gut bleeding heavily uncons
- `chat_chatbot_chatA_039` gold **2**, predicted **1** — we thought my uncle had a heart attack during the tremor because he collapsed on the floor clutching his ribs. turned out he just tripped over the dog in the da
- `chat_chatbot_chatA_040` gold **2**, predicted **1** — submerged car upside down in canal near willow creek bridge. two occupants trapped inside underwater for over 20 minutes before bystanders arrived. pulled out o
- `chat_chatbot_chatA_042` gold **2**, predicted **1** — my grandpa 82 has crushing chest pain radiating down left arm sweating profusely nausea started 15 min ago sitting on couch. history of bypass surgery.
- `chat_chatbot_chatA_043` gold **2**, predicted **1** — storm ripped off shingles and rain coming into attic insulation. our cats are super freaked out under the bed and we had to move our wedding photo albums into t
- `chat_chatbot_chatA_044` gold **2**, predicted **1** — beehive fell out of fallen willow tree in back yard stung my cousin 4 times on arm. applied ice and baking soda paste. swelling going down, no allergy reaction,
- `chat_chatbot_chatA_045` gold **10**, predicted **14** — city reservoir main broke dirty black silt coming out of taps. 14 people staying at church shelter. we have enough bottled gallon jugs for today but will need c
- `chat_chatbot_chatA_046` gold **2**, predicted **1** — car crashed into ditch in blizzard near junction 88. heater broke, temp 4 below zero. my wife is 8 months pregnant and shivering violently feet numb lips purple

### children (28 wrong)

- `chat_chatbot_chatA_012` gold **0**, predicted **1** — car stalled in rising wash out on county rd 12. water to doors not rising anymore. me and my teenage son inside. we got dry blankets and snacks, completely stab
- `chat_chatbot_chatA_014` gold **1**, predicted **2** — Tsunami siren sounded, surge hit first floor of hotel pacifico. We made it to 4th floor balcony. 3 adults 1 toddler. Toddler has high fever and diarrhea, crying
- `chat_chatbot_chatA_019` gold **0**, predicted **2** — No disaster here just my sister went into labor 3 weeks early. contractions 2 mins apart baby head crowning right now in bedroom no ambulance responding
- `chat_chatbot_chatA_025` gold **0**, predicted **1** — estamos atrapados en el segundo piso, el agua sigue subiendo y mi mama es diabetica necesita insulina que se quedo en la cocina inundada. ya son 10 horas sin me
- `chat_chatbot_chatA_045` gold **4**, predicted **0** — city reservoir main broke dirty black silt coming out of taps. 14 people staying at church shelter. we have enough bottled gallon jugs for today but will need c
- `chat_chatbot_chatA_064` gold **2**, predicted **3** — surge from hurricane flooded first floor of complex. me and neighbor took our 2 kids to 3rd floor landing. my diabetic son 8 has only one insulin dose left in p
- `chat_chatbot_chatA_067` gold **0**, predicted **1** — my daughter called from her dorm near north campus. tanker spill on highway leaking ammonia cloud into dorm quad. her eyes burning and throat closing up struggl
- `chat_chatbot_chatA_079` gold **1**, predicted **0** — el terremoto tiro la barda del corral y mato una vaca pero mi familia y yo salimos al patio a tiempo. la casa tiene grietas pero estamos todos bien sin heridas.
- `chat_chatbot_chatA_089` gold **2**, predicted **0** — we were trapped inside church basement by downed elm tree across doors but fire crew sawed trunk ten minutes ago. all 8 of us walked out fine, going home now.
- `chat_chatbot_chatA_095` gold **1**, predicted **0** — flood water entered city treatment basins, tap water running muddy brown and smells foul. neighborhood has 20 cases of bottled water left. no one sick yet, need
- `chat_chatbot_chatA_117` gold **0**, predicted **1** — my daughter called from her lab at east tech campus. cylinder valve sheared off venting dense chlorine cloud. she escaped to second floor office but her lab par
- `chat_chatbot_chatA_120` gold **2**, predicted **1** — thunderstorm blew metal patio awning into garden bed. broke three flower pots and bent my prized rose trellis. wife and kids inside playing monopoly, zero injur
- `chat_chatbot_chatA_131` gold **2**, predicted **1** — tree limb took down electric service loop to garage. breaker tripped instantly. main house has auxiliary generator humming along nicely, plenty of milk and cere
- `chat_chatbot_chatA_143` gold **1**, predicted **0** — gust of wind blew over portable dog kennel in side yard and scattered bags of mulch across lawn. our golden retriever chased a raccoon up the fence. all family 
- `chat_chatbot_chatA_164` gold **1**, predicted **2** — tsunami backwash receded leaving marina dock stranded on mud flat. four adults and one infant sheltering inside harbormaster second floor office. drinking water
- `chat_chatbot_chatA_169` gold **0**, predicted **1** — medical crisis at home no storm or flooding. 29 year old woman at 39 weeks gestation in active precipitous labor, baby crowning right now, umbilical cord visibl
- `chat_chatbot_chatA_170` gold **1**, predicted **0** — high wind gust tore gutter loose from east eave and rattled tin awning. patio umbrella blew into neighbor shrubbery. dog barked at thunder but family all uninju
- `chat_chatbot_chatA_179` gold **1**, predicted **0** — el temblor tiro los trastes de la repisa y quebro una maceta en el patio. revisamos las paredes de adobe y no tienen cuarteaduras. toda la familia esta afuera s
- `chat_chatbot_chatA_186` gold **2**, predicted **3** — storm surge water receded from ocean drive leaving sand drifts. three adults and two infants sheltering in second floor condo. ample clean bottled water and inf
- `chat_chatbot_chatA_193` gold **1**, predicted **0** — gust of wind blew over decorative plastic flamingo and scattered recycling bin across driveway. our beagle barked at the flying plastic bottles. everyone inside
- `chat_chatbot_chatB_027` gold **2**, predicted **3** — hola please send somebody over to oak ridge my sister called crying her roof completely caved from the quake she is trapped in the crawlspace with two small chi
- `chat_chatbot_chatB_031` gold **0**, predicted **1** — we tried driving across the dip near the old sawmill which was dumb i know because my subaru stalled out immediately the brown river current is already over the
- `chat_chatbot_chatB_037` gold **0**, predicted **1** — we were cleaning up tree branches after the tornado passed through the subdivision my teenage daughter caught a rusty corrugated iron sheet against her forearm 
- `chat_chatbot_chatC_032` gold **1**, predicted **0** — basement wall caved in during rainstorm we are stuck down here under floor timbers air is clear water shut off but exit totally blocked
- `chat_chatbot_chatC_033` gold **2**, predicted **0** — attic hatch jammed shut flood water already at second floor ceiling we hear them pounding from inside roof space cannot break through shingles

### medical (101 wrong)

- `chat_chatbot_chatA_002` gold **OXYGEN, MOBILITY_IMPAIRED**, predicted **none** — Hate to trouble anyone with everything going on, but a large oak branch fell through the roof onto my husband's chest. He stopped speaking and his lips look blu
- `chat_chatbot_chatA_006` gold **MOBILITY_IMPAIRED**, predicted **none** — my brother called before his cell cut out. he is at 1420 maple ridge drive. ceiling collapsed on their bed. he says our elderly mom has no pulse and is cold to 
- `chat_chatbot_chatA_007` gold **MOBILITY_IMPAIRED**, predicted **none** — mi hermana me llamo llorando desde colonia las palmas. hay un deslave de lodo sobre su casa. dice que su vecino don pedro quedo enterrado y no respira nada, ya 
- `chat_chatbot_chatA_008` gold **OXYGEN, BURNS**, predicted **BURNS** — flames crossed broadway near shell gas station. 2 adults stuck on roof surrounded by black smoke coughing blood burns on arms
- `chat_chatbot_chatA_010` gold **HYPOTHERMIA, MOBILITY_IMPAIRED**, predicted **HYPOTHERMIA** — por favor help us mi abuelo is shivering uncontrollably lips blue soaked from storm cant stand up we are at corner of 5th and hidalgo
- `chat_chatbot_chatA_014` gold **PREGNANCY_INFANT**, predicted **none** — Tsunami siren sounded, surge hit first floor of hotel pacifico. We made it to 4th floor balcony. 3 adults 1 toddler. Toddler has high fever and diarrhea, crying
- `chat_chatbot_chatA_016` gold **MOBILITY_IMPAIRED**, predicted **none** — HEAT IN APARTMENT IS 104 DEGREES ELDERLY DAD CONFUSED NOT SWEATING RED SKIN PASSED OUT ON FLOOR 88 YRS OLD
- `chat_chatbot_chatA_017` gold **OXYGEN**, predicted **none** — my aunt texted me from south hill. chlorine tank at the water plant ruptured green vapor rolling down valley toward her street. she says her eyes burn and she c
- `chat_chatbot_chatA_021` gold **BLEEDING, MOBILITY_IMPAIRED**, predicted **none** — swarm of aggressive wild dogs cornered two hikers inside trail shelter near beacon rock. one has deep bite wound on leg not spurting. stuck inside cant leave tr
- `chat_chatbot_chatA_022` gold **BLEEDING, MOBILITY_IMPAIRED**, predicted **BLEEDING** — my neighbor mr carlson fell down cellar stairs. compound fracture bone sticking thru skin of left shin. bleeding controlled with clean towel. he is alert and ta
- `chat_chatbot_chatA_024` gold **BLEEDING, MOBILITY_IMPAIRED**, predicted **none** — crush injury from collapsed concrete slab at west warehouse. worker trapped from waist down. pale, thready pulse, crushed pelvis, heavy blood pool forming under
- `chat_chatbot_chatA_026` gold **MOBILITY_IMPAIRED**, predicted **none** — not sure if this line works. tree smashed through roof into living room. my daughter 7 has crushed arm under heavy timber. she was crying now she won't wake up 
- `chat_chatbot_chatA_029` gold **MOBILITY_IMPAIRED**, predicted **none** — se cayo el puente viejo sobre el arroyo. vimos una camioneta caer. logramos sacar al chofer pero tiene pierna rota y golpe en la cabeza, esta consciente descans
- `chat_chatbot_chatA_032` gold **MOBILITY_IMPAIRED**, predicted **none** — Mudslide swept down ravine behind school. Found 1 man buried under debris. Checked neck for carotid pulse for over 2 minutes, skin is stiff and cold, pupil dila
- `chat_chatbot_chatA_033` gold **OXYGEN**, predicted **none** — heavy smoke in hallway 3rd floor west building cant see exit doors 4 people here coughing spitting black soot
- `chat_chatbot_chatA_037` gold **MOBILITY_IMPAIRED**, predicted **none** — heat dome index 112 outside. elderly lady in apt 2b ran out of drinking water yesterday. she is dizzy and weak but drinking tap water now with salt, staying in 
- `chat_chatbot_chatA_039` gold **none**, predicted **CARDIAC** — we thought my uncle had a heart attack during the tremor because he collapsed on the floor clutching his ribs. turned out he just tripped over the dog in the da
- `chat_chatbot_chatA_047` gold **OXYGEN, CARDIAC**, predicted **CARDIAC** — my coworker phoned from downtown office tower. bomb or explosion on 12th floor. she is on 14th floor stairway blocked by smoke. she is with our boss who had a c
- `chat_chatbot_chatA_050` gold **BLEEDING**, predicted **none** — Saw a vehicle rollover 20 minutes ago on Route 9 by the stone bridge. Went down to check before fire crews arrive. Driver was thrown onto rocks, no signs of lif
- `chat_chatbot_chatA_052` gold **OXYGEN**, predicted **none** — Sorry to bother emergency services, our woodstove pipe disconnected and the bedroom filled with dense fumes. My sister collapsed on the floor and is not waking 
- `chat_chatbot_chatA_058` gold **OXYGEN, MOBILITY_IMPAIRED**, predicted **MOBILITY_IMPAIRED** — ceiling joist snapped pinned my legs to mattress floor below filled with smoke cant push timber off losing strength coughing up black phlegm
- `chat_chatbot_chatA_066` gold **MOBILITY_IMPAIRED**, predicted **none** — HEAT IN TRAILER IS UNBEARABLE AUNTIE 74 COLLAPSED ON LINOLEUM BREATHING VERY FAST WEAK THREAD PULSE SKIN RED HOT NO AIR CONDITIONING
- `chat_chatbot_chatA_067` gold **OXYGEN**, predicted **none** — my daughter called from her dorm near north campus. tanker spill on highway leaking ammonia cloud into dorm quad. her eyes burning and throat closing up struggl
- `chat_chatbot_chatA_069` gold **BLEEDING**, predicted **none** — no weather problem here. 24 yr old friend fell from ladder onto iron railing. deep puncture in thigh pumping dark red blood soaked 3 towels rapidly turning pale
- `chat_chatbot_chatA_071` gold **MOBILITY_IMPAIRED**, predicted **none** — two of us stuck on ledge on bluff above river after rockslide wiped trail. friend dislocated shoulder and sprained ankle. safe from rockfall now, have water and

### third_party (70 wrong)

- `chat_chatbot_chatA_004` gold **False**, predicted **True** — water got up to the porch about an hour ago but it receded back to the ditch now. we had to kick a window out earlier to get grandma up high but neighbor pulled
- `chat_chatbot_chatA_005` gold **False**, predicted **True** — there was a massive flash and loud pop, smelled smoke across the street at 842 elm st. ran over to check on mrs gable but it was just a squirrel hitting the tra
- `chat_chatbot_chatA_007` gold **True**, predicted **False** — mi hermana me llamo llorando desde colonia las palmas. hay un deslave de lodo sobre su casa. dice que su vecino don pedro quedo enterrado y no respira nada, ya 
- `chat_chatbot_chatA_017` gold **True**, predicted **False** — my aunt texted me from south hill. chlorine tank at the water plant ruptured green vapor rolling down valley toward her street. she says her eyes burn and she c
- `chat_chatbot_chatA_032` gold **False**, predicted **True** — Mudslide swept down ravine behind school. Found 1 man buried under debris. Checked neck for carotid pulse for over 2 minutes, skin is stiff and cold, pupil dila
- `chat_chatbot_chatA_034` gold **True**, predicted **False** — my primo just texted me from his ranch near Rio Grande. 3 armed cartel guys took over their barn shooting rifles. one cousin shot in gut bleeding heavily uncons
- `chat_chatbot_chatA_037` gold **True**, predicted **False** — heat dome index 112 outside. elderly lady in apt 2b ran out of drinking water yesterday. she is dizzy and weak but drinking tap water now with salt, staying in 
- `chat_chatbot_chatA_040` gold **False**, predicted **True** — submerged car upside down in canal near willow creek bridge. two occupants trapped inside underwater for over 20 minutes before bystanders arrived. pulled out o
- `chat_chatbot_chatA_041` gold **False**, predicted **True** — smell bad chemicals coming from rail yard tank car behind cedar park elementary. eyes tearing up yellow residue on playground. no one playing outside, school ev
- `chat_chatbot_chatA_045` gold **False**, predicted **True** — city reservoir main broke dirty black silt coming out of taps. 14 people staying at church shelter. we have enough bottled gallon jugs for today but will need c
- `chat_chatbot_chatA_047` gold **True**, predicted **False** — my coworker phoned from downtown office tower. bomb or explosion on 12th floor. she is on 14th floor stairway blocked by smoke. she is with our boss who had a c
- `chat_chatbot_chatA_050` gold **False**, predicted **True** — Saw a vehicle rollover 20 minutes ago on Route 9 by the stone bridge. Went down to check before fire crews arrive. Driver was thrown onto rocks, no signs of lif
- `chat_chatbot_chatA_051` gold **True**, predicted **False** — my brother sent audio from his apt on 4th st before his phone died. grease fire got out of control burned through stairs. says his roommate had third degree bur
- `chat_chatbot_chatA_055` gold **False**, predicted **True** — I thought I smelled natural gas leaking near the meter at 714 Oak Avenue so I ran outside. Turned out city utility truck was just flushing the sewer line with d
- `chat_chatbot_chatA_057` gold **True**, predicted **False** — mi tia me mando mensaje desde su rancho en sonora. hubo tiroteo fuerte afuera de su cerca. vio a dos hombres tirados en el camino sin moverse desde hace tres ho
- `chat_chatbot_chatA_060` gold **False**, predicted **True** — ayuda por favor mi mama is in deep diabetic shock here at 22 west street unconscious breathing shallow ran out of insulin bottles yesterday
- `chat_chatbot_chatA_067` gold **True**, predicted **False** — my daughter called from her dorm near north campus. tanker spill on highway leaking ammonia cloud into dorm quad. her eyes burning and throat closing up struggl
- `chat_chatbot_chatA_076` gold **False**, predicted **True** — wall collapsed onto neighbor bed next door during mudslide. I dug out her torso but her pulse stopped 15 minutes ago, skin purple and pupils fixed. 1 dead adult
- `chat_chatbot_chatA_078` gold **True**, predicted **False** — Looking through scope from hill overlooking lower valley road. Farmhouse completely encircled by swift brown flood waters. 2 people visible waving towels from h
- `chat_chatbot_chatA_084` gold **True**, predicted **False** — my brother texted from border warehouse near Laredo. armed men breached gates shooting automatic weapons. 1 worker shot in abdomen heavy bleeding on concrete fl
- `chat_chatbot_chatA_085` gold **False**, predicted **True** — massive sinkhole opened beneath westbound lane of interstate 80 near exit 15. road closed by state troopers. three cars pulled over safely on shoulder, no vehic
- `chat_chatbot_chatA_089` gold **False**, predicted **True** — we were trapped inside church basement by downed elm tree across doors but fire crew sawed trunk ten minutes ago. all 8 of us walked out fine, going home now.
- `chat_chatbot_chatA_090` gold **True**, predicted **False** — saw through binoculars a fishing boat capsized in surf near lighthouse rocks. two men washed ashore, neither moving for 30 minutes, chest not rising, face down 
- `chat_chatbot_chatA_092` gold **False**, predicted **True** — my pregnant wife 38 weeks fell on wet ice outside clinic on 3rd st. severe sudden abdominal pain heavy vaginal bleeding contractions every minute unable to stan
- `chat_chatbot_chatA_097` gold **True**, predicted **False** — my coworker at downtown bank called. armed robber shot security guard in chest point blank. guard bleeding heavily slumped behind security desk fading fast.

## Summary-line examples

| id | Gold | Predicted | ✓ |
|---|---|---|---|
| `chat_chatbot_chatA_001` | Red · FLOOD · Trapped · 1 adult + 2 children | Red · HYPOTHERMIA_FREEZE · Exposed · 1 adult + 2 children | ✗ |
| `chat_chatbot_chatA_002` | Red · STRUCTURAL_COLLAPSE · Trapped · 2 adults · OXYGEN, MOBILITY_IMPAIRED | Red · EXTREME_WEATHER · Exposed · 1 adult | ✗ |
| `chat_chatbot_chatA_003` | Green · FLOOD · Sheltered · 1 adult | Red · HAZMAT_GAS · Trapped · 1 adult | ✗ |
| `chat_chatbot_chatA_004` | Green · FLOOD · Sheltered · 4 adults | Green · SINKHOLE_SUBSIDENCE · Exposed · 4 adults | ✗ |
| `chat_chatbot_chatA_005` | Green · NONE · Sheltered · 1 adult | Green · NONE · Exposed · 1 adult | ✗ |
| `chat_chatbot_chatA_006` | Black · STRUCTURAL_COLLAPSE · Trapped · 2 adults · MOBILITY_IMPAIRED | Red · STRUCTURAL_COLLAPSE · Trapped · 1 adult | ✗ |
| `chat_chatbot_chatA_007` | Black · LANDSLIDE · Trapped · 2 adults · MOBILITY_IMPAIRED | Red · MEDICAL_CRISIS · Sheltered · 1 adult | ✗ |
| `chat_chatbot_chatA_008` | Red · FIRE_SMOKE · Exposed · 2 adults · OXYGEN, BURNS | Red · FIRE_SMOKE · Exposed · 2 adults · BURNS | ✗ |
| `chat_chatbot_chatA_009` | Green · FLOOD · Sheltered · 2 adults | Red · ELECTRICAL_POWER · Sheltered · 1 adult | ✗ |
| `chat_chatbot_chatA_010` | Red · HYPOTHERMIA_FREEZE · Exposed · 2 adults · HYPOTHERMIA, MOBILITY_IMPAIRED | Red · HYPOTHERMIA_FREEZE · Exposed · 1 adult · HYPOTHERMIA | ✗ |
| `chat_chatbot_chatA_011` | Red · ACTIVE_VIOLENCE · Trapped · 3 adults · BLEEDING | Red · ACTIVE_VIOLENCE · Sheltered · 1 adult · BLEEDING | ✗ |
| `chat_chatbot_chatA_012` | Yellow · FLOOD · Exposed · 2 adults | Red · FLOOD · Exposed · 1 adult + 1 child | ✗ |
| `chat_chatbot_chatA_013` | Green · SINKHOLE_SUBSIDENCE · Exposed · 2 adults | Green · SINKHOLE_SUBSIDENCE · Sheltered · 1 adult | ✗ |
| `chat_chatbot_chatA_014` | Yellow · TSUNAMI_SURGE · Sheltered · 3 adults + 1 child · PREGNANCY_INFANT | Red · TSUNAMI_SURGE · Exposed · 3 adults + 2 children | ✗ |
| `chat_chatbot_chatA_015` | Yellow · CONTAMINATED_WATER · Sheltered · 1 adult | Red · HAZMAT_GAS · Exposed · 1 adult | ✗ |
