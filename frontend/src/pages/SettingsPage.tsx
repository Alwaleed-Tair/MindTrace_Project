import { Check, KeyRound, Moon, SlidersHorizontal, Sun, TestTube2 } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CopyButton } from '@/components/common/CopyButton';
import { DeleteAccountSection, PasswordSection, ProfileSection } from '@/components/settings/AccountSections';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import { usePreferences } from '@/context/PreferencesContext';
import { api, ApiError } from '@/lib/api';

export default function SettingsPage() {
  const { t, theme, setTheme, language, setLanguage } = usePreferences();
  const { user } = useAuth();
  const { triggerLocalMock, triggerServerMock } = useNotifications();
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, retry: false });
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [mockResult, setMockResult] = useState<string | null>(null);

  const createToken = async () => {
    setTokenError(null);
    try {
      setToken((await api.createApiToken('laptop bridge')).token);
    } catch (e) {
      setTokenError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const choice = (active: boolean) => `flex items-center gap-3 rounded-xl border p-3 text-start transition ${active ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/40'}`;

  return (
    <div className="animate-in max-w-3xl">
      <p className="font-mono text-[10px] uppercase tracking-[.14em] text-primary">MindTrace / preferences</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-.055em]">{t.settings}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t.settingsSub}</p>
      <div className="mt-9 overflow-hidden surface">
        {user && <ProfileSection key={user.id} user={user} />}
        <div className="border-b border-border p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <Sun size={17} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold">{t.appearance}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t.theme}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setTheme('light')} className={choice(theme === 'light')} data-testid="button-theme-light">
              <Sun size={16} className={theme === 'light' ? 'text-primary' : 'text-muted-foreground'} />
              <span className="text-xs font-semibold">{t.light}</span>
              {theme === 'light' && <Check size={14} className="ms-auto text-primary" />}
            </button>
            <button type="button" onClick={() => setTheme('dark')} className={choice(theme === 'dark')} data-testid="button-theme-dark">
              <Moon size={16} className={theme === 'dark' ? 'text-primary' : 'text-muted-foreground'} />
              <span className="text-xs font-semibold">{t.dark}</span>
              {theme === 'dark' && <Check size={14} className="ms-auto text-primary" />}
            </button>
          </div>
        </div>
        <div className="border-b border-border p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <SlidersHorizontal size={17} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold">{t.langSetting}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t.langSettingSub}</p>
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setLanguage('en')} className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${language === 'en' ? 'border-primary bg-primary/8 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`} data-testid="button-language-english">English</button>
            <button type="button" onClick={() => setLanguage('ar')} className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${language === 'ar' ? 'border-primary bg-primary/8 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`} data-testid="button-language-arabic">العربية</button>
          </div>
        </div>
        <div className="border-b border-border p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <KeyRound size={17} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold">{t.bridgeTitle}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t.bridgeSub}</p>
            </div>
          </div>
          <div className="mt-5">
            {token ? (
              <div className="flex flex-wrap items-center gap-3" data-testid="bridge-token-box">
                <code className="max-w-full break-all rounded-lg bg-muted px-2.5 py-1.5 font-mono text-[11px]" dir="ltr" data-testid="bridge-token">{token}</code>
                <CopyButton value={token} label={t.copyToken} testId="button-copy-token" />
                <p className="w-full text-[11px] font-semibold text-amber-700 dark:text-amber-300">{t.bridgeShownOnce}</p>
              </div>
            ) : (
              <button type="button" onClick={() => void createToken()} className="rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold transition hover:border-primary/50" data-testid="button-create-token">{t.bridgeGenerate}</button>
            )}
            {tokenError && <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{tokenError}</p>}
          </div>
        </div>
        {user && <PasswordSection />}
        {user && <DeleteAccountSection />}
        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <TestTube2 size={17} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold">{t.testing}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t.testingSub}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => triggerLocalMock()} className="rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold transition hover:border-primary/50" data-testid="button-mock-local">{t.mockLocal}</button>
            <button type="button" onClick={() => void triggerServerMock().then((r) => setMockResult(r))} className="rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold transition hover:border-primary/50" data-testid="button-mock-server">
              {t.mockServer}
            </button>
          </div>
          {mockResult && <p className="mt-2 text-[11px] text-muted-foreground" data-testid="mock-result">{mockResult === 'server' ? 'server' : health.data?.dev_tools ? 'local' : 'local (server dev tools are off)'}</p>}
        </div>
      </div>
    </div>
  );
}
