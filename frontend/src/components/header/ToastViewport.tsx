import { Bell, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { useNotifications } from '@/context/NotificationsContext';
import { usePreferences } from '@/context/PreferencesContext';
import { notificationText } from '@/lib/notifications';

/** Active alerts: a card slides in when a collaborator adds or updates something in a shared experiment. */
export function ToastViewport() {
  const { toasts, dismissToast, markRead } = useNotifications();
  const { t, dir } = usePreferences();
  const [, navigate] = useLocation();
  return (
    <div className="pointer-events-none fixed bottom-5 end-5 z-[60] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-3" role="status" aria-live="polite" dir={dir} data-testid="toast-viewport">
      {toasts.map((n) => (
        <div key={n.id} className="pointer-events-auto animate-in flex items-start gap-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-[0_18px_50px_hsl(var(--foreground)/.18)]" data-testid="toast-notification">
          {n.actor ? <Avatar person={n.actor} size={34} /> : <Bell size={18} className="mt-1 text-primary" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-5" data-testid="toast-text">{notificationText(n, t)}</p>
            {n.experiment?.id && (
              <button
                type="button"
                className="mt-1.5 text-[11px] font-semibold text-primary hover:underline"
                onClick={() => {
                  void markRead([n.id]);
                  dismissToast(n.id);
                  navigate(`/experiments/${n.experiment!.id}`);
                }}
              >
                {t.view}
              </button>
            )}
          </div>
          <button type="button" onClick={() => dismissToast(n.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label={t.dismiss} data-testid="button-dismiss-toast">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
