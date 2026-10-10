/** §5.4 headcount resolver + §4 count rule — port of resolve_headcount in src/models/resolvers.py. */
import { WB_END, WB_START, alt, clamp15, finditer, longestFirst, normalize, rx, rxAll, words } from './common';

export interface HeadcountResult { adults: number; children: number }

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10,
  'a couple of': 2, 'a couple': 2, 'couple of': 2,
};
export const NUMBER = `(?:[0-9]{1,2}|${longestFirst(Object.keys(NUMBER_WORDS)).join('|')})`;

const CHILD_NOUNS = [
  'babies', 'baby', 'infants', 'infant', 'newborns', 'newborn', 'toddlers', 'toddler',
  'kids', 'kid', 'children', 'child', 'sons', 'son', 'daughters', 'daughter',
  'boys', 'boy', 'girls', 'girl', 'teenagers', 'teenager', 'teens', 'teen',
  'beb[eé]s', 'beb[eé]', 'ni[nñ]os', 'ni[nñ]as', 'ni[nñ]o', 'ni[nñ]a',
  'hijos', 'hijas', 'hijo', 'hija',
];
const ADULT_NOUNS = ['adults', 'adult', 'men', 'women', 'neighbors', 'neighbours', 'workers', 'passengers',
  'students', 'guests', 'adultos', 'adultas',
  'guys', 'sisters', 'brothers', 'occupants', 'victims', 'residents', 'tenants', 'hikers',
  'campers', 'customers', 'patients', 'coworkers', 'roommates', 'friends', 'seniors', 'survivors',
  'hombres', 'mujeres', 'señores', 'senores'];
const GENERIC_NOUNS = ['people', 'ppl', 'persons', 'person', 'of us', 'personas', 'folks'];
const ADULT_RELATIONS = ['wife', 'husband', 'mom', 'mother', 'mum', 'dad', 'father', 'sister', 'brother',
  'partner', 'friend', 'boyfriend', 'girlfriend', 'grandma', 'grandmother', 'grandpa',
  'grandfather', 'aunt', 'uncle', 'roommate', 'neighbor', 'neighbour', 'coworker',
  'fiance', 'fiancee', 'spouse'];
const ADULT_PERSON_NOUNS = [...ADULT_RELATIONS,
  'auntie', 'aunty', 'grandparent', 'stepdad', 'stepmom', 'sister-in-law', 'brother-in-law',
  'worker', 'customer', 'driver', 'guy', 'man', 'woman', 'lady', 'victim', 'passenger', 'hiker', 'camper',
  'patient', 'tenant', 'resident', 'stranger', 'teacher', 'nurse', 'coach',
  'mam[aá]', 'madre', 'pap[aá]', 'padre', 'esposo', 'esposa', 'marido', 'hermano', 'hermana',
  'abuelo', 'abuela', 'abuelito', 'abuelita', 't[ií]o', 't[ií]a', 'primo', 'prima', 'suegro', 'suegra',
  'vecino', 'vecina', 'se[nñ]or', 'se[nñ]ora'];
const RELAY_WORDS = ['called', 'calls', 'calling', 'texted', 'texting', 'phoned', 'messaged', 'voice note',
  'voicemail', 'on behalf', 'reporting for', 'heard from', 'me llam[oó]', 'me escribi[oó]',
  'me mand[oó]', 'me avis[oó]'];
const WE_WORDS = ['we', 'us', 'our', 'ours', "we're", "we've", "we'll", 'nosotros', 'nosotras', 'estamos',
  'tenemos', 'nuestro', 'nuestra', 'nuestros', 'nuestras'];
const AGE_UNITS = ['yr', 'yrs', 'yo', 'y/o', 'year', 'years', 'month', 'months', 'mo', 'mos', 'week', 'weeks',
  'a[nñ]os', 'a[nñ]o', 'meses'];

const FILLER_STOP = ['and', 'or', 'y', 'with', 'plus', 'of', '&', ...CHILD_NOUNS, ...ADULT_NOUNS, ...GENERIC_NOUNS];
const FILLER = `(?:(?!${alt(FILLER_STOP)})[a-z\\u00C0-\\u00FF'-]+\\s+){0,2}?`;

const CHILD_COUNT_RX = rxAll(`${WB_START}(${NUMBER})\\s*${FILLER}(${alt(CHILD_NOUNS)})`);
const ADULT_COUNT_RX = rxAll(`${WB_START}(${NUMBER})\\s*${FILLER}(${alt(ADULT_NOUNS)})`);
const GENERIC_COUNT_RX = rxAll(`${WB_START}(${NUMBER})\\s*${FILLER}(${alt(GENERIC_NOUNS)})`);
const CHILD_NOUN_RX = rxAll(words(CHILD_NOUNS));
const TWINS_RX = rxAll(words(['twins', 'gemelos', 'gemelas', 'mellizos']));
const BOTH_OF_US_RX = rx(words(['both of us', 'the two of us', 'los dos', 'las dos']));
const ME_AND_RELATION_RX = rx(
  `${WB_START}(?:me|i)\\s*(?:,|and|&|\\+|y)\\s*(?:my|mi)\\s+${alt(ADULT_RELATIONS)}`
  + `|${WB_START}(?:my|mi)\\s+${alt(ADULT_RELATIONS)}\\s*(?:and|&|\\+|y)\\s*(?:me|i|yo)${WB_END}`);
const ME_AND_KIDS_RX = rx(`${WB_START}(?:me|i)\\s*(?:,|and|&|\\+|y)\\s*(?:my|mi|mis)\\s+(${NUMBER})?\\s*`
  + `${FILLER}${alt(CHILD_NOUNS)}`);
const FAMILY_OF_RX = rxAll(`${WB_START}(?:family of|familia de)\\s+(${NUMBER})${WB_END}`);
const ADULT_PERSON_RX = rxAll(words(ADULT_PERSON_NOUNS));
const RELAY_RX = rx(words(RELAY_WORDS));
const WE_RX = rx(words(WE_WORDS));
const ALONE_RX = rx(words(['alone', 'just me', 'only me', 'by myself', 'on my own', 'solo', 'sola',
  'solo yo', 'estoy solo', 'estoy sola']));
const AGE_RX = rx(`^\\s*(?:-|\\s)?(?:${AGE_UNITS.join('|')})${WB_END}`);

const UNACCENT: Record<string, string> = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n' };

/** Distinct matched words, accents stripped ("mamá" and "mama" are one person). */
function distinct(regex: RegExp, text: string): Set<string> {
  const out = new Set<string>();
  for (const m of finditer(regex, text)) out.add(m[0].replace(/[áéíóúñ]/g, c => UNACCENT[c]));
  return out;
}

export function parseNumber(token: string): number {
  const t = token.trim().toLowerCase();
  return /^[0-9]+$/.test(t) ? Number(t) : NUMBER_WORDS[t];
}

/** (count, noun_start, noun_end) for each numbered match that isn't an age ("8yr old son"). */
function countMatches(regex: RegExp, text: string): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (const m of finditer(regex, text)) {
    const numberEnd = m.indices![1][1];
    if (AGE_RX.test(text.slice(numberEnd))) continue;
    out.push([parseNumber(m[1]), m.indices![2][0], m.indices![2][1]]);
  }
  return out;
}

/** Returns adults and children, each clamped to 0–15 (§5.4 rules 1–6, plus the §4 count rule). */
export function resolveHeadcount(text: string): HeadcountResult {
  const t = normalize(text);

  // Rule 1: children.
  const numberedChildren = countMatches(CHILD_COUNT_RX, t);
  let children = numberedChildren.reduce((sum, [n]) => sum + n, 0);
  for (const m of finditer(CHILD_NOUN_RX, t)) {  // a child noun without a number → 1 each
    if (!numberedChildren.some(([, s, e]) => s <= m.index && m.index < e)) children += 1;
  }
  children += 2 * [...finditer(TWINS_RX, t)].length;

  // Rule 2: adults.
  let adults: number | null = null;
  const explicit = countMatches(ADULT_COUNT_RX, t).map(([n]) => n);
  if (explicit.length) adults = explicit.reduce((a, b) => a + b, 0);
  const generic = countMatches(GENERIC_COUNT_RX, t).map(([n]) => n);
  if (BOTH_OF_US_RX.test(t)) generic.push(2);
  for (const m of finditer(FAMILY_OF_RX, t)) generic.push(parseNumber(m[1]));
  if (generic.length) {
    const n = Math.max(...generic);
    const fromGeneric = children && n > children ? n - children : n;
    adults = adults === null ? fromGeneric : Math.max(adults, fromGeneric);
  }

  // Rule 3: "me and my <adult relation>" → at least 2 adults; "me and my N kids" → 1 adult.
  if (ME_AND_RELATION_RX.test(t)) adults = Math.max(adults ?? 0, 2);
  if (ME_AND_KIDS_RX.test(t)) adults = Math.max(adults ?? 0, 1);

  // Rule 4: alone.
  if (adults === null && ALONE_RX.test(t)) adults = 1;

  // No number given: count the people mentioned (§4) — the writer unless the message is
  // relayed, plus each distinct adult mentioned; "we/us/our" means at least 2 people.
  if (adults === null) {
    const relayed = RELAY_RX.test(t);
    let estimate = (relayed ? 0 : 1) + distinct(ADULT_PERSON_RX, t).size;
    if (!relayed && WE_RX.test(t)) estimate = Math.max(estimate, children ? 1 : 2);
    if (estimate > 0) adults = estimate;
  }

  // Rule 5: default 1 adult, 0 children (§5.4). Rule 6: clamp.
  return { adults: clamp15(adults ?? 1), children: clamp15(children) };
}
