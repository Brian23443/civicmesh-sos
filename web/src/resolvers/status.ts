/** Stage 1 status keyword backstop — port of resolve_status in src/models/resolvers.py.
 * TRAPPED > EXPOSED > SHELTERED; negated mentions ("we are NOT trapped") are skipped.
 * Returns null when no keyword applies. SHELTERED is 0 — callers must use `??`, never `||`.
 */
import { RescueStatus } from '../protocol/enums';
import { finditer, negated, normalize, rxAll, words } from './common';

const STATUS_KEYWORDS: ReadonlyArray<readonly [number, readonly string[]]> = [
  [RescueStatus.TRAPPED, [
    'trapped', 'stuck', 'pinned', "can't get out", 'cant get out', 'cannot get out', 'can not get out',
    "can't escape", 'cant escape', 'cannot escape', "can't open", 'cant open', 'jammed', 'blocked in',
    'cut off', 'buried', 'under the rubble', 'under rubble', 'atrapad[oa]s?', 'no podemos salir',
    'no puedo salir', 'no puede salir', 'encerrad[oa]s?',
  ]],
  [RescueStatus.EXPOSED, [
    'on the roof', 'on our roof', 'in the water', 'outside', 'outdoors', 'in the street', 'on the street',
    'in the car', 'in our car', 'in my car', 'in the truck', 'on the road', 'in a boat', 'on the bridge',
    'en el techo', 'afuera', 'en la calle', 'en el agua', 'en el carro',
  ]],
  [RescueStatus.SHELTERED, [
    'inside', 'indoors', 'at home', 'in the house', 'in our house', 'in the shelter', 'at the shelter',
    'sheltering', 'sheltered', 'safe at', 'adentro', 'dentro', 'en casa', 'en el refugio',
  ]],
];
const STATUS_RX = STATUS_KEYWORDS.map(([status, list]) => [status, rxAll(words(list))] as const);

export function resolveStatus(text: string): number | null {
  const t = normalize(text);
  for (const [status, regex] of STATUS_RX) {
    if ([...finditer(regex, t)].some(m => !negated(t, m.index))) return status;
  }
  return null;
}
