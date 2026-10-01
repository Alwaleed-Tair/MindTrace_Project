import { Ellipsis } from 'lucide-react';
import { LanguageToggle } from '@/components/common/LanguageToggle';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { NotificationBell } from '@/components/header/NotificationBell';
import { ProfilePopover } from '@/components/header/ProfilePopover';
import { SIDEBAR_ID } from '@/components/layout/Sidebar';
import { usePreferences } from '@/context/PreferencesContext';

export function Header() {
  const { t, toggleSidebar, sidebarVisible } = usePreferences();
  return (
    <header className="flex h-[70px] items-center justify-between border-b border-border bg-background/75 px-5 backdrop-blur-md sm:px-8">
      {/* three-dots trigger at the start (left) edge: opens/closes the sidebar on every screen size */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
        aria-label={t.toggleSidebar}
        aria-controls={SIDEBAR_ID}
        aria-expanded={sidebarVisible}
        data-testid="button-toggle-sidebar"
      >
        <Ellipsis size={18} />
      </button>
      <div className="flex items-center gap-2 sm:gap-3">
        <LanguageToggle />
        {/* theme switch, notifications and profile sit together */}
        <ThemeToggle />
        <NotificationBell />
        <ProfilePopover />
      </div>
    </header>
  );
}
