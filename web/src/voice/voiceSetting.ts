/** "Voice guidance" on/off — off by default (VoiceOver users already hear the screen), remembered on the phone. */
import { useSyncExternalStore } from 'react';
import { storage } from '../lib/storage';

const KEY = 'rescunote:voice';
const listeners = new Set<() => void>();
let enabled = storage.read<boolean>(KEY, false, (v): v is boolean => typeof v === 'boolean');

export function setVoiceEnabled(on: boolean): void {
  enabled = on; storage.write(KEY, on);
  listeners.forEach(fn => fn());
}
export function isVoiceEnabled(): boolean { return enabled; }
export function useVoiceEnabled(): boolean {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => enabled);
}
