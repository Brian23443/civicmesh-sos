import { MedicalFlags } from '../protocol/enums';

// Unicode boundaries preserve whole-word matching for accented Spanish keywords.
const word = (pattern: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'iu');
const rules: ReadonlyArray<readonly [number, RegExp]> = [
  [MedicalFlags.INSULIN, word("insulin|diabetic|diabetes|blood\\s+sugar|sugar\\s+is|sugar's|type\\s+[12]|insulina|diab[eé]tic[\\p{L}]*")],
  [MedicalFlags.OXYGEN, word("(?:can't|cant|cannot)\\s+breath(?:e)?|trouble\\s+breathing|gasping|choking\\s+on\\s+smoke|oxygen|inhaler|asthma|no\\s+puedo\\s+respirar")],
  [MedicalFlags.BLEEDING, word('bleeding|blood\\s+everywhere|hemorrhag[\\p{L}]*|gash|deep\\s+cut|tourniquet|sangr[\\p{L}]*')],
  [MedicalFlags.HYPOTHERMIA, word('hypotherm[\\p{L}]*|freezing\\s+cold|shivering|frostbite|blue\\s+lips|hipotermia')],
  [MedicalFlags.MOBILITY_IMPAIRED, word("wheelchair|(?:can't|cant|cannot)\\s+walk|broken\\s+(?:leg|hip|pelvis)|pinned|bedridden|paralyz[\\p{L}]*|silla\\s+de\\s+ruedas")],
  [MedicalFlags.CARDIAC, word('chest\\s+pain|heart\\s+attack|cardiac|pacemaker|heart\\s+condition|dolor\\s+de\\s+pecho|infarto')],
  [MedicalFlags.PREGNANCY_INFANT, word('pregnant|contractions|in\\s+labor|water\\s+broke|newborn|infant|embarazada')],
  [MedicalFlags.BURNS, word('burned|burns|burnt|scald[\\p{L}]*|blister[\\p{L}]*|quemad[\\p{L}]*')],
];

/** §5.4 keyword backstop, only medical bits 0–7. No severity/negation inference. */
export function resolveMedical(text: string): number {
  const normalized = text.normalize('NFC').replace(/[’‘]/g, "'");
  let mask = 0;
  for (const [flag, pattern] of rules) if (pattern.test(normalized)) mask |= flag;
  return mask;
}
