import { HazardClass as H, MedicalFlags as M, RescueStatus as S, TriagePriority as P } from '../protocol/enums';
import { resolveMedical } from '../resolvers/medical';
import type { TriageResult, Classifier, HazardScores, MockClassifierOptions, NullableScores4, Scores4 } from './types';

/** Development-only heuristics; not model predictions or confidence estimates. */
export class MockClassifier implements Classifier {
  readonly kind = 'mock' as const;
  private readonly delayMs: number;
  constructor({ delayMs = 300 }: MockClassifierOptions = {}) {
    if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 2_147_483_647) throw new RangeError('Invalid mock delay');
    this.delayMs = delayMs;
  }
  async classify(text: string): Promise<TriageResult> {
    if (this.delayMs > 0) await new Promise<void>(resolve => setTimeout(resolve, this.delayMs));
    const medical = resolveMedical(text);
    let hazard: TriageResult['hazard'] = H.NONE;
    if (/\b(?:flood(?:ing)?|water\s+(?:is\s+)?rising|rising\s+water)\b/i.test(text)) hazard = H.FLOOD;
    else if (/\b(?:fire|smoke|flames|wildfire)\b/i.test(text)) hazard = H.FIRE_SMOKE;
    else if (/\b(?:collapse(?:d)?|rubble)\b/i.test(text)) hazard = H.STRUCTURAL_COLLAPSE;
    else if (medical) hazard = H.MEDICAL_CRISIS;
    let status: TriageResult['status'] = S.UNKNOWN;
    if (/\b(?:trapped|pinned|stuck|cannot\s+escape)\b/i.test(text)) status = S.TRAPPED;
    else if (/\b(?:outdoors|exposed|on\s+(?:a\s+)?roof)\b/i.test(text)) status = S.EXPOSED;
    else if (/\b(?:shelter(?:ed)?|safe\s+inside)\b/i.test(text)) status = S.SHELTERED;
    let priority: TriageResult['priority'] = hazard !== H.NONE ? P.DELAYED : P.MINOR;
    if ((status === S.TRAPPED && hazard !== H.NONE) || (medical & (M.OXYGEN | M.BLEEDING | M.CARDIAC))) priority = P.IMMEDIATE;
    if (/\b(?:deceased|dead|no\s+pulse)\b/i.test(text)) priority = P.DECEASED;
    const priorityScores: Scores4 = [0, 0, 0, 0]; priorityScores[priority] = 1;
    const hazardScores = [...Array(15).fill(0), null] as HazardScores; hazardScores[hazard] = 1;
    const statusScores: NullableScores4 = [0, 0, 0, null];
    if (status !== S.UNKNOWN) statusScores[status] = 1;
    return { priority, hazard, status, medicalProbs: null, thirdPartyProb: null,
      scores: { priority: priorityScores, hazard: hazardScores, status: statusScores } };
  }
}
