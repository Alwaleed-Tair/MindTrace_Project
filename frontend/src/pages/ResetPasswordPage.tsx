import { LockKeyhole } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { LanguageToggle } from '@/components/common/LanguageToggle';
import { Logo } from '@/components/common/Logo';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { ApiError } from '@/lib/api';

/** Opened from the e-mailed link (/reset-password?token=...): choose a new password, then go straight in. */
export default function ResetPasswordPage() {
  const { t, dir } = usePreferences();
  const { resetPassword } = useAuth();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(useSearch()).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t.passwordTooShort);
    if (password !== confirm) return setError(t.passwordsDiffer);
    setBusy(true);
    try {
      await resetPassword(token, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const field = 'flex h-12 items-center gap-3 rounded-xl border border-input bg-background px-3.5 transition focus-within:border-primary';
  const input = 'min-w-0 flex-1 bg-transparent text-sm outline-none';
  return (
    <main className="min-h-[100dvh] bg-background" dir={dir} data-testid="reset-page">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
        <Logo />
        <LanguageToggle />
      </header>
      <section className="flex min-h-[calc(100dvh-92px)] items-center justify-center px-5 py-10 sm:px-8">
        <div className="surface w-full max-w-[430px] animate-in p-6 sm:p-9">
          <h1 className="text-center text-3xl font-semibold tracking-[-0.04em]">{t.resetTitle}</h1>
          <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">{t.resetSub}</p>
          {!token ? (
            <p className="mt-6 text-center text-sm font-semibold text-destructive" role="alert" data-testid="reset-missing">{t.resetMissing}</p>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold">{t.newPassword}</span>
                <span className={field}>
                  <LockKeyhole size={16} className="text-muted-foreground" />
                  <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={input} dir="ltr" data-testid="input-new-password" />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold">{t.confirmPassword}</span>
                <span className={field}>
                  <LockKeyhole size={16} className="text-muted-foreground" />
                  <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} dir="ltr" data-testid="input-confirm-password" />
                </span>
              </label>
              {error && <p className="text-xs font-semibold text-destructive" role="alert" data-testid="reset-error">{error}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-60" data-testid="button-reset-save">
                {busy ? t.saving : t.resetSave}
              </button>
            </form>
          )}
          <button type="button" onClick={() => navigate('/')} className="mt-5 w-full text-center text-xs font-semibold text-primary hover:underline" data-testid="button-reset-back">{t.backToSignIn}</button>
        </div>
      </section>
    </main>
  );
}
