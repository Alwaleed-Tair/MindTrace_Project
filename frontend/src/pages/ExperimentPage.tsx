import { ArrowLeft, ChevronRight, AudioLines, Clock3, FileText, LayoutDashboard, Pencil, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { StatusPill } from '@/components/common/StatusPill';
import { DeleteExperimentDialog } from '@/components/dashboard/DeleteExperimentDialog';
import { AddPeopleDialog } from '@/components/dashboard/AddPeopleDialog';
import { MetricCard } from '@/components/dashboard/MetricCards';
import { StatusActions } from '@/components/dashboard/StatusActions';
import { AddNoteCard, NOTE_TEXTAREA_ID } from '@/components/experiment/AddNoteCard';
import { EditDetails } from '@/components/experiment/EditDetails';
import { ExportMenu } from '@/components/experiment/ExportMenu';
import { ShareWithTeam } from '@/components/common/ShareWithTeam';
import { InsightsTab, OriginalityCard, useAutoTranslate } from '@/components/experiment/InsightsPanels';
import { NotesTimeline } from '@/components/experiment/NotesTimeline';
import { Avatar } from '@/components/common/Avatar';
import { SessionTrace, kindColor, tracePositions, usesRecordingClock } from '@/components/common/Trace';
import { usePreferences } from '@/context/PreferencesContext';
import { useAddNote, useExperiment, useInsights, useMembers, useSetStatus } from '@/hooks/queries';
import { toStored } from '@/lib/mentions';
import { useDictation } from '@/hooks/useDictation';
import { ApiError } from '@/lib/api';
import { clockTime, fill, relativeTime } from '@/lib/format';
import { kindLabel } from '@/lib/report';
import type { Experiment, Note } from '@/lib/types';

type Tab = 'overview' | 'insights';

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
  const [draft, setDraft] = useState('');
  const dictation = useDictation(language === 'ar' ? 'ar-SA' : 'en-US', (text) => setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text)));
  const recording = dictation.listening;
  const addNote = useAddNote(experiment.id);
  const members = useMembers(experiment.id).data ?? [];
  const translate = useAutoTranslate(experiment.id);
  const ignoredIds = useInsights(experiment.id).data?.result?.ignored_note_ids;
  const wasListening = useRef(false);
  // pressing stop saves what was said as a note (it can still be edited afterwards from the timeline)
  useEffect(() => {
    if (wasListening.current && !recording && draft.trim()) addNote.mutate(toStored(draft.trim(), members), { onSuccess: () => setDraft('') });
    wasListening.current = recording;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);
  const toggleVoice = () => {
    if (!recording) {
      setTab('overview');
      setTimeout(() => document.getElementById(NOTE_TEXTAREA_ID)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    }
    dictation.toggle();
  };
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const setStatus = useSetStatus();
  const notes = experiment.notes ?? [];
  const weekAgo = Date.now() - 7 * 86400_000;
  const thisWeek = notes.filter((n) => new Date(n.created_at).getTime() >= weekAgo).length;
  const shared = experiment.collaborators.length > 0 || experiment.role === 'editor';
  const people = [experiment.owner, ...experiment.collaborators];
  const pos = tracePositions(notes.map((n) => ({ at: n.created_at, time_label: n.time_label })), experiment.duration_sec);
  const when = (n: Note) => n.time_label ?? clockTime(n.created_at, language);
  const points = notes.map((n, i) => ({ id: n.id, pos: pos[i], kind: n.kind, label: `${kindLabel(n.kind, t)} · ${when(n)} · ${n.text.slice(0, 80)}` }));
  const count = (k: Note['kind']) => notes.filter((n) => n.kind === k).length;
  // jump to a note from the trace, and flash it so the eye finds it
  const jumpTo = (id: number) => {
    setTab('overview');
    setTimeout(() => {
      const el = document.getElementById(`note-${id}`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('bg-accent/60');
      setTimeout(() => el.classList.remove('bg-accent/60'), 1400);
    }, 50);
  };

  const tabs: [Tab, string, typeof LayoutDashboard][] = [
    ['overview', t.overview, LayoutDashboard],
    ['insights', t.insights, Sparkles],
  ];

  return (
    <div className="animate-in" data-testid="experiment-page" data-status={experiment.status}>
      <header className="ink-band -mx-1 rounded-3xl border border-sidebar-border p-5 sm:mx-0 sm:p-8" data-testid="experiment-header">
      {/* breadcrumb: where you are and one click back (the old plain link was easy to miss on the dark band) */}
      <nav aria-label={t.breadcrumb} className="mb-6 flex min-w-0 items-center gap-2 text-xs" data-testid="breadcrumb">
        <button type="button" onClick={() => navigate('/dashboard')} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-semibold text-white/85 transition hover:border-sidebar-accent/60 hover:bg-white/10 hover:text-white" data-testid="button-back-dashboard">
          <ArrowLeft size={14} className="rtl:rotate-180" />
          {t.dashboard}
        </button>
        <ChevronRight size={14} className="shrink-0 text-white/35 rtl:rotate-180" aria-hidden="true" />
        <span className="truncate font-medium text-white/60" dir="auto" aria-current="page">{experiment.title}</span>
      </nav>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={experiment.status} />
            <span className="font-mono text-[11px] text-muted-foreground">{experiment.code}</span>
            <span className="text-[11px] text-muted-foreground">{fill(t.startedOn, { date: relativeTime(experiment.created_at, language) })}</span>
            <div className="flex -space-x-2 rtl:space-x-reverse">{people.slice(0, 5).map((p) => <Avatar key={p.id} person={p} size={24} ring />)}</div>
          </div>
          {editing ? (
            <EditDetails experiment={experiment} onDone={() => setEditing(false)} />
          ) : (
            <>
              <div className="mt-4 flex max-w-3xl items-start gap-2">
                <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl" dir="auto" data-testid="experiment-title">{experiment.title}</h1>
                {experiment.role === 'owner' && (
                  <button type="button" onClick={() => setEditing(true)} aria-label={t.editDetails} title={t.editDetails} className="mt-1.5 shrink-0 rounded-lg border border-border p-2 text-muted-foreground transition hover:border-primary/50 hover:text-foreground" data-testid="button-edit-details">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground" dir="auto">{experiment.summary}</p>
            </>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <StatusActions id={experiment.id} status={experiment.status} onSetStatus={(id, status) => setStatus.mutate({ id, status })} />
            <button type="button" onClick={() => setPeopleOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground" data-testid="button-add-people-page">
              <UserPlus size={13} />
              {t.addPeople}
            </button>
            <ShareWithTeam experiment={experiment} />
            <ExportMenu experiment={experiment} />
            {experiment.role === 'owner' && (
              <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive" data-testid="button-delete-experiment">
                <Trash2 size={13} />
                {t.deleteExperiment}
              </button>
            )}
          </div>
        </div>
        <button type="button" onClick={toggleVoice} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${recording ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground shadow-[0_10px_25px_hsl(var(--primary)/.15)] hover:-translate-y-0.5'}`} data-testid="button-toggle-recording">
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
        <div className="animate-in mt-5 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/15 px-4 py-3 text-xs text-white" data-testid="status-recording">
          <span className="recording-pulse h-2 w-2 rounded-full bg-destructive" />
          <span className="font-semibold">{t.recordingOn}</span>
          <span className="text-white/70">{t.recordingNote}</span>
        </div>
      )}

      <section className="mt-8 border-t border-border pt-6" aria-labelledby="trace-h" data-testid="trace-section">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="trace-h" className="text-sm font-semibold">{t.sessionTrace}</h2>
            <span className="text-xs text-muted-foreground" data-testid="trace-kinds">{fill(t.notesN, { n: notes.length })}</span>
          </div>
          {notes.length > 0 && <span className="text-[11px] text-muted-foreground">{t.traceHint}</span>}
        </div>
        {notes.length ? (
          <SessionTrace
            points={points}
            start={usesRecordingClock(notes) ? '00:00' : clockTime(notes[0].created_at, language)}
            end={usesRecordingClock(notes) ? (experiment.duration_sec ? experiment.duration : (notes[notes.length - 1].time_label ?? '')) : clockTime(notes[notes.length - 1].created_at, language)}
            onPick={jumpTo}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground" data-testid="trace-empty">{t.firstObservation}</p>
        )}
      </section>
      </header>

      <div className="mt-8 flex gap-5 overflow-x-auto border-b border-border" role="tablist">
        {tabs.map(([value, label, Icon]) => (
          <button type="button" key={value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-xs font-semibold transition ${tab === value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} role="tab" aria-selected={tab === value} data-testid={`tab-${value}`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2" data-testid="experiment-metrics">
            <MetricCard testId="metric-notes-count" icon={FileText} label={t.notesMetric} value={String(notes.length)} note={`${thisWeek} ${t.newThisWeek}`} />
            <MetricCard testId="metric-duration" icon={Clock3} label={t.duration} value={experiment.duration} note={`${t.lastUpdate} ${relativeTime(experiment.updated_at, language)}`} />
          </div>
          {/* the Notes timeline is the wide main column; Add Note is the narrow one */}
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,.9fr)]">
            <NotesTimeline experimentId={experiment.id} notes={notes} showAuthors={shared} ignoredIds={ignoredIds} />
            <aside className="space-y-5">
              <AddNoteCard experimentId={experiment.id} text={draft} onText={setDraft} dictation={dictation} />
              <OriginalityCard experiment={experiment} />
            </aside>
          </div>
        </>
      )}
      {tab === 'insights' && <InsightsTab experiment={experiment} translate={translate} />}

      {setStatus.isError && <p className="mt-4 text-xs font-semibold text-destructive" role="alert">{t.statusUpdateFailed}</p>}
      {deleteOpen && <DeleteExperimentDialog experiment={experiment} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={() => navigate('/dashboard')} />}
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