import { ArrowLeft, AudioLines, Clock3, FileText, LayoutDashboard, Sparkles, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { StatusPill } from '@/components/common/StatusPill';
import { AddPeopleDialog } from '@/components/dashboard/AddPeopleDialog';
import { MetricCard } from '@/components/dashboard/MetricCards';
import { StatusActions } from '@/components/dashboard/StatusActions';
import { AddNoteCard } from '@/components/experiment/AddNoteCard';
import { InsightsSummaryCard, InsightsTab, OriginalityCard } from '@/components/experiment/InsightsPanels';
import { NotesTimeline } from '@/components/experiment/NotesTimeline';
import { Avatar } from '@/components/common/Avatar';
import { usePreferences } from '@/context/PreferencesContext';
import { useExperiment, useSetStatus } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { Experiment } from '@/lib/types';

type Tab = 'overview' | 'notes' | 'insights';

function NotFoundExperiment({ message }: { message: string }) {
  const { t } = usePreferences();
  const [, navigate] = useLocation();
  return (
    <div className="animate-in rounded-2xl border border-dashed border-border bg-card/70 px-6 py-16 text-center" data-testid="experiment-missing">
      <p className="text-sm font-semibold">{message}</p>
      <button type="button" onClick={() => navigate('/dashboard')} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline">
        <ArrowLeft size={14} />
        {t.back}
      </button>
    </div>
  );
}

function Detail({ experiment }: { experiment: Experiment }) {
  const { t, language } = usePreferences();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>('overview');
  const [recording, setRecording] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const setStatus = useSetStatus();
  const notes = experiment.notes ?? [];
  const weekAgo = Date.now() - 7 * 86400_000;
  const thisWeek = notes.filter((n) => new Date(n.created_at).getTime() >= weekAgo).length;
  const shared = experiment.collaborators.length > 0 || experiment.role === 'editor';
  const people = [experiment.owner, ...experiment.collaborators];

  const tabs: [Tab, string, typeof LayoutDashboard][] = [
    ['overview', t.overview, LayoutDashboard],
    ['notes', t.notes, FileText],
    ['insights', t.insights, Sparkles],
  ];

  return (
    <div className="animate-in" data-testid="experiment-page" data-status={experiment.status}>
      <button type="button" onClick={() => navigate('/dashboard')} className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground transition hover:text-primary" data-testid="button-back-dashboard">
        <ArrowLeft size={15} className="rtl:rotate-180" />
        {t.back}
      </button>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={experiment.status} />
            <span className="font-mono text-[10px] text-muted-foreground">{experiment.code}</span>
            <div className="flex -space-x-2 rtl:space-x-reverse">{people.slice(0, 5).map((p) => <Avatar key={p.id} person={p} size={24} ring />)}</div>
          </div>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-.055em] sm:text-5xl" data-testid="experiment-title">{experiment.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{experiment.summary}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <StatusActions id={experiment.id} status={experiment.status} onSetStatus={(id, status) => setStatus.mutate({ id, status })} />
            <button type="button" onClick={() => setPeopleOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground" data-testid="button-add-people-page">
              <UserPlus size={13} />
              {t.addPeople}
            </button>
          </div>
        </div>
        <button type="button" onClick={() => setRecording(!recording)} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${recording ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground shadow-[0_10px_25px_hsl(var(--primary)/.15)] hover:-translate-y-0.5'}`} data-testid="button-toggle-recording">
          {recording ? (
            <>
              <span className="recording-pulse h-2.5 w-2.5 rounded-full bg-white" />
              {t.stop}
            </>
          ) : (
            <>
              <AudioLines size={17} />
              {t.recording}
            </>
          )}
        </button>
      </div>
      {recording && (
        <div className="animate-in mt-5 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-xs text-destructive" data-testid="status-recording">
          <span className="recording-pulse h-2 w-2 rounded-full bg-destructive" />
          <span className="font-semibold">{t.recordingOn}</span>
          <span className="text-destructive/70">{t.recordingNote}</span>
        </div>
      )}

      <div className="mt-10 flex gap-5 overflow-x-auto border-b border-border" role="tablist">
        {tabs.map(([value, label, Icon]) => (
          <button type="button" key={value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-xs font-semibold transition ${tab === value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} role="tab" aria-selected={tab === value} data-testid={`tab-${value}`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="experiment-metrics">
            <MetricCard testId="metric-notes-count" icon={FileText} label={t.notesMetric} value={String(notes.length)} note={`${thisWeek} ${t.newThisWeek}`} />
            <MetricCard testId="metric-duration" icon={Clock3} label={t.duration} value={experiment.duration} note={`${t.lastUpdate} ${relativeTime(experiment.updated_at, language)}`} />
            <InsightsSummaryCard experiment={experiment} />
          </div>
          {/* the Notes timeline is the wide main column; Add Note is the narrow one */}
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,.9fr)]">
            <NotesTimeline experimentId={experiment.id} notes={notes} showAuthors={shared} />
            <aside className="space-y-5">
              <AddNoteCard experimentId={experiment.id} />
              <OriginalityCard experiment={experiment} />
            </aside>
          </div>
        </>
      )}
      {tab === 'notes' && (
        <div className="mt-7 grid items-start gap-5 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,.9fr)]">
          <NotesTimeline experimentId={experiment.id} notes={notes} showAuthors={shared} />
          <aside><AddNoteCard experimentId={experiment.id} /></aside>
        </div>
      )}
      {tab === 'insights' && <InsightsTab experiment={experiment} />}

      {setStatus.isError && <p className="mt-4 text-xs font-semibold text-destructive" role="alert">{t.statusUpdateFailed}</p>}
      {peopleOpen && <AddPeopleDialog experiment={experiment} open={peopleOpen} onOpenChange={setPeopleOpen} />}
    </div>
  );
}

export default function ExperimentPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = usePreferences();
  const q = useExperiment(id);
  if (q.isPending) return <div className="h-64 animate-pulse rounded-2xl border border-border bg-card/60" aria-busy="true" data-testid="experiment-loading" />;
  if (q.isError) return <NotFoundExperiment message={q.error instanceof ApiError && q.error.status !== 404 ? q.error.message : t.experimentMissing} />;
  return <Detail experiment={q.data} />;
}
