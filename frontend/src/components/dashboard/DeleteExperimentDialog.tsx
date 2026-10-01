import { Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { usePreferences } from '@/context/PreferencesContext';
import { useDeleteExperiment } from '@/hooks/queries';
import type { Experiment } from '@/lib/types';

/** Asks first, then deletes the experiment (owner only: the button is only shown to the owner, the server checks it too). */
export function DeleteExperimentDialog({ experiment, open, onOpenChange, onDeleted }: { experiment: Experiment; open: boolean; onOpenChange: (v: boolean) => void; onDeleted?: () => void }) {
  const { t, dir } = usePreferences();
  const del = useDeleteExperiment();
  const confirm = () => del.mutate(experiment.id, { onSuccess: () => { onOpenChange(false); onDeleted?.(); } });
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!del.isPending) { del.reset(); onOpenChange(v); } }}>
      <DialogContent dir={dir} className="max-w-md rounded-3xl border-border bg-card p-6 text-card-foreground shadow-2xl sm:p-7" data-testid="dialog-delete-experiment">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><Trash2 size={18} /></span>
          <div>
            <DialogTitle className="text-lg font-semibold tracking-[-.02em]">{t.deleteTitle}</DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-6 text-muted-foreground">{t.deleteBody}</DialogDescription>
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm font-semibold" dir="auto">{experiment.title}</p>
          </div>
        </div>
        {del.isError && <p className="mt-3 text-xs font-semibold text-destructive" role="alert" data-testid="delete-error">{t.deleteFailed}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onOpenChange(false)} disabled={del.isPending} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="button-cancel-delete">{t.cancel}</button>
          <button type="button" onClick={confirm} disabled={del.isPending} className="rounded-xl bg-destructive px-5 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-50" data-testid="button-confirm-delete">{del.isPending ? t.deleting : t.deleteConfirm}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
