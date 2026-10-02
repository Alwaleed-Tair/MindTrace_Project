import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { usePreferences } from '@/context/PreferencesContext';
import { useTeams } from '@/hooks/queries';

export function CreateExperimentDialog({ open, onOpenChange, onCreate, busy, error }: { open: boolean; onOpenChange: (v: boolean) => void; onCreate: (title: string, summary: string, teamId: string | null) => void; busy: boolean; error: string | null }) {
  const { t, dir } = usePreferences();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [teamId, setTeamId] = useState('');
  const teams = useTeams(open).data ?? [];
  const submit = () => {
    if (title.trim() && !busy) onCreate(title.trim(), summary.trim(), teamId || null);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-lg rounded-3xl border-border bg-card p-6 text-card-foreground shadow-2xl sm:p-8" data-testid="dialog-create-experiment">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-primary">New thread / 01</p>
          <DialogTitle className="mt-2 text-2xl font-semibold tracking-[-.04em]">{t.createTitle}</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">{t.createSub}</DialogDescription>
        </div>
        <form
          className="mt-4 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="block">
            <span className="mb-2 block text-xs font-semibold">{t.title}</span>
            <input autoFocus value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder={t.titlePlaceholder} className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground/55 focus:border-primary" data-testid="input-experiment-title" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold">{t.summary}</span>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t.summaryPlaceholder} rows={3} className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground/55 focus:border-primary" data-testid="input-experiment-summary" />
          </label>
          {teams.length > 0 && (
            <label className="block">
              <span className="mb-2 block text-xs font-semibold">{t.shareWith}</span>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" data-testid="select-create-team">
                <option value="">{t.onlyMe}</option>
                {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </label>
          )}
          {error && <p className="text-xs font-semibold text-destructive" role="alert" data-testid="create-error">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="button-cancel-create">{t.cancel}</button>
            <button type="submit" disabled={!title.trim() || busy} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-submit-create">{t.create}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
