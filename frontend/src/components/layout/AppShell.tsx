import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastViewport } from '@/components/header/ToastViewport';
import { usePreferences } from '@/context/PreferencesContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { dir } = usePreferences();
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
