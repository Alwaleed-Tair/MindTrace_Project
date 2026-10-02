import { Mic, PencilLine, Square } from 'lucide-react';
import { useState } from 'react';
import { usePreferences } from '@/context/PreferencesContext';
import type { Dictation } from '@/hooks/useDictation';
import { useAddNote } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { kindColor } from '@/components/common/Trace';
import type { NoteKind } from '@/lib/types';

const KINDS: NoteKind[] = ['observation', 'hypothesis', 'decision'];

export const NOTE_TEXTAREA_ID = 'new-note-text';

interface Props {
  experimentId: string;
  text: string;
  onText: (value: string) => void;
  dictation: Dictation;
}

/** The compact "add a note" card. The note can be typed or dictated; either way the researcher reads it before saving. */
export function AddNoteCard({ experimentId, text, onText, dictation }: Props) {
  const { t } = usePreferences();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<NoteKind>('observation');
  const kindName: Record<NoteKind, string> = { observation: t.kindObservation, hypothesis: t.kindHypothesis, decision: t.kindDecision };
  const add = useAddNote(experimentId);
  const save = () => {
    const value = text.trim();
    if (!value || add.isPending) return;
    setError(null);
    add.mutate(kind === 'observation' ? value : { text: value, kind }, {
      onSuccess: () => { onText(''); setKind('observation'); },
      onError: (e) => setError(e instanceof ApiError ? e.message : t.noteSaveFailed),
    });
  };
  const micMessage = !dictation.supported ? t.micUnsupported : dictation.error === 'denied' ? t.micDenied : dictation.error === 'network' ? t.micNetwork : dictation.error === 'nomic' ? t.micNoMic : dictation.error === 'failed' ? t.micError : null;
  return (
    <section className="surface p-5" data-testid="card-add-note">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t.addNote}</h3>
        <PencilLine size={15} className="text-primary" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t.addNoteSub}</p>
      <div className="mt-3 flex gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t.noteKind} data-testid="note-kind-picker">
        {KINDS.map((k) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${kind === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid={`note-kind-${k}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: kindColor(k) }} />
            {kindName[k]}
          </button>
        ))}
      </div>
      <textarea
        id={NOTE_TEXTAREA_ID}
        value={text}
        onChange={(e) => onText(e.target.value)}
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
      {dictation.listening && (
        <p className="mt-2 flex items-center gap-2 text-xs text-primary" role="status" data-testid="dictation-live">
          <span className="recording-pulse h-2 w-2 shrink-0 rounded-full bg-destructive" />
          <span className="truncate" dir="auto">{dictation.interim || t.micListening}</span>
        </p>
      )}
      {micMessage && !dictation.listening && <p className="mt-2 text-xs text-muted-foreground" data-testid="dictation-message">{micMessage}</p>}
      {error && <p className="mt-2 text-xs font-semibold text-destructive" role="alert" data-testid="note-error">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={dictation.toggle}
          disabled={!dictation.supported}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-40 ${dictation.listening ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
          data-testid="button-dictate"
        >
          {dictation.listening ? <Square size={12} /> : <Mic size={13} />}
          {dictation.listening ? t.micStop : t.micStart}
        </button>
        <button type="button" disabled={!text.trim() || add.isPending} onClick={save} className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40" data-testid="button-save-note">
          {t.saveNote}
        </button>
      </div>
    </section>
  );
}
