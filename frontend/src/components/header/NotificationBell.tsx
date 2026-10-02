import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePreferences } from '@/context/PreferencesContext';
import { useNotifications } from '@/context/NotificationsContext';
import { relativeTime } from '@/lib/format';
import { notificationText } from '@/lib/notifications';

/** The bell: a badge with the unread count, and a list of what collaborators did in shared experiments. */
export function NotificationBell() {
  const { t, language, dir } = usePreferences();
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-primary/50 hover:text-foreground" aria-label={`${t.notifications}${unreadCount ? ` (${unreadCount})` : ''}`} data-testid="button-notifications">
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -end-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground" data-testid="badge-notifications">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} dir={dir} className="w-[340px] rounded-2xl border-border bg-card p-0 text-card-foreground shadow-[0_24px_60px_hsl(var(--foreground)/.16)]" data-testid="popover-notifications">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">{t.notifications}</h2>
          <button type="button" disabled={unreadCount === 0} onClick={() => void markAllRead()} className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 disabled:no-underline" data-testid="button-mark-all-read">
            {t.markAllRead}
          </button>
        </div>
        <ul className="max-h-[360px] overflow-y-auto scrollbar-thin">
          {items.length === 0 && <li className="px-5 py-10 text-center text-xs text-muted-foreground">{t.noNotifications}</li>}
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  void markRead([n.id]);
                  setOpen(false);
                  if (n.experiment?.id) navigate(`/experiments/${n.experiment.id}`);
                  else if (n.kind === 'team_added' || n.kind === 'team_joined') navigate('/team');
                }}
                className={`flex w-full items-start gap-3 px-5 py-3.5 text-start transition hover:bg-muted ${n.read ? '' : 'bg-primary/5'}`}
                data-testid={`notification-${n.id}`}
              >
                {n.actor ? <Avatar person={n.actor} size={30} /> : <span className="h-[30px] w-[30px]" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-5">{notificationText(n, t)}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">{relativeTime(n.created_at, language)}</span>
                </span>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="unread" />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
