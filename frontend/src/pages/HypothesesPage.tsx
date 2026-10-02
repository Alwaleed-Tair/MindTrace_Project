import { ArrowUpRight, Lightbulb, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { StatusPill } from '@/components/common/StatusPill';
import { kindColor } from '@/components/common/Trace';
import { usePreferences } from '@/context/PreferencesContext';
import { useNotes } from '@/hooks/queries';
import { fill, relativeTime } from '@/lib/format';
import { noteHref, rememberNote } from '@/lib/jump';
import type { LibraryNote } from '@/lib/types';

/** Every hypothesis from every experiment, grouped by experiment; each one opens at its place in the experiment. */
export default function HypothesesPage() {
  const { t, language } = usePreferences();
  const [query, setQuery] = useState('');
  const q = useNotes({ kind: 'hypothesis', q: query.trim() });
  const items = q.data ?? [];
  const groups = new Map<string, { experiment: LibraryNote['experiment']; notes: LibraryNote[] }>();
  for (const n of items) {
    const g = groups.get(n.experiment.id) ?? { experiment: n.experiment, notes: [] };
    g.notes.push(n);
    groups.set(n.experiment.id, g);
  }
  return (
    <div className="animate-in" data-testid="hypotheses-page">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-[-.04em]">
            <Lightbulb size={26} style={{ color: kindColor('hypothesis') }} />
            {t.hypothesesTitle}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground" data-testid="hypotheses-count">{fill(t.hypothesesPageSub, { n: items.length, m: groups.size })}</p>
        </div>
        <label className="relative block sm:w-80">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchHypotheses} className="h-10 w-full rounded-xl border border-border bg-card ps-9 pe-3 text-sm outline-none focus:border-primary" data-testid="input-search-hypotheses" />
        </label>
      </div>

      {q.isPending ? (
        <div className="mt-7 h-48 animate-pulse rounded-2xl border border-border bg-card/60" aria-busy="true" />
      ) : items.length === 0 ? (
        <p className="mt-7 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-14 text-center text-sm text-muted-foreground" data-testid="hypotheses-page-empty">{query.trim() ? t.noResults : t.hypothesesEmpty}</p>
      ) : (
        <div className="mt-7 grid items-start gap-5 lg:grid-cols-2">
          {[...groups.values()].map(({ experiment: e, notes }) => (
            <section key={e.id} className="surface p-5" data-testid={`hypotheses-group-${e.id}`}>
              <div className="flex items-start justify-between gap-3">
                <Link href={`/experiments/${e.id}`} className="min-w-0 hover:text-primary">
                  <span className="block truncate text-sm font-semibold" dir="auto">{e.title}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{e.code}</span>
                </Link>
                <StatusPill status={e.status} />
              </div>
              <ul className="mt-4 space-y-2.5">
                {notes.map((n) => (
                  <li key={n.id}>
                    <Link href={noteHref(e.id, n.id)} onClick={() => rememberNote(n.id)} className="group block rounded-xl border-s-[3px] bg-kind-hyp-soft/60 px-4 py-3 transition hover:bg-kind-hyp-soft" style={{ borderColor: kindColor('hypothesis') }} data-testid={`hypothesis-item-${n.id}`}>
                      <span className="block text-sm leading-6" dir="auto">{n.text}</span>
                      <span className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {n.author && <Avatar person={n.author} size={18} />}
                        {n.author && <span>{n.author.name}</span>}
                        <span>·</span>
                        <span>{relativeTime(n.created_at, language)}</span>
                        <span className="ms-auto inline-flex items-center gap-1 font-semibold opacity-0 transition group-hover:opacity-100">{t.openInExperiment}<ArrowUpRight size={12} className="rtl:-scale-x-100" /></span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
