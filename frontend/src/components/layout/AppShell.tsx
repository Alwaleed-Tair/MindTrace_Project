import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastViewport } from '@/components/header/ToastViewport';
import { usePreferences } from '@/context/PreferencesContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { dir } = usePreferences();
  return (
    <div className="app-noise flex min-h-[100dvh] bg-background" dir={dir}>
      <Sidebar />
      <main className="dashboard-grid min-w-0 flex-1">
        <Header />
        <div className="mx-auto max-w-[1360px] p-5 sm:p-8 lg:p-10">{children}</div>
      </main>
      <ToastViewport />
    </div>
  );
}
