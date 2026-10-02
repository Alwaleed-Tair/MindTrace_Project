import { CheckCircle2, PauseCircle } from 'lucide-react';
import { usePreferences } from '@/context/PreferencesContext';
import type { Status } from '@/lib/types';

/** The complete and pause buttons. Each says what it will do: pressing the active one ("Reopen" / "Resume") puts the experiment back to Active. */
export function StatusActions({ id, status, onSetStatus }: { id: string; status: Status; onSetStatus: (id: string, status: Status) => void }) {
  const { t } = usePreferences();
  const toggle = (target: Status) => onSetStatus(id, status === target ? 'Active' : target);
  return (
    <>
      <button type="button" aria-pressed={status === 'Completed'} onClick={() => toggle('Completed')} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${status === 'Completed' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'}`} data-testid={`button-complete-${id}`}>
        <CheckCircle2 size={13} />
        {status === 'Completed' ? t.reopen : t.markComplete}
      </button>
      <button type="button" aria-pressed={status === 'Paused'} onClick={() => toggle('Paused')} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${status === 'Paused' ? 'border-kind-dec bg-kind-dec text-white dark:text-background' : 'border-border bg-background text-muted-foreground hover:border-kind-dec/60 hover:text-foreground'}`} data-testid={`button-pause-${id}`}>
        <PauseCircle size={13} />
        {status === 'Paused' ? t.resume : t.pause}
      </button>
    </>
  );
}
