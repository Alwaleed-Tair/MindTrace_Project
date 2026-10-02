import { ArrowUpRight, AudioLines, Eye, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { usePreferences } from '@/context/PreferencesContext';
import { useNotes } from '@/hooks/queries';
import { kindLabel } from '@/lib/report';
import { kindColor } from '@/components/common/Trace';
import { fill, relativeTime } from '@/lib/format';
import { noteHref, rememberNote } from '@/lib/jump';
import { REVIEW_BELOW } from '@/components/experiment/NotesTimeline';
import type { LibraryNote } from '@/lib/types';

function Player({ n }: { n: LibraryNote }) {
  const [failed, setFailed] = useState(false);
  if (!n.has_audio || failed) return null;
  return <audio controls preload="none" className="mt-3 h-8 w-full max-w-md" src={`/api/experiments/${encodeURIComponent(n.experiment.id)}/notes/${n.id}/audio`} onError={() => setFailed(true)} data-testid={`recording-audio-${n.id}`} />;
}

/** Everything recorded on the device, newest first, with its audio; "needs review" narrows it to uncertain transcripts. */
export default function RecordingsPage() {
  const { t, language } = usePreferences();
  const [query, setQuery] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const q = useNotes({ source: 'recording', q: query.trim(), review: reviewOnly });
  const items = q.data ?? [];
  const uncertain = (n: LibraryNote) => !!n.asr?.needs_review && (n.asr.confidence ?? 0) < REVIEW_BELOW;
  return (
    <div className="animate-in" data-testid="recordings-page">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-[-.04em]">
            <AudioLines size={26} className="text-primary" />
            {t.navRecordings}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground" data-testid="recordings-count">{fill(t.recordingsPageSub, { n: items.length })}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1.5">
            {[false, true].map((v) => (
              <button type="button" key={String(v)} aria-pressed={reviewOnly === v} onClick={() => setReviewOnly(v)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${reviewOnly === v ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`} data-testid={`filter-recordings-${v ? 'review' : 'all'}`}>
                {v ? t.needsReview : t.kindAll}
              </button>
            ))}
          </div>
          <label className="relative block sm:w-72">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchRecordings} className="h-10 w-full rounded-xl border border-border bg-card ps-9 pe-3 text-sm outline-none focus:border-primary" data-testid="input-search-recordings" />
          </label>
        </div>
      </div>

      {q.isPending ? (
        <div className="mt-7 h-48 animate-pulse rounded-2xl border border-border bg-card/60" aria-busy="true" />
      ) : items.length === 0 ? (
        <p className="mt-7 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-14 text-center text-sm text-muted-foreground" data-testid="recordings-empty">{query.trim() || reviewOnly ? t.noResults : t.recordingsEmpty}</p>
      ) : (
        <ul className="surface mt-7 divide-y divide-border" data-testid="recordings-list">
          {items.map((n) => (
            <li key={n.id} className="px-5 py-4" data-testid={`recording-${n.id}`}>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <Link href={`/experiments/${n.experiment.id}`} className="max-w-[60%] truncate font-semibold text-foreground hover:text-primary" dir="auto">{n.experiment.title}</Link>
                <span className="font-mono">{n.time_label ?? ''}</span>
                <span className="rounded-md px-1.5 py-0.5 font-bold" style={{ color: kindColor(n.kind), background: `hsl(var(--kind-${n.kind === 'hypothesis' ? 'hyp' : n.kind === 'decision' ? 'dec' : 'obs'}-soft))` }}>{kindLabel(n.kind, t)}</span>
                {n.asr && <span className="font-mono">{fill(t.confidence, { n: Math.round((n.asr.confidence ?? 0) * 100) })}</span>}
                {uncertain(n) && <span className="inline-flex items-center gap-1 rounded-full bg-kind-dec-soft px-2 py-0.5 font-semibold text-kind-dec" data-testid={`recording-review-${n.id}`}><Eye size={10} />{t.needsReview}</span>}
                <span className="ms-auto">{relativeTime(n.created_at, language)}</span>
              </div>
              <p className="mt-2 text-sm leading-6" dir="auto">{n.text}</p>
              <div className="flex flex-wrap items-end gap-3">
                <Player n={n} />
                <Link href={noteHref(n.experiment.id, n.id)} onClick={() => rememberNote(n.id)} className="ms-auto mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" data-testid={`recording-open-${n.id}`}>
                  {t.openInExperiment}
                  <ArrowUpRight size={12} className="rtl:-scale-x-100" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
