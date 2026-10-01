import { ArrowLeft, ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { LanguageToggle } from '@/components/common/LanguageToggle';
import { Logo } from '@/components/common/Logo';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { ApiError } from '@/lib/api';

function Field({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold">{label}</span>
      <span className="flex h-12 items-center gap-3 rounded-xl border border-input bg-background px-3.5 transition focus-within:border-primary">
        <Icon size={16} className="text-muted-foreground" />
        {children}
      </span>
    </label>
  );
}

const inputClass = 'min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/55';

export default function SignInPage() {
  const { t, language, dir } = usePreferences();
  const { login, register, demo, status, recheck } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [lab, setLab] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(() => (mode === 'login' ? login(email, password, remember) : register(name, email, password, lab)));
  };

  const Arrow = language === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <main className="app-noise min-h-[100dvh] bg-background" dir={dir}>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
        <Logo />
        <LanguageToggle />
      </header>
      <section className="flex min-h-[calc(100dvh-92px)] items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[430px] animate-in">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-[0_24px_70px_hsl(var(--primary)/.08)] sm:p-9">
            <div className="mb-8 text-center">
              <div className="mb-6 flex justify-center sm:hidden"><Logo compact /></div>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-primary">MindTrace / 01</p>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{mode === 'login' ? t.signIn : t.signUp}</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{mode === 'login' ? t.signInSub : t.signUpSub}</p>
            </div>

            {status === 'offline' && (
              <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-xs text-destructive" role="alert" data-testid="server-offline">
                <p className="font-semibold">{t.serverOffline}</p>
                <p className="mt-1 text-destructive/80">{t.serverOfflineSub}</p>
                <button type="button" onClick={() => void recheck()} className="mt-2 font-semibold underline" data-testid="button-retry-server">{t.retry}</button>
              </div>
            )}

            <form onSubmit={submit} className="space-y-5" noValidate={false}>
              {mode === 'register' && (
                <>
                  <Field icon={UserRound} label={t.name}>
                    <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} autoComplete="name" className={inputClass} data-testid="input-name" />
                  </Field>
                  <Field icon={UserRound} label={t.lab}>
                    <input maxLength={80} value={lab} onChange={(e) => setLab(e.target.value)} className={inputClass} data-testid="input-lab" />
                  </Field>
                </>
              )}
              <Field icon={Mail} label={t.email}>
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} className={inputClass} dir="ltr" data-testid="input-email" />
              </Field>
              <Field icon={LockKeyhole} label={t.password}>
                <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'login' ? t.passwordPlaceholder : t.passwordNew} className={inputClass} dir="ltr" data-testid="input-password" />
              </Field>
              {mode === 'login' && (
                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-primary" data-testid="checkbox-remember" />
                    {t.remember}
                  </label>
                </div>
              )}
              {error && <p className="text-xs font-semibold text-destructive" role="alert" data-testid="auth-error">{error}</p>}
              <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_10px_25px_hsl(var(--primary)/.15)] transition hover:-translate-y-0.5 disabled:opacity-60" data-testid="button-sign-in">
                {mode === 'login' ? t.signInButton : t.signUpButton}
                <span dir="ltr"><Arrow size={16} /></span>
              </button>
            </form>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} className="mt-4 w-full text-center text-xs font-semibold text-primary hover:underline" data-testid="button-switch-mode">
              {mode === 'login' ? t.noAccount : t.haveAccount}
            </button>
            <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[.18em] text-muted-foreground/60"><span className="h-px flex-1 bg-border" />{t.or}<span className="h-px flex-1 bg-border" /></div>
            <button type="button" disabled={busy} onClick={() => void run(demo)} className="flex w-full items-center justify-center rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/50 hover:bg-muted disabled:opacity-60" data-testid="button-enter-demo">{t.demo}</button>
            <p className="mt-4 text-center text-[11px] text-muted-foreground">{t.demoSub}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
