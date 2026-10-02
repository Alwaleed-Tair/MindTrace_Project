import { ArrowDownAZ, ChevronDown, ChevronRight, FileCheck2, FlaskConical, NotebookPen, Plus, Search, SlidersHorizontal, TriangleAlert, Users } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { CreateExperimentDialog } from '@/components/dashboard/CreateExperimentDialog';
import { ExperimentCard } from '@/components/dashboard/ExperimentCard';
import { MetricCard } from '@/components/dashboard/MetricCards';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useCreateExperiment, useExperiments, useSetStatus, useStats, useTeams } from '@/hooks/queries';
import { RoleBadge } from '@/components/common/RoleBadge';
import { Link } from 'wouter';
import { ApiError } from '@/lib/api';
import { fill, greetingKey, greetingName, longDate } from '@/lib/format';
import type { Status } from '@/lib/types';

export default function DashboardPage() {
  const { t, language } = usePreferences();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'All' | Status>('All');
  const [newestFirst, setNewestFirst] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const experiments = useExperiments({ status: filter, q: query.trim(), sort: newestFirst ? 'newest' : 'oldest' });
  const stats = useStats();
  const teams = useTeams().data ?? [];
  const setStatus = useSetStatus();
  const create = useCreateExperiment();

  const items = experiments.data ?? [];
  const sd = stats.data;
  const quality = sd?.insights.avg_documentation_quality;
  const review = sd?.insights.notes_to_review ?? 0;
  const greetName = greetingName(user?.name ?? '');

  return (
    <>
      <div className="animate-in flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-primary" data-testid="today">{longDate(language)}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.055em] sm:text-4xl" data-testid="greeting">{fill(t[greetingKey()], { name: greetName })}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.welcomeSub}</p>
        </div>
        <button type="button" onClick={() => { setCreateError(null); setShowCreate(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_10px_25px_hsl(var(--primary)/.15)] transition hover:-translate-y-0.5" data-testid="button-new-experiment">
          <Plus size={17} />
          {t.newExperiment}
        </button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="metrics">
        <MetricCard testId="metric-active" icon={FlaskConical} label={t.activeThreads} value={String(sd?.active_threads ?? 0)} note={fill(t.ofTotal, { n: sd?.total_threads ?? 0 })} delay={1} />
        <MetricCard testId="metric-notes" icon={NotebookPen} label={t.notesThisWeek} value={String(sd?.notes_this_week ?? 0)} note={fill(t.vsLastWeek, { n: sd?.notes_last_week ?? 0 })} delay={2} />
        <MetricCard testId="metric-quality" icon={FileCheck2} label={t.docQualityAvg} value={quality === null || quality === undefined ? '—' : `${quality}%`} note={fill(t.analyzedOf, { n: sd?.insights.experiments_analyzed ?? 0 })} delay={3} />
        <MetricCard testId="metric-review" icon={TriangleAlert} tone={review ? 'warn' : 'default'} label={t.toReview} value={String(review)} note={t.toReviewSub} delay={4} />
      </div>

      {teams.length > 0 && (
        <section className="mt-6 animate-in delay-2" aria-label={t.teamOnDashboard} data-testid="dashboard-teams">
          <div className="flex flex-wrap gap-3">
            {teams.map((tm) => (
              <Link key={tm.id} href={`/team/${tm.id}`} className="surface group flex min-w-[260px] flex-1 items-center gap-4 px-5 py-4 transition hover:border-primary/40" data-testid={`dashboard-team-${tm.id}`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground">{t.teamOnDashboard}<RoleBadge role={tm.role} /></span>
                  <span className="mt-0.5 block truncate text-sm font-semibold"><bdi>{tm.name}</bdi></span>
                  <span className="text-[11px] text-muted-foreground">{fill(t.membersCount, { n: tm.member_count })} · {fill(t.sharedExperimentsCount, { n: tm.experiment_count })}</span>
                </span>
                <ChevronRight size={16} className="text-muted-foreground transition group-hover:text-primary rtl:rotate-180" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 animate-in delay-3">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold tracking-[-.04em]">{t.recent}</h2>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="threads-count">{fill(t.threadsCount, { n: items.length })}</p>
          </div>
          <button type="button" onClick={() => setNewestFirst(!newestFirst)} className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:self-auto" data-testid="button-sort-experiments">
            <ArrowDownAZ size={14} />
            {t.sort}
            <ChevronDown size={13} className={newestFirst ? '' : 'rotate-180'} />
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative block flex-1">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="h-11 w-full rounded-xl border border-border bg-card ps-10 pe-4 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary" data-testid="input-search-experiments" />
          </label>
          <label className="relative">
            <SlidersHorizontal size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select value={filter} onChange={(e) => setFilter(e.target.value as 'All' | Status)} className="h-11 w-full min-w-[145px] appearance-none rounded-xl border border-border bg-card ps-9 pe-8 text-xs font-semibold outline-none focus:border-primary" data-testid="select-status-filter">
              <option value="All">{t.all}</option>
              <option value="Active">{t.active}</option>
              <option value="Paused">{t.paused}</option>
              <option value="Completed">{t.completed}</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </label>
        </div>

        {experiments.isError ? (
          <div className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/8 px-6 py-10 text-center text-sm text-destructive" role="alert" data-testid="experiments-error">
            <p className="font-semibold">{t.loadError}</p>
            <p className="mt-1 text-xs">{experiments.error instanceof ApiError ? experiments.error.message : ''}</p>
            <button type="button" onClick={() => void experiments.refetch()} className="mt-3 text-xs font-semibold underline">{t.retry}</button>
          </div>
        ) : experiments.isPending ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" data-testid="experiments-loading">
            {[0, 1, 2].map((i) => <div key={i} className="h-[230px] animate-pulse rounded-2xl border border-border bg-card/60" />)}
          </div>
        ) : items.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="experiments-grid">
            {items.map((e, index) => (
              <div className={`animate-in delay-${Math.min(index + 1, 4)}`} key={e.id}>
                <ExperimentCard experiment={e} onSetStatus={(id, status) => setStatus.mutate({ id, status })} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-16 text-center" data-testid="experiments-empty">
            <Search className="mx-auto text-primary/60" size={25} />
            <p className="mt-4 text-sm font-semibold">{t.empty}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.emptySub}</p>
          </div>
        )}
        {setStatus.isError && <p className="mt-3 text-xs font-semibold text-destructive" role="alert" data-testid="status-error">{t.statusUpdateFailed}</p>}
      </section>

      <CreateExperimentDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        busy={create.isPending}
        error={createError}
        onCreate={(title, summary, teamId) =>
          create.mutate(
            { title, summary, teamId },
            {
              onSuccess: (e) => {
                setShowCreate(false);
                navigate(`/experiments/${e.id}`);
              },
              onError: (err) => setCreateError(err instanceof ApiError ? err.message : t.loadError),
            },
          )
        }
      />
    </>
  );
}
