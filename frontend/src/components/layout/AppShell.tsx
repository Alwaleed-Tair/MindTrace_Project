import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastViewport } from '@/components/header/ToastViewport';
import { usePreferences } from '@/context/PreferencesContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { dir } = usePreferences();
  const [location] = useLocation();
  // a new page starts at the top (the experiment page then scrolls to a note itself when one was picked)
  useEffect(() => {
    try { window.scrollTo(0, 0); } catch { /* jsdom */ }
  }, [location]);
  return (
    <div className="flex min-h-[100dvh] bg-background" dir={dir}>
      <Sidebar />
      <main className="min-w-0 flex-1">
        <Header />
        <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</div>
      </main>
      <ToastViewport />
    </div>
  );
}
