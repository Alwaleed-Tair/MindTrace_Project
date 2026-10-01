import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { usePreferences } from '@/context/PreferencesContext';

export default function NotFound() {
  const { t } = usePreferences();
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold tracking-[-.04em]">404 · {t.pageNotFound}</h1>
        <Link href="/dashboard" className="mt-5 inline-block text-sm font-semibold text-primary hover:underline">{t.back}</Link>
      </div>
    </div>
  );
}
