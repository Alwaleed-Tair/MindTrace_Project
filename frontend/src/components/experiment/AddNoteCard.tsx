import { PencilLine } from 'lucide-react';
import { useState } from 'react';
import { usePreferences } from '@/context/PreferencesContext';
import { useAddNote } from '@/hooks/queries';
import { ApiError } from '@/lib/api';

/** The compact "add a note" card (smaller than before: the Notes timeline is now the main area). */
export function AddNoteCard({ experimentId }: { experimentId: string }) {
  const { t } = usePreferences();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddNote(experimentId);
  const save = () => {
    const value = text.trim();
    if (!value || add.isPending) return;
    setError(null);
    add.mutate(value, {
      onSuccess: () => setText(''),
      onError: (e) => setError(e instanceof ApiError ? e.message : t.noteSaveFailed),
    });
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="card-add-note">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t.addNote}</h3>
        <PencilLine size={15} className="text-primary" />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t.addNoteSub}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
        }}
        rows={3}
        maxLength={5000}
        dir="auto"
        placeholder={t.notePlaceholder}
        className="mt-3 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none transition placeholder:text-muted-foreground/55 focus:border-primary"
        data-testid="textarea-new-note"
      />
      {error && <p className="mt-2 text-xs font-semibold text-destructive" role="alert" data-testid="note-error">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button type="button" disabled={!text.trim() || add.isPending} onClick={save} className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-40" data-testid="button-save-note">
          {t.saveNote}
        </button>
      </div>
    </section>
  );
}
