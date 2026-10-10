/** §5.4 medical keyword backstop — port of resolve_medical in src/models/resolvers.py. */
import { MedicalFlags } from '../protocol/enums';
import { WB_END, WB_START, finditer, negated, normalize, rxAll, words } from './common';

const CANT = "(?:can'?t|cannot|can not|cant)";

// Same order and patterns as MEDICAL_PATTERNS in Python.
const MEDICAL_PATTERNS: ReadonlyArray<readonly [number, readonly string[]]> = [
  [MedicalFlags.INSULIN, [
    words(['insulin', 'diabetic', 'diabetics', 'diabetes', 'blood sugar', 'type 1', 'type 2', 'type one',
      'type two', 'insulina', 'diab[eé]tic[oa]s?']),
    `${WB_START}sugar(?:'s|\\s+is|\\s+was|\\s+level)${WB_END}`,
  ]],
  [MedicalFlags.OXYGEN, [
    `${WB_START}${CANT}\\s+breath(?:e|ing)?${WB_END}`,
    words(['trouble breathing', 'difficulty breathing', 'hard to breathe', 'struggling to breathe',
      'gasping', 'choking on smoke', 'oxygen', 'inhaler', 'asthma', 'no puedo respirar', 'no puede respirar']),
  ]],
  [MedicalFlags.BLEEDING, [
    words(['bleeding', 'bleed', 'bleeds', 'blood everywhere', 'gash', 'gashes', 'deep cut', 'deep cuts', 'tourniquet']),
    `${WB_START}hemorrhag[a-z]*`,
    `${WB_START}haemorrhag[a-z]*`,
    `${WB_START}sangr[a-z\\u00C0-\\u00FF]*`,
  ]],
  [MedicalFlags.HYPOTHERMIA, [
    `${WB_START}hypotherm[a-z]*`,
    words(['freezing cold', 'shivering', 'frostbite', 'frost bite', 'blue lips', 'lips (?:are |turning )?blue',
      'hipotermia']),
  ]],
  [MedicalFlags.MOBILITY_IMPAIRED, [
    words(['wheelchair', 'wheel chair', 'pinned', 'bedridden', 'bed ridden', 'silla de ruedas']),
    `${WB_START}${CANT}\\s+walk${WB_END}`,
    `${WB_START}broken\\s+(?:leg|legs|hip|hips|pelvis)${WB_END}`,
    `${WB_START}paraly[sz][a-z]*`,
  ]],
  [MedicalFlags.CARDIAC, [
    words(['chest pain', 'chest pains', 'heart attack', 'cardiac', 'pacemaker', 'heart condition',
      'heart failure', 'dolor de pecho', 'infarto']),
  ]],
  [MedicalFlags.PREGNANCY_INFANT, [
    words(['pregnant', 'contractions', 'in labor', 'in labour', 'water broke', 'waters broke', 'newborn',
      'newborns', 'infant', 'infants', 'embarazada']),
  ]],
  [MedicalFlags.BURNS, [
    `${WB_START}(?:burned|burns|burnt)(?!\\s+barrel)${WB_END}`,
    `${WB_START}scald[a-z]*`,
    `${WB_START}blister[a-z]*`,
    `${WB_START}quemad[a-z]*`,
  ]],
];
const MEDICAL_RX = MEDICAL_PATTERNS.map(([flag, patterns]) => [flag, patterns.map(rxAll)] as const);

/** Medical keyword backstop → MedicalFlags bits 0–7. Negated mentions ("not bleeding") are skipped. */
export function resolveMedical(text: string): number {
  const t = normalize(text);
  let flags = 0;
  for (const [flag, patterns] of MEDICAL_RX) {
    if (patterns.some(regex => [...finditer(regex, t)].some(m => !negated(t, m.index)))) flags |= flag;
  }
  return flags;
}
