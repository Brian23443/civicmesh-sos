import { describe, expect, it } from 'vitest';
import phrases from './phrases.en.json';
import { readbackKeys } from './speech';

const base = { priority: 2, hazard: 1, status: 2, adults: 2, children: 1, medicalFlags: 0b11, thirdParty: false } as const;

describe('spoken read-back', () => {
  it('reads what will be sent, in a responder\'s order', () => {
    expect(readbackKeys(base, 'found')).toEqual(['readback_intro', 'priority_2', 'hazard_1', 'status_2', 'people_3', 'children_1',
      'needs_intro', 'medical_0', 'and', 'medical_1', 'location_found', 'readback_outro', 'wifi']);
  });
  it('skips "no hazard", children and needs when there are none; flags third-party reports', () => {
    expect(readbackKeys({ ...base, hazard: 0, children: 0, medicalFlags: 0, thirdParty: true }, 'none'))
      .toEqual(['readback_intro', 'priority_2', 'status_2', 'people_2', 'third_party', 'location_none', 'readback_outro', 'wifi']);
  });
  it('only ever asks for phrases that exist in the voice pack', () => {
    for (let p = 0; p < 4; p++) for (let h = 0; h < 16; h++) for (let s = 0; s < 4; s++)
      for (const [a, c] of [[0, 0], [1, 0], [15, 15], [3, 2]]) for (const m of [0, 0xff, 0b10100])
        for (const loc of ['found', 'searching', 'none'] as const)
          for (const key of readbackKeys({ priority: p as 0, hazard: h as 0, status: s as 0, adults: a, children: c, medicalFlags: m, thirdParty: true }, loc))
            expect(phrases).toHaveProperty(key);
  });
});
