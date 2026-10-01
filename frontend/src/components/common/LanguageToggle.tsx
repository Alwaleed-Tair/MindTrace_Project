import { usePreferences } from '@/context/PreferencesContext';

export function LanguageToggle({ inverse = false }: { inverse?: boolean }) {
  const { language, setLanguage, t } = usePreferences();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5 ${inverse ? 'border-white/20 bg-white/10 text-white hover:bg-white/15' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
      data-testid="button-toggle-language"
    >
      <span className="font-mono text-[10px]">{language === 'en' ? 'EN' : 'ع'}</span>
      <span>{t.language}</span>
    </button>
  );
}
