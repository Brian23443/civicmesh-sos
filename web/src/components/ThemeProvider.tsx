import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { storage } from '../lib/storage';
type Theme = 'dark' | 'light';
const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light';
const Context = createContext<{ theme: Theme; toggle: () => void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => storage.read('civicmesh:theme', 'dark', isTheme));
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101820' : '#F3F5F7');
  }, [theme]);
  function toggle() { const next = theme === 'dark' ? 'light' : 'dark'; storage.write('civicmesh:theme', next); setTheme(next); }
  return <Context.Provider value={{ theme, toggle }}>{children}</Context.Provider>;
}
export function useTheme() { const value = useContext(Context); if (!value) throw new Error('ThemeProvider required'); return value; }
