import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { StatusPill } from '@/components/common/StatusPill';
import { TraceLine, kindColor, tracePositions } from '@/components/common/Trace';
import { usePreferences } from '@/context/PreferencesContext';
import { useExperiments } from '@/hooks/queries';
import { fill, relativeTime } from '@/lib/format';
import type { Experiment, NoteKind, Status } from '@/lib/types';

const KINDS: NoteKind[] = ['observation', 'hypothesis', 'decision'];

function Row({ e }: { e: Experiment }) {
  const { t, language } = usePreferences();
  const marks = e.trace ?? [];
  const pos = tracePositions(marks, e.duration_sec);
  const people = [e.owner, ...e.collaborators];
  return (
    <li>
      <Link
        href={`/experiments/${e.id}`}
        className="grid items-center gap-x-5 gap-y-3 px-5 py-4 transition hover:bg-muted/50 md:grid-cols-[minmax(0,2.2fr)_110px_minmax(0,1.4fr)_minmax(0,1.2fr)_110px]"
        data-testid={`row-experiment-${e.id}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold" dir="auto">{e.title}</span>
          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{e.code}</span>
            <span className="flex -space-x-1.5 rtl:space-x-reverse">{people.slice(0, 3).map((p) => <Avatar key={p.id} person={p} size={18} ring />)}</span>
          </span>
        </span>
        <span><StatusPill status={e.status} /></span>
        <TraceLine points={marks.map((m, i) => ({ pos: pos[i], kind: m.kind }))} height={34} />
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {KINDS.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: kindColor(k) }} />
              <span className="font-mono font-semibold text-foreground">{e.kind_counts?.[k] ?? 0}</span>
            </span>
          ))}
        </span>
        <span className="text-[11px] text-muted-foreground md:text-end">{relativeTime(e.updated_at, language)}</span>
      </Link>
    </li>
  );
}

/** Every experiment the user owns or shares, as one compact list (the dashboard keeps the cards). */
export default function ExperimentsPage() {
  const { t } = usePreferences();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'All' | Status>('All');
  const [newestFirst, setNewestFirst] = useState(true);
  const all = useExperiments({ status: 'All', q: '', sort: 'newest' });
  const list = useExperiments({ status: filter, q: query.trim(), sort: newestFirst ? 'newest' : 'oldest' });
  const items = list.data ?? [];
  const count = (s: 'All' | Status) => (all.data ?? []).filter((e) => s === 'All' || e.status === s).length;
  const tabs: ['All' | Status, string][] = [['All', t.kindAll], ['Active', t.active], ['Paused', t.paused], ['Completed', t.completed]];
  return (
    <div className="animate-in" data-testid="experiments-page">
      <h1 className="text-3xl font-semibold tracking-[-.04em]">{t.navExperiments}</h1>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="experiments-page-count">{fill(t.experimentsPageSub, { n: all.data?.length ?? 0 })}</p>

      <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {tabs.map(([value, label]) => (
            <button type="button" key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === value ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`} data-testid={`tab-status-${value.toLowerCase()}`}>
              {label}
              <span className="font-mono opacity-70">{count(value)}</span>
            </button>
          ))}
        </div>
        <label className="relative block flex-1 lg:ms-auto lg:max-w-sm">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="h-10 w-full rounded-xl border border-border bg-card ps-9 pe-3 text-sm outline-none focus:border-primary" data-testid="input-search-all-experiments" />
        </label>
      </div>

      <section className="surface mt-5 overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_110px_minmax(0,1.4fr)_minmax(0,1.2fr)_110px] gap-x-5 border-b border-border px-5 py-3 text-[11px] font-semibold text-muted-foreground md:grid">
          <span>{t.colExperiment}</span>
          <span>{t.colStatus}</span>
          <span>{t.sessionTrace}</span>
          <span>{t.notesMetric}</span>
          <button type="button" onClick={() => setNewestFirst(!newestFirst)} className="inline-flex items-center gap-1 justify-self-end hover:text-foreground" data-testid="button-sort-all-experiments">
            {t.colUpdated}
            <ChevronDown size={12} className={newestFirst ? '' : 'rotate-180'} />
          </button>
        </div>
        {list.isPending ? (
          <div className="h-40 animate-pulse bg-muted/40" aria-busy="true" />
        ) : items.length ? (
          <ul className="divide-y divide-border" data-testid="experiments-list">{items.map((e) => <Row key={e.id} e={e} />)}</ul>
        ) : (
          <p className="px-6 py-14 text-center text-sm text-muted-foreground" data-testid="experiments-list-empty">{query.trim() ? t.noResults : t.empty}</p>
        )}
      </section>
    </div>
  );
}
