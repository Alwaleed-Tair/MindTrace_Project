import { LogOut, Settings as SettingsIcon } from 'lucide-react';
import { Link } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { CopyButton } from '@/components/common/CopyButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';

/** The avatar in the header. Opens a card with the user's details, their unique ID and a working "Copy ID" button. */
export function ProfilePopover() {
  const { user, logout } = useAuth();
  const { t, dir } = usePreferences();
  if (!user) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="rounded-full transition hover:ring-2 hover:ring-primary/30" aria-label={t.openProfile} data-testid="avatar-user">
          <Avatar person={user} size={34} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} dir={dir} className="w-[300px] rounded-2xl border-border bg-card p-0 text-card-foreground shadow-[0_24px_60px_hsl(var(--foreground)/.16)]" data-testid="popover-profile">
        <div className="flex items-center gap-3 border-b border-border p-5">
          <Avatar person={user} size={48} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" data-testid="profile-name">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.lab || t.profileMenu}</p>
            <p className="truncate text-[11px] text-muted-foreground" data-testid="profile-email">{user.email}</p>
          </div>
        </div>
        <div className="border-b border-border p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{t.userId}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <code className="rounded-lg bg-muted px-2.5 py-1.5 font-mono text-xs tracking-wider" data-testid="profile-user-id" dir="ltr">{user.id}</code>
            <CopyButton value={user.id} testId="button-copy-user-id" />
          </div>
        </div>
        <div className="p-2">
          <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground" data-testid="link-profile-settings">
            <SettingsIcon size={15} />
            {t.settings}
          </Link>
          <button type="button" onClick={() => void logout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground" data-testid="button-sign-out">
            <LogOut size={15} />
            {t.signOut}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
