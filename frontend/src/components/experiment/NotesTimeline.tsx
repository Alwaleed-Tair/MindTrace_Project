import { AudioLines, Eye } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/common/Avatar';
import { usePreferences } from '@/context/PreferencesContext';
import { clockTime, fill } from '@/lib/format';
import type { Note } from '@/lib/types';

function NoteAudio({ experimentId, noteId }: { experimentId: string; noteId: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null; // no audio stored for this note: show nothing instead of a broken player
  return <audio controls preload="none" className="mt-3 h-8 w-full max-w-sm" src={`/api/experiments/${encodeURIComponent(experimentId)}/notes/${noteId}/audio`} onError={() => setFailed(true)} data-testid={`audio-${noteId}`} />;
}

export function NotesTimeline({ experimentId, notes, showAuthors, limit }: { experimentId: string; notes: Note[]; showAuthors: boolean; limit?: number }) {
  const { t, language } = usePreferences();
  const shown = limit ? notes.slice(-limit) : notes;
  return (
    <section className="surface p-5 sm:p-6" data-testid="card-notes">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t.timeline}</h3>
        <span className="font-mono text-[10px] text-muted-foreground" data-testid="notes-count">{fill(t.entries, { n: notes.length })}</span>
      </div>
      <div>
        {shown.length ? (
          shown.map((note, index) => (
            <div key={note.id} className="relative flex gap-4 pb-6" data-testid={`note-${note.id}`}>
              <div className="flex flex-col items-center">
                <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${note.kind === 'hypothesis' ? 'bg-accent text-accent-foreground' : note.kind === 'decision' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-primary/12 text-primary'}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                </span>
                {index !== shown.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">{note.time_label ?? clockTime(note.created_at, language)}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-primary" data-testid={`note-kind-${note.id}`}>{note.kind}</span>
                  {note.source === 'recording' && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"><AudioLines size={10} />{t.fromRecording}</span>}
                  {note.asr?.needs_review && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300" data-testid={`note-review-${note.id}`}><Eye size={10} />{t.needsReview}</span>}
                  {showAuthors && note.author && <span className="ms-auto inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><Avatar person={note.author} size={18} />{note.author.name}</span>}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80" dir="auto">{note.text}</p>
                {note.asr?.needs_review && note.asr.alternative && (
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
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground" data-testid="notes-empty">{t.firstObservation}</div>
        )}
      </div>
    </section>
  );
}
