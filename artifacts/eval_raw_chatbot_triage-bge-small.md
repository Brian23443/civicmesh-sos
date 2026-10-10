# Evaluation — `models/triage-bge-small` on `raw_chatbot`

309 rows. On a 54-row set, one message ≈ 1.9 points of accuracy and one Red ≈ 3.6 points of Red recall — don't over-read small differences.

## Headline

| Metric | Value |
|---|---|
| **Red recall** | **98.1%** (103/105) |
| **Red precision** | **52.3%** (103/197) |
| **Whole-summary accuracy** | **15.9%** |
| Priority accuracy | 60.2% |
| Hazard accuracy | 64.4% |
| Status accuracy | 62.5% |
| Exact headcounts (adults and children) | 65.0% |
| Exact adults / exact children | 70.2% / 90.9% |
| Exact medical set | 75.1% |
| Medical F1 (micro) | 78.1% |
| Third-party accuracy | 88.7% |

## Priority confusion

| gold \ predicted | Minor | Delayed | Immediate | Deceased |
|---|---|---|---|---|
| **Minor** | 63 | 7 | 22 | 1 |
| **Delayed** | 17 | 10 | 48 | 1 |
| **Immediate** | 0 | 2 | 103 | 0 |
| **Deceased** | 0 | 1 | 24 | 10 |

## Status confusion

| gold \ predicted | Sheltered | Exposed | Trapped | Unknown |
|---|---|---|---|---|
| **Sheltered** | 73 | 24 | 16 | 13 |
| **Exposed** | 12 | 49 | 10 | 4 |
| **Trapped** | 1 | 15 | 51 | 1 |
| **Unknown** | 3 | 10 | 7 | 20 |

## Medical flags

| Flag | Recall | Precision | Hits | Missed | False alarms |
|---|---|---|---|---|---|
| INSULIN | 100.0% | 100.0% | 18 | 0 | 0 |
| OXYGEN | 77.1% | 58.7% | 27 | 8 | 19 |
| BLEEDING | 82.9% | 85.3% | 29 | 6 | 5 |
| HYPOTHERMIA | 100.0% | 80.0% | 12 | 0 | 3 |
| MOBILITY_IMPAIRED | 60.3% | 77.8% | 35 | 23 | 10 |
| CARDIAC | 81.0% | 63.0% | 17 | 4 | 10 |
| PREGNANCY_INFANT | 86.7% | 100.0% | 13 | 2 | 0 |
| BURNS | 100.0% | 81.0% | 17 | 0 | 4 |

## Top hazard confusions

| Gold | Predicted | Count |
|---|---|---|
| NONE | STRUCTURAL_COLLAPSE | 7 |
| NONE | MEDICAL_CRISIS | 6 |
| SINKHOLE_SUBSIDENCE | LANDSLIDE | 5 |
| TSUNAMI_SURGE | FLOOD | 4 |
| STRUCTURAL_COLLAPSE | EXTREME_WEATHER | 4 |
| OTHER | EXTREME_WEATHER | 4 |
| NONE | HAZMAT_GAS | 4 |
| MEDICAL_CRISIS | FIRE_SMOKE | 4 |
| LANDSLIDE | STRUCTURAL_COLLAPSE | 3 |
| TSUNAMI_SURGE | LANDSLIDE | 3 |

## Example errors (up to 25 per field)

### priority (123 wrong)

- `chat_chatbot_chatA_003` gold **Minor**, predicted **Immediate** — OMG OMG OMG MY DESIGNER BAG IS FLOATING DOWN 4TH AVE AND MY SHOES ARE RUINED PLEASE SOMEONE DO SOMETHING I AM SHAKING IN MY LIVING ROOM
- `chat_chatbot_chatA_004` gold **Minor**, predicted **Delayed** — water got up to the porch about an hour ago but it receded back to the ditch now. we had to kick a window out earlier to get grandma up high but neighbor pulled
- `chat_chatbot_chatA_006` gold **Deceased**, predicted **Immediate** — my brother called before his cell cut out. he is at 1420 maple ridge drive. ceiling collapsed on their bed. he says our elderly mom has no pulse and is cold to 
- `chat_chatbot_chatA_007` gold **Deceased**, predicted **Immediate** — mi hermana me llamo llorando desde colonia las palmas. hay un deslave de lodo sobre su casa. dice que su vecino don pedro quedo enterrado y no respira nada, ya 
- `chat_chatbot_chatA_012` gold **Delayed**, predicted **Minor** — car stalled in rising wash out on county rd 12. water to doors not rising anymore. me and my teenage son inside. we got dry blankets and snacks, completely stab
- `chat_chatbot_chatA_014` gold **Delayed**, predicted **Immediate** — Tsunami siren sounded, surge hit first floor of hotel pacifico. We made it to 4th floor balcony. 3 adults 1 toddler. Toddler has high fever and diarrhea, crying
- `chat_chatbot_chatA_015` gold **Delayed**, predicted **Immediate** — tap water came out brown and smells like sour sulfur or gasoline. drank a sip before realizing. stomach hurts bad and throwing up violently, alone in apartment
- `chat_chatbot_chatA_021` gold **Delayed**, predicted **Immediate** — swarm of aggressive wild dogs cornered two hikers inside trail shelter near beacon rock. one has deep bite wound on leg not spurting. stuck inside cant leave tr
- `chat_chatbot_chatA_022` gold **Delayed**, predicted **Immediate** — my neighbor mr carlson fell down cellar stairs. compound fracture bone sticking thru skin of left shin. bleeding controlled with clean towel. he is alert and ta
- `chat_chatbot_chatA_023` gold **Minor**, predicted **Immediate** — I think there might be a gas leak outside the bodega at 12th and pine, smelling rotten eggs pretty strong while walking the dog. Nobody sick or coughing, just t
- `chat_chatbot_chatA_025` gold **Delayed**, predicted **Immediate** — estamos atrapados en el segundo piso, el agua sigue subiendo y mi mama es diabetica necesita insulina que se quedo en la cocina inundada. ya son 10 horas sin me
- `chat_chatbot_chatA_027` gold **Minor**, predicted **Immediate** — THE WIND BLEW MY PATIO CHAIR INTO THE POOL AND THE POWER FLICKERED TWICE IM SO TERRIFIED WHAT IF THE ROOF FLIES OFF SEND NATIONAL GUARD PLEASE
- `chat_chatbot_chatA_028` gold **Delayed**, predicted **Immediate** — Looking through binoculars from my balcony on high ridge. House across the lake at 304 Shoreline Rd is completely underwater to eaves. Can see elderly couple si
- `chat_chatbot_chatA_029` gold **Delayed**, predicted **Immediate** — se cayo el puente viejo sobre el arroyo. vimos una camioneta caer. logramos sacar al chofer pero tiene pierna rota y golpe en la cabeza, esta consciente descans
- `chat_chatbot_chatA_032` gold **Deceased**, predicted **Immediate** — Mudslide swept down ravine behind school. Found 1 man buried under debris. Checked neck for carotid pulse for over 2 minutes, skin is stiff and cold, pupil dila
- `chat_chatbot_chatA_035` gold **Minor**, predicted **Immediate** — ground opened up right across highway 9 near mile marker 14. sinkhole about 30 ft wide. traffic stopped both ways. no vehicles fell inside, everyone turned engi
- `chat_chatbot_chatA_037` gold **Delayed**, predicted **Minor** — heat dome index 112 outside. elderly lady in apt 2b ran out of drinking water yesterday. she is dizzy and weak but drinking tap water now with salt, staying in 
- `chat_chatbot_chatA_039` gold **Minor**, predicted **Delayed** — we thought my uncle had a heart attack during the tremor because he collapsed on the floor clutching his ribs. turned out he just tripped over the dog in the da
- `chat_chatbot_chatA_040` gold **Deceased**, predicted **Immediate** — submerged car upside down in canal near willow creek bridge. two occupants trapped inside underwater for over 20 minutes before bystanders arrived. pulled out o
- `chat_chatbot_chatA_041` gold **Minor**, predicted **Immediate** — smell bad chemicals coming from rail yard tank car behind cedar park elementary. eyes tearing up yellow residue on playground. no one playing outside, school ev
- `chat_chatbot_chatA_048` gold **Delayed**, predicted **Immediate** — hola por favor mi casa quedo aislada por el rio en camino real 55. somos 3 adultos y 2 ninos. tenemos comida seca y agua para dos dias. nadie herido solo no pod
- `chat_chatbot_chatA_050` gold **Deceased**, predicted **Immediate** — Saw a vehicle rollover 20 minutes ago on Route 9 by the stone bridge. Went down to check before fire crews arrive. Driver was thrown onto rocks, no signs of lif
- `chat_chatbot_chatA_051` gold **Deceased**, predicted **Immediate** — my brother sent audio from his apt on 4th st before his phone died. grease fire got out of control burned through stairs. says his roommate had third degree bur
- `chat_chatbot_chatA_053` gold **Minor**, predicted **Immediate** — OH MY GOD THERE IS A HUGE TREE BRANCH IN MY DRIVEWAY BLOCKING MY MERCEDES I HAVE AN APPOINTMENT AT NOON PLEASE SEND CRANE IMMEDIATELY
- `chat_chatbot_chatA_054` gold **Minor**, predicted **Delayed** — roof caved in on kitchen earlier during peak gust but we crawled into hallway closet. storm wind died down completely now, walked over to neighbor house with do

### hazard (110 wrong)

- `chat_chatbot_chatA_003` gold **FLOOD**, predicted **STRUCTURAL_COLLAPSE** — OMG OMG OMG MY DESIGNER BAG IS FLOATING DOWN 4TH AVE AND MY SHOES ARE RUINED PLEASE SOMEONE DO SOMETHING I AM SHAKING IN MY LIVING ROOM
- `chat_chatbot_chatA_005` gold **NONE**, predicted **FIRE_SMOKE** — there was a massive flash and loud pop, smelled smoke across the street at 842 elm st. ran over to check on mrs gable but it was just a squirrel hitting the tra
- `chat_chatbot_chatA_007` gold **LANDSLIDE**, predicted **STRUCTURAL_COLLAPSE** — mi hermana me llamo llorando desde colonia las palmas. hay un deslave de lodo sobre su casa. dice que su vecino don pedro quedo enterrado y no respira nada, ya 
- `chat_chatbot_chatA_010` gold **HYPOTHERMIA_FREEZE**, predicted **EXTREME_WEATHER** — por favor help us mi abuelo is shivering uncontrollably lips blue soaked from storm cant stand up we are at corner of 5th and hidalgo
- `chat_chatbot_chatA_013` gold **SINKHOLE_SUBSIDENCE**, predicted **LANDSLIDE** — huge ground crater swallowed driveway and part of garage. no one fell in. house foundation looks cracked but we walked out to sidewalk with our luggage and parr
- `chat_chatbot_chatA_014` gold **TSUNAMI_SURGE**, predicted **FLOOD** — Tsunami siren sounded, surge hit first floor of hotel pacifico. We made it to 4th floor balcony. 3 adults 1 toddler. Toddler has high fever and diarrhea, crying
- `chat_chatbot_chatA_017` gold **HAZMAT_GAS**, predicted **FIRE_SMOKE** — my aunt texted me from south hill. chlorine tank at the water plant ruptured green vapor rolling down valley toward her street. she says her eyes burn and she c
- `chat_chatbot_chatA_021` gold **OTHER**, predicted **ACTIVE_VIOLENCE** — swarm of aggressive wild dogs cornered two hikers inside trail shelter near beacon rock. one has deep bite wound on leg not spurting. stuck inside cant leave tr
- `chat_chatbot_chatA_022` gold **NONE**, predicted **STRUCTURAL_COLLAPSE** — my neighbor mr carlson fell down cellar stairs. compound fracture bone sticking thru skin of left shin. bleeding controlled with clean towel. he is alert and ta
- `chat_chatbot_chatA_026` gold **STRUCTURAL_COLLAPSE**, predicted **EXTREME_WEATHER** — not sure if this line works. tree smashed through roof into living room. my daughter 7 has crushed arm under heavy timber. she was crying now she won't wake up 
- `chat_chatbot_chatA_031` gold **ELECTRICAL_POWER**, predicted **HYPOTHERMIA_FREEZE** — power went out 4 hours ago. fridge is warming up. is there ice distribution somewhere in ward 4? plenty of food and clean water here just worried about meat spo
- `chat_chatbot_chatA_038` gold **ELECTRICAL_POWER**, predicted **FLOOD** — PARDON THE DISTURBANCE BUT WATER IS RUSHING THROUGH THE FRONT DOOR FRAME AND REACHING ELECTRIC OUTLETS CRACKLING LOUD SPARKING FAST
- `chat_chatbot_chatA_039` gold **NONE**, predicted **MEDICAL_CRISIS** — we thought my uncle had a heart attack during the tremor because he collapsed on the floor clutching his ribs. turned out he just tripped over the dog in the da
- `chat_chatbot_chatA_041` gold **HAZMAT_GAS**, predicted **CONTAMINATED_WATER** — smell bad chemicals coming from rail yard tank car behind cedar park elementary. eyes tearing up yellow residue on playground. no one playing outside, school ev
- `chat_chatbot_chatA_044` gold **OTHER**, predicted **EXTREME_WEATHER** — beehive fell out of fallen willow tree in back yard stung my cousin 4 times on arm. applied ice and baking soda paste. swelling going down, no allergy reaction,
- `chat_chatbot_chatA_047` gold **ACTIVE_VIOLENCE**, predicted **FIRE_SMOKE** — my coworker phoned from downtown office tower. bomb or explosion on 12th floor. she is on 14th floor stairway blocked by smoke. she is with our boss who had a c
- `chat_chatbot_chatA_050` gold **NONE**, predicted **LANDSLIDE** — Saw a vehicle rollover 20 minutes ago on Route 9 by the stone bridge. Went down to check before fire crews arrive. Driver was thrown onto rocks, no signs of lif
- `chat_chatbot_chatA_054` gold **STRUCTURAL_COLLAPSE**, predicted **EXTREME_WEATHER** — roof caved in on kitchen earlier during peak gust but we crawled into hallway closet. storm wind died down completely now, walked over to neighbor house with do
- `chat_chatbot_chatA_055` gold **NONE**, predicted **HAZMAT_GAS** — I thought I smelled natural gas leaking near the meter at 714 Oak Avenue so I ran outside. Turned out city utility truck was just flushing the sewer line with d
- `chat_chatbot_chatA_056` gold **NONE**, predicted **EXTREME_WEATHER** — called my elderly mother at 512 south pine st. she says our neighbor mr gomez had a heart attack on her porch during earthquake. she checked his neck and breath
- `chat_chatbot_chatA_057` gold **ACTIVE_VIOLENCE**, predicted **FIRE_SMOKE** — mi tia me mando mensaje desde su rancho en sonora. hubo tiroteo fuerte afuera de su cerca. vio a dos hombres tirados en el camino sin moverse desde hace tres ho
- `chat_chatbot_chatA_063` gold **SINKHOLE_SUBSIDENCE**, predicted **LANDSLIDE** — part of road edge caved into gully behind our barn. looks like a small sinkhole or washout. 2 horses secured in stable, our house is 200 yards away safe, nobody
- `chat_chatbot_chatA_069` gold **MEDICAL_CRISIS**, predicted **STRUCTURAL_COLLAPSE** — no weather problem here. 24 yr old friend fell from ladder onto iron railing. deep puncture in thigh pumping dark red blood soaked 3 towels rapidly turning pale
- `chat_chatbot_chatA_072` gold **NONE**, predicted **STRUCTURAL_COLLAPSE** — fell down attic trapdoor landed hard on concrete floor. right ankle sideways definitely broken, cant put any weight on it. sitting against wall, bleeding stoppe
- `chat_chatbot_chatA_075` gold **MEDICAL_CRISIS**, predicted **FIRE_SMOKE** — mi esposo es cardiaco y le duele el pecho muy fuerte como opresion. se le durmio el brazo izquierdo. estamos en casa en calle morelos 112.

### status (116 wrong)

- `chat_chatbot_chatA_002` gold **Trapped**, predicted **Exposed** — Hate to trouble anyone with everything going on, but a large oak branch fell through the roof onto my husband's chest. He stopped speaking and his lips look blu
- `chat_chatbot_chatA_003` gold **Sheltered**, predicted **Trapped** — OMG OMG OMG MY DESIGNER BAG IS FLOATING DOWN 4TH AVE AND MY SHOES ARE RUINED PLEASE SOMEONE DO SOMETHING I AM SHAKING IN MY LIVING ROOM
- `chat_chatbot_chatA_004` gold **Sheltered**, predicted **Exposed** — water got up to the porch about an hour ago but it receded back to the ditch now. we had to kick a window out earlier to get grandma up high but neighbor pulled
- `chat_chatbot_chatA_008` gold **Exposed**, predicted **Trapped** — flames crossed broadway near shell gas station. 2 adults stuck on roof surrounded by black smoke coughing blood burns on arms
- `chat_chatbot_chatA_011` gold **Trapped**, predicted **Exposed** — Active shooter outside corner bodega on Lincoln Ave. Guy came in with a rifle shot two clerks. Both bleeding on the floor behind counter conscious but losing bl
- `chat_chatbot_chatA_012` gold **Exposed**, predicted **Sheltered** — car stalled in rising wash out on county rd 12. water to doors not rising anymore. me and my teenage son inside. we got dry blankets and snacks, completely stab
- `chat_chatbot_chatA_013` gold **Exposed**, predicted **Sheltered** — huge ground crater swallowed driveway and part of garage. no one fell in. house foundation looks cracked but we walked out to sidewalk with our luggage and parr
- `chat_chatbot_chatA_015` gold **Sheltered**, predicted **Unknown** — tap water came out brown and smells like sour sulfur or gasoline. drank a sip before realizing. stomach hurts bad and throwing up violently, alone in apartment
- `chat_chatbot_chatA_017` gold **Sheltered**, predicted **Exposed** — my aunt texted me from south hill. chlorine tank at the water plant ruptured green vapor rolling down valley toward her street. she says her eyes burn and she c
- `chat_chatbot_chatA_019` gold **Sheltered**, predicted **Trapped** — No disaster here just my sister went into labor 3 weeks early. contractions 2 mins apart baby head crowning right now in bedroom no ambulance responding
- `chat_chatbot_chatA_026` gold **Trapped**, predicted **Exposed** — not sure if this line works. tree smashed through roof into living room. my daughter 7 has crushed arm under heavy timber. she was crying now she won't wake up 
- `chat_chatbot_chatA_027` gold **Sheltered**, predicted **Exposed** — THE WIND BLEW MY PATIO CHAIR INTO THE POOL AND THE POWER FLICKERED TWICE IM SO TERRIFIED WHAT IF THE ROOF FLIES OFF SEND NATIONAL GUARD PLEASE
- `chat_chatbot_chatA_030` gold **Sheltered**, predicted **Unknown** — I am terribly sorry if this ties up resources during the blizzard. My home generator sputtered out and my supplemental oxygen concentrator has about 12 minutes 
- `chat_chatbot_chatA_032` gold **Trapped**, predicted **Exposed** — Mudslide swept down ravine behind school. Found 1 man buried under debris. Checked neck for carotid pulse for over 2 minutes, skin is stiff and cold, pupil dila
- `chat_chatbot_chatA_036` gold **Sheltered**, predicted **Trapped** — Tsunami wave receded. We are stuck on third floor concrete parking structure. Car battery dead. 2 adults, 3 kids. Water clean in bottles. Nobody injured, just n
- `chat_chatbot_chatA_037` gold **Sheltered**, predicted **Exposed** — heat dome index 112 outside. elderly lady in apt 2b ran out of drinking water yesterday. she is dizzy and weak but drinking tap water now with salt, staying in 
- `chat_chatbot_chatA_038` gold **Sheltered**, predicted **Trapped** — PARDON THE DISTURBANCE BUT WATER IS RUSHING THROUGH THE FRONT DOOR FRAME AND REACHING ELECTRIC OUTLETS CRACKLING LOUD SPARKING FAST
- `chat_chatbot_chatA_040` gold **Exposed**, predicted **Trapped** — submerged car upside down in canal near willow creek bridge. two occupants trapped inside underwater for over 20 minutes before bystanders arrived. pulled out o
- `chat_chatbot_chatA_042` gold **Sheltered**, predicted **Unknown** — my grandpa 82 has crushing chest pain radiating down left arm sweating profusely nausea started 15 min ago sitting on couch. history of bypass surgery.
- `chat_chatbot_chatA_044` gold **Sheltered**, predicted **Unknown** — beehive fell out of fallen willow tree in back yard stung my cousin 4 times on arm. applied ice and baking soda paste. swelling going down, no allergy reaction,
- `chat_chatbot_chatA_046` gold **Exposed**, predicted **Trapped** — car crashed into ditch in blizzard near junction 88. heater broke, temp 4 below zero. my wife is 8 months pregnant and shivering violently feet numb lips purple
- `chat_chatbot_chatA_048` gold **Trapped**, predicted **Exposed** — hola por favor mi casa quedo aislada por el rio en camino real 55. somos 3 adultos y 2 ninos. tenemos comida seca y agua para dos dias. nadie herido solo no pod
- `chat_chatbot_chatA_049` gold **Exposed**, predicted **Trapped** — chest tight cant breathe inhaler empty asthma attack getting worse turning blue sitting on porch
- `chat_chatbot_chatA_051` gold **Trapped**, predicted **Unknown** — my brother sent audio from his apt on 4th st before his phone died. grease fire got out of control burned through stairs. says his roommate had third degree bur
- `chat_chatbot_chatA_052` gold **Sheltered**, predicted **Trapped** — Sorry to bother emergency services, our woodstove pipe disconnected and the bedroom filled with dense fumes. My sister collapsed on the floor and is not waking 

### adults (92 wrong)

- `chat_chatbot_chatA_011` gold **3**, predicted **2** — Active shooter outside corner bodega on Lincoln Ave. Guy came in with a rifle shot two clerks. Both bleeding on the floor behind counter conscious but losing bl
- `chat_chatbot_chatA_012` gold **2**, predicted **1** — car stalled in rising wash out on county rd 12. water to doors not rising anymore. me and my teenage son inside. we got dry blankets and snacks, completely stab
- `chat_chatbot_chatA_024` gold **1**, predicted **2** — crush injury from collapsed concrete slab at west warehouse. worker trapped from waist down. pale, thready pulse, crushed pelvis, heavy blood pool forming under
- `chat_chatbot_chatA_028` gold **2**, predicted **1** — Looking through binoculars from my balcony on high ridge. House across the lake at 304 Shoreline Rd is completely underwater to eaves. Can see elderly couple si
- `chat_chatbot_chatA_029` gold **2**, predicted **1** — se cayo el puente viejo sobre el arroyo. vimos una camioneta caer. logramos sacar al chofer pero tiene pierna rota y golpe en la cabeza, esta consciente descans
- `chat_chatbot_chatA_034` gold **2**, predicted **3** — my primo just texted me from his ranch near Rio Grande. 3 armed cartel guys took over their barn shooting rifles. one cousin shot in gut bleeding heavily uncons
- `chat_chatbot_chatA_037` gold **1**, predicted **2** — heat dome index 112 outside. elderly lady in apt 2b ran out of drinking water yesterday. she is dizzy and weak but drinking tap water now with salt, staying in 
- `chat_chatbot_chatA_044` gold **2**, predicted **1** — beehive fell out of fallen willow tree in back yard stung my cousin 4 times on arm. applied ice and baking soda paste. swelling going down, no allergy reaction,
- `chat_chatbot_chatA_045` gold **10**, predicted **14** — city reservoir main broke dirty black silt coming out of taps. 14 people staying at church shelter. we have enough bottled gallon jugs for today but will need c
- `chat_chatbot_chatA_047` gold **2**, predicted **1** — my coworker phoned from downtown office tower. bomb or explosion on 12th floor. she is on 14th floor stairway blocked by smoke. she is with our boss who had a c
- `chat_chatbot_chatA_050` gold **1**, predicted **2** — Saw a vehicle rollover 20 minutes ago on Route 9 by the stone bridge. Went down to check before fire crews arrive. Driver was thrown onto rocks, no signs of lif
- `chat_chatbot_chatA_051` gold **2**, predicted **3** — my brother sent audio from his apt on 4th st before his phone died. grease fire got out of control burned through stairs. says his roommate had third degree bur
- `chat_chatbot_chatA_054` gold **1**, predicted **2** — roof caved in on kitchen earlier during peak gust but we crawled into hallway closet. storm wind died down completely now, walked over to neighbor house with do
- `chat_chatbot_chatA_059` gold **2**, predicted **1** — river overflowed onto patio about an inch deep but stopped rising two hours ago. living room dry, plenty of canned food and batteries, no one hurt here just wai
- `chat_chatbot_chatA_063` gold **1**, predicted **2** — part of road edge caved into gully behind our barn. looks like a small sinkhole or washout. 2 horses secured in stable, our house is 200 yards away safe, nobody
- `chat_chatbot_chatA_070` gold **3**, predicted **1** — tornado touched down mile east. hail broke storm door glass. my vintage car in car port got dented hood. family all fine sitting in interior hallway with blanke
- `chat_chatbot_chatA_076` gold **2**, predicted **1** — wall collapsed onto neighbor bed next door during mudslide. I dug out her torso but her pulse stopped 15 minutes ago, skin purple and pupils fixed. 1 dead adult
- `chat_chatbot_chatA_079` gold **3**, predicted **2** — el terremoto tiro la barda del corral y mato una vaca pero mi familia y yo salimos al patio a tiempo. la casa tiene grietas pero estamos todos bien sin heridas.
- `chat_chatbot_chatA_085` gold **3**, predicted **1** — massive sinkhole opened beneath westbound lane of interstate 80 near exit 15. road closed by state troopers. three cars pulled over safely on shoulder, no vehic
- `chat_chatbot_chatA_088` gold **2**, predicted **1** — water line ruptured inside ceiling flooding kitchen fast but main shutoff valve just turned it off. wet carpets and soggy drywall, everyone unhurt and vacuuming
- `chat_chatbot_chatA_089` gold **6**, predicted **8** — we were trapped inside church basement by downed elm tree across doors but fire crew sawed trunk ten minutes ago. all 8 of us walked out fine, going home now.
- `chat_chatbot_chatA_094` gold **2**, predicted **1** — stray aggressive pitbull pack roving around intersection of 7th and maple. bitten one elderly pedestrian in arm, wound washed and bandaged at corner store, dog 
- `chat_chatbot_chatA_095` gold **4**, predicted **1** — flood water entered city treatment basins, tap water running muddy brown and smells foul. neighborhood has 20 cases of bottled water left. no one sick yet, need
- `chat_chatbot_chatA_097` gold **2**, predicted **1** — my coworker at downtown bank called. armed robber shot security guard in chest point blank. guard bleeding heavily slumped behind security desk fading fast.
- `chat_chatbot_chatA_0100` gold **2**, predicted **3** — Reporting from collision on outer beltway milepost 41. Tractor trailer crushed pickup cab completely. Checked both driver and passenger through broken window, n

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

### medical (77 wrong)

- `chat_chatbot_chatA_002` gold **OXYGEN, MOBILITY_IMPAIRED**, predicted **MOBILITY_IMPAIRED** — Hate to trouble anyone with everything going on, but a large oak branch fell through the roof onto my husband's chest. He stopped speaking and his lips look blu
- `chat_chatbot_chatA_003` gold **none**, predicted **MOBILITY_IMPAIRED** — OMG OMG OMG MY DESIGNER BAG IS FLOATING DOWN 4TH AVE AND MY SHOES ARE RUINED PLEASE SOMEONE DO SOMETHING I AM SHAKING IN MY LIVING ROOM
- `chat_chatbot_chatA_007` gold **MOBILITY_IMPAIRED**, predicted **none** — mi hermana me llamo llorando desde colonia las palmas. hay un deslave de lodo sobre su casa. dice que su vecino don pedro quedo enterrado y no respira nada, ya 
- `chat_chatbot_chatA_010` gold **HYPOTHERMIA, MOBILITY_IMPAIRED**, predicted **HYPOTHERMIA** — por favor help us mi abuelo is shivering uncontrollably lips blue soaked from storm cant stand up we are at corner of 5th and hidalgo
- `chat_chatbot_chatA_014` gold **PREGNANCY_INFANT**, predicted **none** — Tsunami siren sounded, surge hit first floor of hotel pacifico. We made it to 4th floor balcony. 3 adults 1 toddler. Toddler has high fever and diarrhea, crying
- `chat_chatbot_chatA_016` gold **MOBILITY_IMPAIRED**, predicted **CARDIAC** — HEAT IN APARTMENT IS 104 DEGREES ELDERLY DAD CONFUSED NOT SWEATING RED SKIN PASSED OUT ON FLOOR 88 YRS OLD
- `chat_chatbot_chatA_021` gold **BLEEDING, MOBILITY_IMPAIRED**, predicted **MOBILITY_IMPAIRED** — swarm of aggressive wild dogs cornered two hikers inside trail shelter near beacon rock. one has deep bite wound on leg not spurting. stuck inside cant leave tr
- `chat_chatbot_chatA_023` gold **none**, predicted **OXYGEN** — I think there might be a gas leak outside the bodega at 12th and pine, smelling rotten eggs pretty strong while walking the dog. Nobody sick or coughing, just t
- `chat_chatbot_chatA_029` gold **MOBILITY_IMPAIRED**, predicted **none** — se cayo el puente viejo sobre el arroyo. vimos una camioneta caer. logramos sacar al chofer pero tiene pierna rota y golpe en la cabeza, esta consciente descans
- `chat_chatbot_chatA_032` gold **MOBILITY_IMPAIRED**, predicted **BLEEDING, MOBILITY_IMPAIRED** — Mudslide swept down ravine behind school. Found 1 man buried under debris. Checked neck for carotid pulse for over 2 minutes, skin is stiff and cold, pupil dila
- `chat_chatbot_chatA_037` gold **MOBILITY_IMPAIRED**, predicted **none** — heat dome index 112 outside. elderly lady in apt 2b ran out of drinking water yesterday. she is dizzy and weak but drinking tap water now with salt, staying in 
- `chat_chatbot_chatA_039` gold **none**, predicted **CARDIAC** — we thought my uncle had a heart attack during the tremor because he collapsed on the floor clutching his ribs. turned out he just tripped over the dog in the da
- `chat_chatbot_chatA_042` gold **CARDIAC**, predicted **OXYGEN, CARDIAC** — my grandpa 82 has crushing chest pain radiating down left arm sweating profusely nausea started 15 min ago sitting on couch. history of bypass surgery.
- `chat_chatbot_chatA_049` gold **OXYGEN**, predicted **OXYGEN, CARDIAC** — chest tight cant breathe inhaler empty asthma attack getting worse turning blue sitting on porch
- `chat_chatbot_chatA_050` gold **BLEEDING**, predicted **none** — Saw a vehicle rollover 20 minutes ago on Route 9 by the stone bridge. Went down to check before fire crews arrive. Driver was thrown onto rocks, no signs of lif
- `chat_chatbot_chatA_051` gold **BURNS**, predicted **OXYGEN, BURNS** — my brother sent audio from his apt on 4th st before his phone died. grease fire got out of control burned through stairs. says his roommate had third degree bur
- `chat_chatbot_chatA_060` gold **INSULIN**, predicted **INSULIN, OXYGEN, CARDIAC** — ayuda por favor mi mama is in deep diabetic shock here at 22 west street unconscious breathing shallow ran out of insulin bottles yesterday
- `chat_chatbot_chatA_066` gold **MOBILITY_IMPAIRED**, predicted **OXYGEN, CARDIAC** — HEAT IN TRAILER IS UNBEARABLE AUNTIE 74 COLLAPSED ON LINOLEUM BREATHING VERY FAST WEAK THREAD PULSE SKIN RED HOT NO AIR CONDITIONING
- `chat_chatbot_chatA_067` gold **OXYGEN**, predicted **none** — my daughter called from her dorm near north campus. tanker spill on highway leaking ammonia cloud into dorm quad. her eyes burning and throat closing up struggl
- `chat_chatbot_chatA_069` gold **BLEEDING**, predicted **BLEEDING, MOBILITY_IMPAIRED** — no weather problem here. 24 yr old friend fell from ladder onto iron railing. deep puncture in thigh pumping dark red blood soaked 3 towels rapidly turning pale
- `chat_chatbot_chatA_072` gold **MOBILITY_IMPAIRED**, predicted **BLEEDING, MOBILITY_IMPAIRED** — fell down attic trapdoor landed hard on concrete floor. right ankle sideways definitely broken, cant put any weight on it. sitting against wall, bleeding stoppe
- `chat_chatbot_chatA_075` gold **CARDIAC**, predicted **OXYGEN, CARDIAC** — mi esposo es cardiaco y le duele el pecho muy fuerte como opresion. se le durmio el brazo izquierdo. estamos en casa en calle morelos 112.
- `chat_chatbot_chatA_083` gold **OXYGEN**, predicted **BURNS** — apartment building corridor full of thick burning insulation smoke roof partially buckling 6 adults 2 children gathered in rear corner coughing vomiting soot ca
- `chat_chatbot_chatA_092` gold **BLEEDING, MOBILITY_IMPAIRED, PREGNANCY_INFANT**, predicted **BLEEDING, PREGNANCY_INFANT** — my pregnant wife 38 weeks fell on wet ice outside clinic on 3rd st. severe sudden abdominal pain heavy vaginal bleeding contractions every minute unable to stan
- `chat_chatbot_chatA_094` gold **BLEEDING**, predicted **none** — stray aggressive pitbull pack roving around intersection of 7th and maple. bitten one elderly pedestrian in arm, wound washed and bandaged at corner store, dog 

### third_party (35 wrong)

- `chat_chatbot_chatA_022` gold **False**, predicted **True** — my neighbor mr carlson fell down cellar stairs. compound fracture bone sticking thru skin of left shin. bleeding controlled with clean towel. he is alert and ta
- `chat_chatbot_chatA_028` gold **True**, predicted **False** — Looking through binoculars from my balcony on high ridge. House across the lake at 304 Shoreline Rd is completely underwater to eaves. Can see elderly couple si
- `chat_chatbot_chatA_037` gold **True**, predicted **False** — heat dome index 112 outside. elderly lady in apt 2b ran out of drinking water yesterday. she is dizzy and weak but drinking tap water now with salt, staying in 
- `chat_chatbot_chatA_039` gold **False**, predicted **True** — we thought my uncle had a heart attack during the tremor because he collapsed on the floor clutching his ribs. turned out he just tripped over the dog in the da
- `chat_chatbot_chatA_075` gold **False**, predicted **True** — mi esposo es cardiaco y le duele el pecho muy fuerte como opresion. se le durmio el brazo izquierdo. estamos en casa en calle morelos 112.
- `chat_chatbot_chatA_078` gold **True**, predicted **False** — Looking through scope from hill overlooking lower valley road. Farmhouse completely encircled by swift brown flood waters. 2 people visible waving towels from h
- `chat_chatbot_chatA_090` gold **True**, predicted **False** — saw through binoculars a fishing boat capsized in surf near lighthouse rocks. two men washed ashore, neither moving for 30 minutes, chest not rising, face down 
- `chat_chatbot_chatA_098` gold **False**, predicted **True** — hola mi familia esta varada en rancho san jose. camino cortado por deslave de cerro. tenemos 4 adultos y 3 ninos, agua de pozo limpia y comida. nadie herido sol
- `chat_chatbot_chatA_107` gold **True**, predicted **False** — mi primo marco me llamo del barrio san juan. un cable de alta tension cayo sobre el carro de don chuy durante el ventarron. don chuy toco la puerta metalica y c
- `chat_chatbot_chatA_117` gold **True**, predicted **False** — my daughter called from her lab at east tech campus. cylinder valve sheared off venting dense chlorine cloud. she escaped to second floor office but her lab par
- `chat_chatbot_chatA_128` gold **True**, predicted **False** — spotting through binoculars from bluff at 1200 crestview lane. two occupants stranded on roof of camper van stalled in swollen creek bed 500 yards down. waving 
- `chat_chatbot_chatA_157` gold **True**, predicted **False** — mi compadre me llamo desde el canaveral. hubo balacera entre grupos armados en la brecha. vio al chofer de la camioneta tirado en el lodo con impacto en la cabe
- `chat_chatbot_chatA_178` gold **True**, predicted **False** — watching through binoculars from bluff at 750 scenic ridge road. couple stranded on top of rv parked in flooded riverside campground. water 2 feet below rv roof
- `chat_chatbot_chatA_192` gold **False**, predicted **True** — my 64 year old diabetic mother collapsed on living room rug. blood glucose reads 22. unresponsive to voice or shaking, breathing slow and labored, glucagon syri
- `chat_chatbot_chatA_197` gold **True**, predicted **False** — my coworker at distribution center called from break room. gunman opened fire on loading dock. coworker says supervisor took two gunshot wounds to abdomen bleed
- `chat_chatbot_chatB_014` gold **True**, predicted **False** — tienda colapso primo tiene pierna rota
- `chat_chatbot_chatB_022` gold **False**, predicted **True** — mom not breathing cold no pulse
- `chat_chatbot_chatB_023` gold **False**, predicted **True** — neighbor crushed by tree already dead
- `chat_chatbot_chatB_024` gold **False**, predicted **True** — mi abuelo no tiene pulso murio
- `chat_chatbot_chatB_033` gold **True**, predicted **False** — the church steeple collapsed through the fellowship hall during the tremor everybody scrambled out into the parking lot screaming about cars but old pastor dave
- `chat_chatbot_chatB_039` gold **True**, predicted **False** — un transformer exploto cerca de la casa de mi abuelita y chispas le quemaron los brazos when she ran outside to grab laundry she has second degree burns blister
- `chat_chatbot_chatB_048` gold **False**, predicted **True** — i came back to check my elderly neighbors house after the wildfire swept through cedar lane yesterday the entire single story house burned completely flat to gr
- `chat_chatbot_chatC_001` gold **True**, predicted **False** — my grandpa ran out of his lantus pens this morning sugar is creeping up around 280 he feels ok right now but needs a refill
- `chat_chatbot_chatC_011` gold **True**, predicted **False** — vecino con marcapasos sintiendo flutter y mareo leve hace dos horas sin dolor fuerte
- `chat_chatbot_chatC_020` gold **False**, predicted **True** — mi esposo es diabetico y se le descompuso el refrigerador toda la insulina se calento y se arruino necesita recambio pero esta bien

## Summary-line examples

| id | Gold | Predicted | ✓ |
|---|---|---|---|
| `chat_chatbot_chatA_001` | Red · FLOOD · Trapped · 1 adult + 2 children | Red · FLOOD · Trapped · 1 adult + 2 children | ✓ |
| `chat_chatbot_chatA_002` | Red · STRUCTURAL_COLLAPSE · Trapped · 2 adults · OXYGEN, MOBILITY_IMPAIRED | Red · STRUCTURAL_COLLAPSE · Exposed · 2 adults · MOBILITY_IMPAIRED | ✗ |
| `chat_chatbot_chatA_003` | Green · FLOOD · Sheltered · 1 adult | Red · STRUCTURAL_COLLAPSE · Trapped · 1 adult · MOBILITY_IMPAIRED | ✗ |
| `chat_chatbot_chatA_004` | Green · FLOOD · Sheltered · 4 adults | Yellow · FLOOD · Exposed · 4 adults | ✗ |
| `chat_chatbot_chatA_005` | Green · NONE · Sheltered · 1 adult | Green · FIRE_SMOKE · Sheltered · 1 adult | ✗ |
| `chat_chatbot_chatA_006` | Black · STRUCTURAL_COLLAPSE · Trapped · 2 adults · MOBILITY_IMPAIRED | Red · STRUCTURAL_COLLAPSE · Trapped · 2 adults · MOBILITY_IMPAIRED | ✗ |
| `chat_chatbot_chatA_007` | Black · LANDSLIDE · Trapped · 2 adults · MOBILITY_IMPAIRED | Red · STRUCTURAL_COLLAPSE · Trapped · 2 adults | ✗ |
| `chat_chatbot_chatA_008` | Red · FIRE_SMOKE · Exposed · 2 adults · OXYGEN, BURNS | Red · FIRE_SMOKE · Trapped · 2 adults · OXYGEN, BURNS | ✗ |
| `chat_chatbot_chatA_009` | Green · FLOOD · Sheltered · 2 adults | Green · FLOOD · Sheltered · 2 adults | ✓ |
| `chat_chatbot_chatA_010` | Red · HYPOTHERMIA_FREEZE · Exposed · 2 adults · HYPOTHERMIA, MOBILITY_IMPAIRED | Red · EXTREME_WEATHER · Exposed · 2 adults · HYPOTHERMIA | ✗ |
| `chat_chatbot_chatA_011` | Red · ACTIVE_VIOLENCE · Trapped · 3 adults · BLEEDING | Red · ACTIVE_VIOLENCE · Exposed · 2 adults · BLEEDING | ✗ |
| `chat_chatbot_chatA_012` | Yellow · FLOOD · Exposed · 2 adults | Green · FLOOD · Sheltered · 1 adult + 1 child | ✗ |
| `chat_chatbot_chatA_013` | Green · SINKHOLE_SUBSIDENCE · Exposed · 2 adults | Green · LANDSLIDE · Sheltered · 2 adults | ✗ |
| `chat_chatbot_chatA_014` | Yellow · TSUNAMI_SURGE · Sheltered · 3 adults + 1 child · PREGNANCY_INFANT | Red · FLOOD · Sheltered · 3 adults + 2 children | ✗ |
| `chat_chatbot_chatA_015` | Yellow · CONTAMINATED_WATER · Sheltered · 1 adult | Red · CONTAMINATED_WATER · Unknown · 1 adult | ✗ |
