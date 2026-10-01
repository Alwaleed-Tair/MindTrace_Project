import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { safeStorage } from '@/lib/storage';
import { translations, type Strings } from '@/lib/i18n';
import type { Language, Theme } from '@/lib/types';

const KEY = 'mindtrace.prefs';

interface Saved {
  language?: Language;
  theme?: Theme;
  sidebarCollapsed?: boolean;
}

function readSaved(): Saved {
  try {
    return JSON.parse(safeStorage.get(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

interface PreferencesValue {
  language: Language;
  setLanguage: (l: Language) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  t: Strings;
  dir: 'ltr' | 'rtl';
  isDesktop: boolean;
  /** Desktop: the sidebar is hidden (remembered). */
  sidebarCollapsed: boolean;
  /** Mobile: the sidebar overlay is open (not remembered). */
  mobileNavOpen: boolean;
  /** True when the sidebar is visible right now, on whichever screen size we are. */
  sidebarVisible: boolean;
  toggleSidebar: () => void;
  closeMobileNav: () => void;
}

const Ctx = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const saved = useMemo(readSaved, []);
  const [language, setLanguage] = useState<Language>(saved.language === 'ar' ? 'ar' : 'en');
  const [theme, setTheme] = useState<Theme>(saved.theme ?? (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(saved.sidebarCollapsed === true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.lang = language;
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [theme, language]);

  useEffect(() => {
    safeStorage.set(KEY, JSON.stringify({ language, theme, sidebarCollapsed }));
  }, [language, theme, sidebarCollapsed]);

  useEffect(() => {
    if (isDesktop) setMobileNavOpen(false); // growing the window closes the phone overlay
  }, [isDesktop]);

  const toggleSidebar = useCallback(() => {
    if (isDesktop) setSidebarCollapsed((v) => !v);
    else setMobileNavOpen((v) => !v);
  }, [isDesktop]);

  const value = useMemo<PreferencesValue>(
    () => ({
      language,
      setLanguage,
      theme,
      setTheme,
      toggleTheme: () => setTheme((x) => (x === 'light' ? 'dark' : 'light')),
      t: translations[language],
      dir: language === 'ar' ? 'rtl' : 'ltr',
      isDesktop,
      sidebarCollapsed,
      mobileNavOpen,
      sidebarVisible: isDesktop ? !sidebarCollapsed : mobileNavOpen,
      toggleSidebar,
      closeMobileNav: () => setMobileNavOpen(false),
    }),
    [language, theme, isDesktop, sidebarCollapsed, mobileNavOpen, toggleSidebar],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences(): PreferencesValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return v;
}
