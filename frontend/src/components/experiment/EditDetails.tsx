import { type FormEvent, useState } from 'react';
import { usePreferences } from '@/context/PreferencesContext';
import { useUpdateExperiment } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import type { Experiment } from '@/lib/types';

/** Edit the title and summary in place (owner only). Recorded sessions take their first sentence as the title, so this matters. */
export function EditDetails({ experiment, onDone }: { experiment: Experiment; onDone: () => void }) {
  const { t } = usePreferences();
  const [title, setTitle] = useState(experiment.title);
  const [summary, setSummary] = useState(experiment.summary);
  const update = useUpdateExperiment(experiment.id);

  const save = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ title: title.trim(), summary: summary.trim() }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={save} className="mt-4 max-w-3xl space-y-3" data-testid="form-edit-details">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold">{t.titleLabel}</span>
        <input autoFocus required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" className="h-12 w-full rounded-xl border border-input bg-background px-3 text-xl font-semibold outline-none transition focus:border-primary" data-testid="input-edit-title" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold">{t.summaryLabel}</span>
        <textarea rows={2} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} dir="auto" className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm leading-6 outline-none transition focus:border-primary" data-testid="input-edit-summary" />
      </label>
      {update.isError && <p className="text-xs font-semibold text-destructive" role="alert" data-testid="edit-details-error">{update.error instanceof ApiError ? update.error.message : t.actionFailed}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={update.isPending || !title.trim()} className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50" data-testid="button-save-details">{update.isPending ? t.saving : t.save}</button>
        <button type="button" onClick={onDone} disabled={update.isPending} className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold" data-testid="button-cancel-details">{t.cancel}</button>
      </div>
    </form>
  );
}
