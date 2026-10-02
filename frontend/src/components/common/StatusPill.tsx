import { usePreferences } from '@/context/PreferencesContext';
import type { Status } from '@/lib/types';

export function StatusPill({ status }: { status: Status }) {
  const { t } = usePreferences();
  const label = status === 'Active' ? t.active : status === 'Paused' ? t.paused : t.completed;
  const style = status === 'Active' ? 'bg-primary/12 text-primary' : status === 'Paused' ? 'bg-kind-dec-soft text-kind-dec' : 'bg-primary text-primary-foreground';
  const dot = status === 'Active' ? 'bg-primary' : status === 'Paused' ? 'bg-kind-dec' : 'bg-primary-foreground';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${style}`} data-testid={`status-${status.toLowerCase()}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
