import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { storage } from '../lib/storage';
type Theme = 'dark' | 'light';
const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light';
/** First visit follows the phone's light/dark setting; the toggle's choice is remembered after that. */
const systemTheme = (): Theme => { try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch { return 'dark'; } };
const Context = createContext<{ theme: Theme; toggle: () => void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => storage.read('civicmesh:theme', systemTheme(), isTheme));
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0E0F14' : '#FFFFFF');
  }, [theme]);
  function toggle() { const next = theme === 'dark' ? 'light' : 'dark'; storage.write('civicmesh:theme', next); setTheme(next); }
  return <Context.Provider value={{ theme, toggle }}>{children}</Context.Provider>;
}
export function useTheme() { const value = useContext(Context); if (!value) throw new Error('ThemeProvider required'); return value; }
