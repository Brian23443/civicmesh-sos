export interface StorageBackend { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/** Never let unavailable Safari/private-mode storage interrupt the UI. */
export function createStorage(getBackend: () => StorageBackend = () => window.localStorage) {
  const memory = new Map<string, string>();
  const removed = new Set<string>();
  let available = true;
  return {
    get persistent() { return available; },
    read<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
      let raw = memory.get(key) ?? null;
      if (removed.has(key)) return fallback;
      if (!memory.has(key)) {
        try { raw = getBackend().getItem(key); } catch { available = false; }
      }
      if (raw === null) return fallback;
      try { const value: unknown = JSON.parse(raw); return valid(value) ? value : fallback; }
      catch { return fallback; }
    },
    write<T>(key: string, value: T): boolean {
      try {
        const raw = JSON.stringify(value);
        memory.set(key, raw); removed.delete(key);
        try { getBackend().setItem(key, raw); return true; } catch { available = false; return false; }
      } catch { return false; }
    },
    remove(key: string) {
      memory.delete(key); removed.add(key);
      try { getBackend().removeItem(key); } catch { available = false; }
    },
  };
}
export const storage = createStorage();
