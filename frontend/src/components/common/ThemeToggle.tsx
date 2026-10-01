import { Moon, Sun } from 'lucide-react';
import { usePreferences } from '@/context/PreferencesContext';

/** The Dark / Light switch. It lives in the header, next to the notifications bell and the profile avatar. */
export function ThemeToggle() {
  const { theme, toggleTheme, t } = usePreferences();
  const label = theme === 'light' ? t.switchToDark : t.switchToLight;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
      aria-label={label}
      title={label}
      data-testid="button-toggle-theme"
    >
      {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
