import { storage, type createStorage } from './storage';
import { fromHex, toHex } from '../protocol/hex';
import { packFrame } from '../protocol/packer';
import type { FrameFields } from '../protocol/types';

export interface SentReport {
  id: string;
  hex: string;
  handedAt: number;
  status: 'handed to relay';
}
export interface ReportSnapshot { deviceId: number; seq: number; reports: SentReport[] }
const KEY = 'civicmesh:reports:v1';
const uint = (value: unknown, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
function isSnapshot(value: unknown): value is ReportSnapshot {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ReportSnapshot>;
  if (!uint(state.deviceId,65535) || !uint(state.seq,255) || !Array.isArray(state.reports)) return false;
  return state.reports.every(report => {
    if (!report || typeof report !== 'object' || typeof report.id !== 'string' || report.status !== 'handed to relay'
      || typeof report.handedAt !== 'number' || !Number.isFinite(report.handedAt) || report.handedAt < 0 || report.handedAt > 8.64e12 || typeof report.hex !== 'string') return false;
    try { fromHex(report.hex); return true; } catch { return false; }
  });
}
function randomDeviceId(): number { return crypto.getRandomValues(new Uint16Array(1))[0]; }

/** One write atomically stores history and next sequence before relay navigation. */
export function createReportStore(safeStorage: ReturnType<typeof createStorage> = storage, deviceId = randomDeviceId) {
  let state: ReportSnapshot | undefined;
  function snapshot(): ReportSnapshot {
    if (!state) {
      const saved = safeStorage.read<ReportSnapshot | null>(KEY,null,(v): v is ReportSnapshot | null => v === null || isSnapshot(v));
      state = saved ?? { deviceId: deviceId(), seq:0, reports:[] };
      if (!saved) safeStorage.write(KEY,state);
    }
    // Consumers cannot accidentally mutate the live sequence or history.
    return { ...state, reports:state.reports.map(report => ({...report})) };
  }
  return {
    snapshot,
    get persistent() { return safeStorage.persistent; },
    handoff(fields: FrameFields): SentReport {
      const current = snapshot();
      if (fields.deviceId !== current.deviceId || fields.seq !== current.seq) throw Error('Report sequence changed. Return to review before sending.');
      const hex = toHex(packFrame(fields));
      const report: SentReport = { id:`${current.deviceId}-${current.seq}-${fields.timestamp}-${current.reports.length}`,
        hex, handedAt:Date.now()/1000, status:'handed to relay' };
      state = { deviceId:current.deviceId, seq:(current.seq+1)&255, reports:[report,...current.reports] };
      safeStorage.write(KEY,state);
      return {...report};
    },
  };
}
export type ReportStore = ReturnType<typeof createReportStore>;
export const reportStore = createReportStore();
export const RELAY_URL = 'http://192.168.4.1/sos?d=';
export function navigateToRelay(hex: string): void { fromHex(hex); window.location.assign(RELAY_URL + hex); }
