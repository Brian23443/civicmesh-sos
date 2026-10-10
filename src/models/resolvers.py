"""Deterministic resolvers used by both model stages (MASTER_PROMPT §5.4).

    resolve_headcount(text) -> (adults, children)
    resolve_medical(text)   -> MedicalFlags (bits 0-7)
    resolve_location(text)  -> (LocationConfidenceType, location_text | None, MedicalFlags)
    resolve_status(text)    -> RescueStatus | None   (Stage 1 status keyword backstop)

Patterns are generic, built from the word lists in §5.4 — never from Appendix A.

JS PORTABILITY (Track 4 ports this file 1:1 to web/src/lib/resolvers.ts):
- Every regex is case-insensitive (Python re.IGNORECASE / JS "i" flag).
- No `\\b`: JS `\\b` treats accented letters (é, ñ) as non-word characters, Python does
  not. Word edges use the explicit WB_START / WB_END lookarounds below, which behave the
  same in both (JS supports lookbehind since ES2018 / Safari 16.4).
- No named groups, possessive quantifiers or inline flags.
- Text is normalised first: lowercase, curly apostrophes → "'".
"""

from __future__ import annotations

import re

from src.schema import LocationConfidenceType, MedicalFlags, RescueStatus

# Letters (incl. Latin-1 accented), digits, underscore.
_WORD_CHARS = "A-Za-z0-9_À-ÿ"
WB_START = f"(?<![{_WORD_CHARS}])"
WB_END = f"(?![{_WORD_CHARS}])"


def _alt(alternatives: list[str]) -> str:
    """Alternation that must end at a word edge: (?:a|b|c)WB_END."""
    return f"(?:{'|'.join(alternatives)}){WB_END}"


def _words(alternatives: list[str]) -> str:
    """Whole-word alternation: WB_START(?:a|b|c)WB_END."""
    return WB_START + _alt(alternatives)


def normalize(text: str) -> str:
    return text.lower().replace("’", "'").replace("‘", "'")


def _rx(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE)


# =============================================================================
# Headcount resolver
# =============================================================================

NUMBER_WORDS = {
    # English one–twenty
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    # Spanish
    "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6,
    "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
    # "a couple" = 2
    "a couple of": 2, "a couple": 2, "couple of": 2,
}

# Longest first so "a couple of" wins over "a couple".
_NUMBER_ALT = "|".join(sorted((re.escape(w) for w in NUMBER_WORDS), key=len, reverse=True))
NUMBER = f"(?:[0-9]{{1,2}}|{_NUMBER_ALT})"

CHILD_NOUNS = [
    "babies", "baby", "infants", "infant", "newborns", "newborn", "toddlers", "toddler",
    "kids", "kid", "children", "child", "sons", "son", "daughters", "daughter",
    "boys", "boy", "girls", "girl", "teenagers", "teenager", "teens", "teen",
    "beb[eé]s", "beb[eé]", "ni[nñ]os", "ni[nñ]as", "ni[nñ]o", "ni[nñ]a",
    "hijos", "hijas", "hijo", "hija",
]
# Adult-specific nouns: the count is the number of adults.
ADULT_NOUNS = ["adults", "adult", "men", "women", "neighbors", "neighbours", "workers", "passengers",
               "students", "guests", "adultos", "adultas",
               # more plural people nouns ("two elderly sisters", "two guys", "3 occupants")
               "guys", "sisters", "brothers", "occupants", "victims", "residents", "tenants", "hikers",
               "campers", "customers", "patients", "coworkers", "roommates", "friends", "seniors", "survivors",
               "hombres", "mujeres", "señores", "senores"]
# Generic nouns: the count may include children ("5 people incl. 2 kids" → 3 adults).
GENERIC_NOUNS = ["people", "ppl", "persons", "person", "of us", "personas", "folks"]
ADULT_RELATIONS = ["wife", "husband", "mom", "mother", "mum", "dad", "father", "sister", "brother",
                   "partner", "friend", "boyfriend", "girlfriend", "grandma", "grandmother", "grandpa",
                   "grandfather", "aunt", "uncle", "roommate", "neighbor", "neighbour", "coworker",
                   "fiance", "fiancee", "spouse"]
# Singular adult people mentioned without a number ("with my mom", "the driver", "roofing worker").
# Each distinct noun counts once (§4: "if no number is given, count the people the message mentions").
ADULT_PERSON_NOUNS = ADULT_RELATIONS + [
    "auntie", "aunty", "grandparent", "stepdad", "stepmom", "sister-in-law", "brother-in-law",
    "worker", "customer", "driver", "guy", "man", "woman", "lady", "victim", "passenger", "hiker", "camper",
    "patient", "tenant", "resident", "stranger", "teacher", "nurse", "coach",
    "mam[aá]", "madre", "pap[aá]", "padre", "esposo", "esposa", "marido", "hermano", "hermana",
    "abuelo", "abuela", "abuelito", "abuelita", "t[ií]o", "t[ií]a", "primo", "prima", "suegro", "suegra",
    "vecino", "vecina", "se[nñ]or", "se[nñ]ora",
]
# The writer is not at the scene when the message is relayed ("my brother texted", "me llamó").
RELAY_WORDS = ["called", "calls", "calling", "texted", "texting", "phoned", "messaged", "voice note",
               "voicemail", "on behalf", "reporting for", "heard from", "me llam[oó]", "me escribi[oó]",
               "me mand[oó]", "me avis[oó]"]
# First-person plural: the writer is with at least one other person.
WE_WORDS = ["we", "us", "our", "ours", "we're", "we've", "we'll", "nosotros", "nosotras", "estamos",
            "tenemos", "nuestro", "nuestra", "nuestros", "nuestras"]
# Words between a number and an age unit make it an age, not a count ("8 yr old son").
AGE_UNITS = ["yr", "yrs", "yo", "y/o", "year", "years", "month", "months", "mo", "mos", "week", "weeks",
             "a[nñ]os", "a[nñ]o", "meses"]

# Up to two filler words between the number and the noun ("2 small kids", "3 scared adults").
# A filler word may not be a conjunction or a count noun, so "2 adults and toddler" isn't 2 children.
_FILLER_STOP = ["and", "or", "y", "with", "plus", "of", "&"] + CHILD_NOUNS + ADULT_NOUNS + GENERIC_NOUNS
_FILLER = "(?:(?!" + _alt(_FILLER_STOP) + ")[a-z\u00C0-\u00FF'-]+\\s+){0,2}?"

CHILD_COUNT_RX = _rx(f"{WB_START}({NUMBER})\\s*{_FILLER}({_alt(CHILD_NOUNS)})")
ADULT_COUNT_RX = _rx(f"{WB_START}({NUMBER})\\s*{_FILLER}({_alt(ADULT_NOUNS)})")
GENERIC_COUNT_RX = _rx(f"{WB_START}({NUMBER})\\s*{_FILLER}({_alt(GENERIC_NOUNS)})")
CHILD_NOUN_RX = _rx(_words(CHILD_NOUNS))
TWINS_RX = _rx(_words(["twins", "gemelos", "gemelas", "mellizos"]))
BOTH_OF_US_RX = _rx(_words(["both of us", "the two of us", "los dos", "las dos"]))
ME_AND_RELATION_RX = _rx(
    f"{WB_START}(?:me|i)\\s*(?:,|and|&|\\+|y)\\s*(?:my|mi)\\s+{_alt(ADULT_RELATIONS)}"
    f"|{WB_START}(?:my|mi)\\s+{_alt(ADULT_RELATIONS)}\\s*(?:and|&|\\+|y)\\s*(?:me|i|yo){WB_END}"
)
ME_AND_KIDS_RX = _rx(f"{WB_START}(?:me|i)\\s*(?:,|and|&|\\+|y)\\s*(?:my|mi|mis)\\s+({NUMBER})?\\s*"
                     f"{_FILLER}{_alt(CHILD_NOUNS)}")
FAMILY_OF_RX = _rx(f"{WB_START}(?:family of|familia de)\\s+({NUMBER}){WB_END}")
ADULT_PERSON_RX = _rx(_words(ADULT_PERSON_NOUNS))
RELAY_RX = _rx(_words(RELAY_WORDS))
WE_RX = _rx(_words(WE_WORDS))
ALONE_RX = _rx(_words(["alone", "just me", "only me", "by myself", "on my own", "solo", "sola",
                       "solo yo", "estoy solo", "estoy sola"]))
AGE_RX = _rx(f"^\\s*(?:-|\\s)?(?:{'|'.join(AGE_UNITS)}){WB_END}")


_UNACCENT = str.maketrans("áéíóúñ", "aeioun")


def _distinct(rx: re.Pattern, text: str) -> set[str]:
    """Distinct matched words, accents stripped ("mamá" and "mama" are one person)."""
    return {m.group(0).translate(_UNACCENT) for m in rx.finditer(text)}


def parse_number(token: str) -> int:
    token = token.strip().lower()
    if token.isdigit():
        return int(token)
    return NUMBER_WORDS[token]


def _is_age(text: str, match: re.Match) -> bool:
    """True if the number is followed by an age unit ("8yr old son", "3 year old daughter")."""
    return bool(AGE_RX.match(text[match.end(1):]))


def _count_matches(rx: re.Pattern, text: str) -> list[tuple[int, int, int]]:
    """(count, noun_start, noun_end) for each numbered match that isn't an age."""
    out = []
    for m in rx.finditer(text):
        if _is_age(text, m):
            continue
        out.append((parse_number(m.group(1)), m.start(2), m.end(2)))
    return out


def resolve_headcount(text: str) -> tuple[int, int]:
    """Returns (adults, children), each clamped to 0-15 (§5.4 rules 1-6, plus the §4 count rule)."""
    t = normalize(text)

    # Rule 1: children.
    numbered_children = _count_matches(CHILD_COUNT_RX, t)
    children = sum(n for n, _, _ in numbered_children)
    covered = {(s, e) for _, s, e in numbered_children}
    for m in CHILD_NOUN_RX.finditer(t):  # a child noun without a number → 1 each
        if not any(s <= m.start() < e for s, e in covered):
            children += 1
    children += 2 * len(TWINS_RX.findall(t))

    # Rule 2: adults.
    adults = None
    explicit = [n for n, _, _ in _count_matches(ADULT_COUNT_RX, t)]
    if explicit:
        adults = sum(explicit)
    generic = [n for n, _, _ in _count_matches(GENERIC_COUNT_RX, t)]
    if BOTH_OF_US_RX.search(t):
        generic.append(2)
    generic += [parse_number(m.group(1)) for m in FAMILY_OF_RX.finditer(t)]
    if generic:
        n = max(generic)
        from_generic = n - children if children and n > children else n
        adults = from_generic if adults is None else max(adults, from_generic)

    # Rule 3: "me and my <adult relation>" → at least 2 adults; "me and my N kids" → 1 adult.
    if ME_AND_RELATION_RX.search(t):
        adults = max(adults or 0, 2)
    if ME_AND_KIDS_RX.search(t):
        adults = max(adults or 0, 1)

    # Rule 4: alone.
    if adults is None and ALONE_RX.search(t):
        adults = 1

    # No number given: count the people mentioned (§4 count rule) — the writer unless the
    # message is relayed, plus each distinct adult mentioned; "we/us/our" means at least
    # 2 people (1 adult if children were found).
    if adults is None:
        relayed = bool(RELAY_RX.search(t))
        estimate = (0 if relayed else 1) + len(_distinct(ADULT_PERSON_RX, t))
        if not relayed and WE_RX.search(t):
            estimate = max(estimate, 1 if children else 2)
        if estimate > 0:
            adults = estimate

    # Rule 5: default 1 adult, 0 children.
    if adults is None:
        adults = 1

    # Rule 6: clamp.
    return max(0, min(15, adults)), max(0, min(15, children))


# =============================================================================
# Medical keyword backstop
# =============================================================================

_CANT = "(?:can'?t|cannot|can not|cant)"
_NEGATION_RX = _rx(_words(["no", "not", "zero", "without", "isn't", "isnt", "aren't", "arent", "nobody",
                           "none", "never", "nadie", "sin"]) + "[^.!?;,]{0,25}$")

MEDICAL_PATTERNS: dict[str, list[str]] = {
    "INSULIN": [
        _words(["insulin", "diabetic", "diabetics", "diabetes", "blood sugar", "type 1", "type 2", "type one",
                "type two", "insulina", "diab[eé]tic[oa]s?"]),
        f"{WB_START}sugar(?:'s|\\s+is|\\s+was|\\s+level){WB_END}",
    ],
    "OXYGEN": [
        f"{WB_START}{_CANT}\\s+breath(?:e|ing)?{WB_END}",
        _words(["trouble breathing", "difficulty breathing", "hard to breathe", "struggling to breathe",
                "gasping", "choking on smoke", "oxygen", "inhaler", "asthma", "no puedo respirar",
                "no puede respirar"]),
    ],
    "BLEEDING": [
        _words(["bleeding", "bleed", "bleeds", "blood everywhere", "gash", "gashes", "deep cut", "deep cuts",
                "tourniquet"]),
        f"{WB_START}hemorrhag[a-z]*",
        f"{WB_START}haemorrhag[a-z]*",
        f"{WB_START}sangr[a-zÀ-ÿ]*",
    ],
    "HYPOTHERMIA": [
        f"{WB_START}hypotherm[a-z]*",
        _words(["freezing cold", "shivering", "frostbite", "frost bite", "blue lips", "lips (?:are |turning )?blue",
                "hipotermia"]),
    ],
    "MOBILITY_IMPAIRED": [
        _words(["wheelchair", "wheel chair", "pinned", "bedridden", "bed ridden", "silla de ruedas"]),
        f"{WB_START}{_CANT}\\s+walk{WB_END}",
        f"{WB_START}broken\\s+(?:leg|legs|hip|hips|pelvis){WB_END}",
        f"{WB_START}paraly[sz][a-z]*",
    ],
    "CARDIAC": [
        _words(["chest pain", "chest pains", "heart attack", "cardiac", "pacemaker", "heart condition",
                "heart failure", "dolor de pecho", "infarto"]),
    ],
    "PREGNANCY_INFANT": [
        _words(["pregnant", "contractions", "in labor", "in labour", "water broke", "waters broke", "newborn",
                "newborns", "infant", "infants", "embarazada"]),
    ],
    "BURNS": [
        f"{WB_START}(?:burned|burns|burnt)(?!\\s+barrel){WB_END}",
        f"{WB_START}scald[a-z]*",
        f"{WB_START}blister[a-z]*",
        f"{WB_START}quemad[a-z]*",
    ],
}
MEDICAL_RX = {flag: [_rx(p) for p in patterns] for flag, patterns in MEDICAL_PATTERNS.items()}


def _negated(t: str, start: int) -> bool:
    """A negation word shortly before the match, in the same clause ("no bleeding", "not burned")."""
    return bool(_NEGATION_RX.search(t[max(0, start - 30):start]))


def resolve_medical(text: str) -> MedicalFlags:
    """Medical keyword backstop → MedicalFlags bits 0-7."""
    t = normalize(text)
    flags = MedicalFlags.NONE
    for flag, patterns in MEDICAL_RX.items():
        for rx in patterns:
            if any(not _negated(t, m.start()) for m in rx.finditer(t)):
                flags |= MedicalFlags[flag]
                break
    return flags


# =============================================================================
# Location resolver
# =============================================================================

STREET_TYPES = ["lane", "ln", "street", "st", "road", "rd", "avenue", "ave", "boulevard", "blvd", "drive", "dr",
                "court", "ct", "way", "highway", "hwy", "terrace", "place", "pl"]
# Words that can't be part of a street name — stops "3 people on the way" being an address.
STREET_STOPWORDS = {"the", "a", "an", "and", "or", "of", "us", "on", "in", "at", "to", "my", "our", "we", "are",
                    "is", "was", "people", "ppl", "adults", "adult", "kids", "kid", "children", "persons",
                    "minutes", "mins", "hours", "hrs", "feet", "ft", "miles", "blocks", "floors", "floor",
                    "their", "his", "her", "your", "this", "that", "way", "no", "not", "all", "just"}
ADDRESS_RX = _rx(
    f"{WB_START}([0-9]{{1,5}})\\s+((?:[a-z0-9.'-]+\\s+){{1,4}}?)({'|'.join(STREET_TYPES)})\\.?{WB_END}"
)

LANDMARKS = ["walmart", "target", "costco", "home depot", "kroger", "heb", "h-e-b", "safeway", "walgreens", "cvs",
             "high school", "middle school", "elementary school", "school", "hospital", "clinic", "church",
             "stadium", "mall", "library", "city hall", "airport", "fire station", "police station", "bridge",
             "overpass"]
# Longest first so "high school" wins over "school".
LANDMARK_RX = _rx(_words(sorted((re.escape(x) for x in LANDMARKS), key=len, reverse=True)))

OFFSETS = ["a few blocks away", "down the street", "across the street", "nearby", "around the corner",
           "blocks north", "blocks south", "blocks east", "blocks west", "blocks away", "miles away"]
# Keep a leading count with "blocks"/"miles" phrases: "4 blocks north", "two miles away".
_OFFSET_COUNT = f"(?:(?:{NUMBER}|a few|few|several)\\s+)?"
OFFSET_RX = _rx(WB_START + "(?:" + _OFFSET_COUNT + "(?:blocks|miles)\\s+(?:north|south|east|west|away)"
                + "|" + "|".join(sorted((re.escape(x) for x in OFFSETS), key=len, reverse=True)) + ")" + WB_END)

LOCATION_FLAGS = {
    LocationConfidenceType.DIRECT_ON_SCENE: MedicalFlags.NONE,
    LocationConfidenceType.PROXIMATE_OFFSET: MedicalFlags.LOC_PROXIMATE | MedicalFlags.LOCATION_DISCREPANCY_ALERT,
    LocationConfidenceType.LANDMARK_POI: MedicalFlags.LOC_LANDMARK | MedicalFlags.LOCATION_DISCREPANCY_ALERT,
    LocationConfidenceType.EXPLICIT_ADDRESS: (
        MedicalFlags.LOC_EXPLICIT_ADDRESS | MedicalFlags.LOCATION_DISCREPANCY_ALERT
    ),
}


def _find_address(text: str) -> str | None:
    for m in ADDRESS_RX.finditer(text):
        name_words = m.group(2).split()
        if any(w.strip(".,").lower() in STREET_STOPWORDS for w in name_words):
            continue
        return text[m.start():m.end()].rstrip(".")
    return None


def resolve_location(text: str) -> tuple[LocationConfidenceType, str | None, MedicalFlags]:
    """Returns (location_type, location_text, flags) per §5.4 rules 1-3.

    location_text keeps the message's original spelling/case. An offset phrase found
    alongside an address or landmark is appended in parentheses.
    """
    # Matching runs on the original text (patterns are case-insensitive) so spans map back 1:1.
    src = text.replace("’", "'").replace("‘", "'")
    loc_type, loc_text = LocationConfidenceType.DIRECT_ON_SCENE, None

    address = _find_address(src)
    if address:
        loc_type, loc_text = LocationConfidenceType.EXPLICIT_ADDRESS, address
    else:
        m = LANDMARK_RX.search(src)
        if m:
            loc_type, loc_text = LocationConfidenceType.LANDMARK_POI, m.group(0)

    m = OFFSET_RX.search(src)
    if m:
        if loc_text is None:
            loc_type, loc_text = LocationConfidenceType.PROXIMATE_OFFSET, m.group(0)
        else:
            loc_text = f"{loc_text} ({m.group(0)})"

    return loc_type, loc_text, LOCATION_FLAGS[loc_type]


# =============================================================================
# Status keyword backstop (Stage 1)
# =============================================================================
# Clear situational words override the prototype's status guess. Keywords come from the
# §2 status meanings; the precedence (TRAPPED > EXPOSED > SHELTERED) was chosen on the
# chatbot validation rows (status 42.7% → 50.5%), never on Appendix A. "stuck inside"
# is TRAPPED; "inside the car" is EXPOSED (§2: "in a car" is exposed). Negated mentions
# ("we are NOT trapped") are skipped.

STATUS_KEYWORDS: list[tuple[RescueStatus, list[str]]] = [
    (RescueStatus.TRAPPED, [
        "trapped", "stuck", "pinned", "can't get out", "cant get out", "cannot get out", "can not get out",
        "can't escape", "cant escape", "cannot escape", "can't open", "cant open", "jammed", "blocked in",
        "cut off", "buried", "under the rubble", "under rubble", "atrapad[oa]s?", "no podemos salir",
        "no puedo salir", "no puede salir", "encerrad[oa]s?",
    ]),
    (RescueStatus.EXPOSED, [
        "on the roof", "on our roof", "in the water", "outside", "outdoors", "in the street", "on the street",
        "in the car", "in our car", "in my car", "in the truck", "on the road", "in a boat", "on the bridge",
        "en el techo", "afuera", "en la calle", "en el agua", "en el carro",
    ]),
    (RescueStatus.SHELTERED, [
        "inside", "indoors", "at home", "in the house", "in our house", "in the shelter", "at the shelter",
        "sheltering", "sheltered", "safe at", "adentro", "dentro", "en casa", "en el refugio",
    ]),
]
STATUS_RX = [(status, _rx(_words(words))) for status, words in STATUS_KEYWORDS]


def resolve_status(text: str) -> RescueStatus | None:
    """The first status (in precedence order) with a non-negated keyword, else None."""
    t = normalize(text)
    for status, rx in STATUS_RX:
        if any(not _negated(t, m.start()) for m in rx.finditer(t)):
            return status
    return None
