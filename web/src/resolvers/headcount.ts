export interface HeadcountResult { adults: number; children: number }

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10,
};
const NUMBER = `(?:a\\s+couple|both|${Object.keys(WORD_NUMBERS).join('|')}|[0-9]{1,2}|an?|a)`;
const CHILD = '(?:bab(?:y|ies)|infants?|newborns?|toddlers?|kids?|child(?:ren)?|sons?|daughters?|boys?|girls?|teens?|teenagers?|bebes?|ninos?|ninas?|hijos?|hijas?|twins)';
const ADULT = '(?:adults?|people|ppl|persons?|of\\s+us|men|women|neighbors?|workers?|passengers?|students?|guests?|personas|adultos)';
const GENERIC = new Set(['people', 'ppl', 'person', 'persons', 'of us', 'neighbors', 'neighbor',
  'workers', 'worker', 'passengers', 'passenger', 'students', 'student', 'guests', 'guest', 'personas']);
const LEFT = '(?<![\\p{L}\\p{N}])';
const RIGHT = '(?![\\p{L}\\p{N}])';
const clamp = (n: number) => Math.max(0, Math.min(15, n));
function numberValue(text: string): number {
  const number = text.replace(/\s+/g, ' ');
  if (number === 'a couple' || number === 'both') return 2;
  if (number === 'a' || number === 'an') return 1;
  return WORD_NUMBERS[number] ?? Number(number);
}

/** §5.4. Repeated mentions use the largest count, avoiding accidental double-counting.
 * Multi-mention behavior is provisional until the T1 Python parity fixtures arrive.
 */
export function resolveHeadcount(text: string): HeadcountResult {
  const normalized = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  let children = 0;
  const childPattern = new RegExp(`${LEFT}(?:(${NUMBER})\\s+)?(${CHILD})${RIGHT}`, 'gu');
  for (const match of normalized.matchAll(childPattern)) {
    const n = match[1] ? numberValue(match[1]) : match[2] === 'twins' ? 2 : 1;
    children = Math.max(children, n);
  }
  const counts: number[] = [];
  const adultPattern = new RegExp(`${LEFT}(${NUMBER})\\s+(${ADULT})${RIGHT}`, 'gu');
  for (const match of normalized.matchAll(adultPattern)) {
    const total = numberValue(match[1]);
    const noun = match[2].replace(/\s+/g, ' ');
    counts.push(GENERIC.has(noun) && children > 0 && total > children ? total - children : total);
  }
  // Standalone "a couple" is a count only when it was not attached to a counted noun.
  if (new RegExp(`${LEFT}a\\s+couple${RIGHT}(?!\\s+(?:${CHILD}|${ADULT})${RIGHT})`, 'u').test(normalized)) counts.push(2);
  let adults = counts.length ? Math.max(...counts) : 0;
  const relation = '(?:wife|husband|mom|dad|mother|father|sister|brother|partner|friend|grandma|grandpa|grandmother|grandfather|aunt|uncle|spouse|boyfriend|girlfriend|roommate|cousin)';
  if (new RegExp(`${LEFT}me\\s+and\\s+my\\s+${relation}${RIGHT}`, 'u').test(normalized)) adults = Math.max(adults, 2);
  if (new RegExp(`${LEFT}me\\s+and\\s+my\\s+(?:${NUMBER}\\s+)?${CHILD}${RIGHT}`, 'u').test(normalized)) adults = Math.max(adults, 1);
  if (new RegExp(`${LEFT}(?:alone|just\\s+me)${RIGHT}`, 'u').test(normalized)) adults = 1;
  return { adults: clamp(adults), children: clamp(children) };
}
