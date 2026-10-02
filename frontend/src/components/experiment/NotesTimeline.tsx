import { AudioLines, Eye, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/common/Avatar';
import { usePreferences } from '@/context/PreferencesContext';
import { useDeleteNote, useUpdateNote } from '@/hooks/queries';
import { clockTime, fill } from '@/lib/format';
import { kindLabel } from '@/lib/report';
import { kindColor } from '@/components/common/Trace';
import type { Note, NoteKind } from '@/lib/types';

function NoteAudio({ experimentId, noteId }: { experimentId: string; noteId: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null; // no audio stored for this note: show nothing instead of a broken player
  return <audio controls preload="none" className="mt-3 h-8 w-full max-w-sm" src={`/api/experiments/${encodeURIComponent(experimentId)}/notes/${noteId}/audio`} onError={() => setFailed(true)} data-testid={`audio-${noteId}`} />;
}

/** The text of a note, with Edit / Delete for the people allowed to change it (the writer or the experiment owner). */
function NoteBody({ experimentId, note }: { experimentId: string; note: Note }) {
  const { t } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState(note.text);
  const update = useUpdateNote(experimentId);
  const remove = useDeleteNote(experimentId);
  const save = () => {
    const value = text.trim();
    if (!value || update.isPending) return;
    if (value === note.text) return setEditing(false);
    update.mutate({ noteId: note.id, text: value }, { onSuccess: () => setEditing(false) });
  };
  if (editing) {
    return (
      <div className="mt-2" data-testid={`note-editor-${note.id}`}>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} rows={4} maxLength={5000} dir="auto" className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:border-primary" data-testid={`note-edit-text-${note.id}`} />
        {update.isError && <p className="mt-1 text-xs font-semibold text-destructive" role="alert">{t.noteEditFailed}</p>}
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={save} disabled={!text.trim() || update.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40" data-testid={`note-edit-save-${note.id}`}>{t.saveNote}</button>
          <button type="button" onClick={() => { setEditing(false); setText(note.text); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted" data-testid={`note-edit-cancel-${note.id}`}>{t.cancel}</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80" dir="auto">{note.text}</p>
      {note.can_edit && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px]">
          {asking ? (
            <span className="inline-flex items-center gap-2" role="alertdialog" data-testid={`note-delete-ask-${note.id}`}>
              <span className="text-muted-foreground">{t.deleteNoteAsk}</span>
              <button type="button" onClick={() => remove.mutate(note.id)} disabled={remove.isPending} className="rounded-md bg-destructive px-2 py-1 font-semibold text-destructive-foreground disabled:opacity-50" data-testid={`button-confirm-delete-note-${note.id}`}>{t.yes}</button>
              <button type="button" onClick={() => setAsking(false)} className="rounded-md px-2 py-1 font-semibold text-muted-foreground hover:bg-muted" data-testid={`note-delete-cancel-${note.id}`}>{t.cancel}</button>
              {remove.isError && <span className="font-semibold text-destructive" role="alert">{t.noteDeleteFailed}</span>}
            </span>
          ) : (
            <>
              <button type="button" onClick={() => { setText(note.text); setEditing(true); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground" data-testid={`note-edit-${note.id}`}><Pencil size={11} />{t.editNote}</button>
              <button type="button" onClick={() => setAsking(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-note-${note.id}`}><Trash2 size={11} />{t.deleteNote}</button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** The recorder flags a note as uncertain when its confidence is low OR the second reading differs. The second reading is often the worse one,
 *  so the badge only shows when the confidence is really low. */
export const REVIEW_BELOW = 0.85;
const shouldReview = (n: Note) => !!n.asr?.needs_review && (n.asr.confidence ?? 0) < REVIEW_BELOW;

export function NotesTimeline({ experimentId, notes, showAuthors, limit, ignoredIds }: { experimentId: string; notes: Note[]; showAuthors: boolean; limit?: number; ignoredIds?: number[] }) {
  const { t, language } = usePreferences();
  const [only, setOnly] = useState<NoteKind | 'all'>('all');
  const filtered = only === 'all' ? notes : notes.filter((n) => n.kind === only);
  const shown = limit ? filtered.slice(-limit) : filtered;
  const kinds: (NoteKind | 'all')[] = ['all', 'observation', 'hypothesis', 'decision'];
  const count = (k: NoteKind | 'all') => (k === 'all' ? notes.length : notes.filter((n) => n.kind === k).length);
  return (
    <section className="surface p-5 sm:p-6" data-testid="card-notes">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">{t.timeline}</h3>
          <span className="font-mono text-[10px] text-muted-foreground" data-testid="notes-count">{fill(t.entries, { n: notes.length })}</span>
        </div>
        {notes.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="kind-filter">
            {kinds.map((k) => (
              <button
                type="button"
                key={k}
                aria-pressed={only === k}
                onClick={() => setOnly(k)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${only === k ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'}`}
                data-testid={`filter-kind-${k}`}
              >
                {k !== 'all' && <span className="h-1.5 w-1.5 rounded-full" style={{ background: kindColor(k) }} />}
                {k === 'all' ? t.kindAll : kindLabel(k, t)}
                <span className="font-mono opacity-70">{count(k)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        {shown.length ? (
          shown.map((note, index) => (
            <div key={note.id} id={`note-${note.id}`} className="relative flex scroll-mt-24 gap-4 rounded-xl pb-6 transition-colors" data-testid={`note-${note.id}`}>
              <div className="flex flex-col items-center">
                <span className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-[3px] bg-card" style={{ borderColor: kindColor(note.kind) }} />
                {index !== shown.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-border" />}
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">{note.time_label ?? clockTime(note.created_at, language)}</span>
                  <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ color: kindColor(note.kind), background: `hsl(var(--kind-${note.kind === 'hypothesis' ? 'hyp' : note.kind === 'decision' ? 'dec' : 'obs'}-soft))` }} data-kind={note.kind} data-testid={`note-kind-${note.id}`}>{kindLabel(note.kind, t)}</span>
                  {note.source === 'recording' && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"><AudioLines size={10} />{t.fromRecording}</span>}
                  {shouldReview(note) && <span className="inline-flex items-center gap-1 rounded-full bg-kind-dec-soft px-2 py-0.5 text-[10px] font-semibold text-kind-dec" data-testid={`note-review-${note.id}`}><Eye size={10} />{t.needsReview}</span>}
                  {ignoredIds?.includes(note.id) && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" data-testid={`note-ignored-${note.id}`}>{t.ignoredByAi}</span>}
                  {showAuthors && note.author && <span className="ms-auto inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><Avatar person={note.author} size={18} />{note.author.name}</span>}
                </div>
                <NoteBody experimentId={experimentId} note={note} />
                {shouldReview(note) && note.asr?.alternative && (
                  <p className="mt-1.5 rounded-lg bg-muted/70 px-3 py-2 text-xs leading-5 text-muted-foreground" dir="auto" data-testid={`note-alt-${note.id}`}>
                    <span className="font-semibold">{t.secondReading}: </span>
                    {note.asr.alternative.text}
                  </p>
                )}
                {note.has_audio && <NoteAudio experimentId={experimentId} noteId={note.id} />}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground" data-testid="notes-empty">{notes.length ? t.noNotesOfKind : t.firstObservation}</div>
        )}
      </div>
    </section>
  );
}