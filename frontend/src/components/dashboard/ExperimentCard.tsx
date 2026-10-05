import { Clock3, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { StatusPill } from '@/components/common/StatusPill';
import { DeleteExperimentDialog } from '@/components/dashboard/DeleteExperimentDialog';
import { AddPeopleDialog } from '@/components/dashboard/AddPeopleDialog';
import { StatusActions } from '@/components/dashboard/StatusActions';
import { TraceLine, kindColor, tracePositions } from '@/components/common/Trace';
import { usePreferences } from '@/context/PreferencesContext';
import { fill, relativeTime } from '@/lib/format';
import type { Experiment, Status } from '@/lib/types';


const stateClass: Record<Status, string> = {
  Active: '',
  Paused: '!border-amber-400/50 !bg-amber-50/60 dark:!bg-amber-950/20',
  Completed: '!border-primary/45 !bg-primary/[.07]',
};

export function ExperimentCard({ experiment, onSetStatus }: { experiment: Experiment; onSetStatus: (id: string, status: Status) => void }) {
  const { t, language } = usePreferences();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const e = experiment;
  const people = [e.owner, ...e.collaborators];
  const marks = e.trace ?? [];
  const pos = tracePositions(marks, e.duration_sec);
  const points = marks.map((m, i) => ({ pos: pos[i], kind: m.kind }));
  const counts = e.kind_counts;
  const analyzed = e.ai_status === 'done';

  return (
    <article className={`group surface p-5 transition duration-200 hover:border-primary/40 ${stateClass[e.status]}`} data-testid={`card-experiment-${e.id}`} data-status={e.status}>
      <Link href={`/experiments/${e.id}`} className="block rounded-xl" data-testid={`link-experiment-${e.id}`}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={e.status} />
            <span className="font-mono text-[10px] text-muted-foreground">{e.code}</span>
            {e.team && <span className="inline-flex items-center gap-1 rounded-full bg-kind-hyp-soft px-2 py-0.5 text-[10px] font-semibold text-kind-hyp" data-testid={`team-chip-${e.id}`}><Users size={10} />{e.team.name}</span>}
            {e.role === 'editor' && !e.team && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{fill(t.sharedBy, { name: e.owner.name })}</span>}
          </div>
          <h3 className="mt-3 line-clamp-1 text-[17px] font-semibold tracking-[-.03em]" dir="auto">{e.title}</h3>
          <p className="mt-2 line-clamp-2 min-h-[40px] text-xs leading-5 text-muted-foreground" dir="auto">{e.summary}</p>
        </div>
        <div className="mt-4">
          <TraceLine points={points} testId={`trace-${e.id}`} />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" data-testid={`kinds-${e.id}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: kindColor('observation') }} />
              {fill(t.notesN, { n: counts?.observation ?? 0 })}
            </span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-border pt-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Clock3 size={12} />{relativeTime(e.updated_at, language)}</span>
          <span className="ms-auto flex -space-x-2 rtl:space-x-reverse" data-testid={`people-${e.id}`}>
            {people.slice(0, 3).map((p) => <Avatar key={p.id} person={p} size={22} ring />)}
            {people.length > 3 && <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-muted text-[10px] font-bold ring-2 ring-card">+{people.length - 3}</span>}
          </span>
          {analyzed ? (
            <span className="font-mono font-semibold text-primary" data-testid={`originality-${e.id}`}>{fill(t.originalityShort, { n: e.originality })}</span>
          ) : (
            <span data-testid={`originality-${e.id}`}>{t.notAnalyzed}</span>
          )}
        </div>
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2" data-testid={`actions-${e.id}`}>
        <StatusActions id={e.id} status={e.status} onSetStatus={onSetStatus} />
        <span className="ms-auto flex items-center gap-2">
        <button type="button" onClick={() => setPeopleOpen(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-primary/50 hover:text-foreground" aria-label={t.addPeople} title={t.addPeople} data-testid={`button-add-people-${e.id}`}>
          <UserPlus size={13} />
        </button>
        {e.role === 'owner' && (
          <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-destructive/50 hover:text-destructive" aria-label={t.deleteExperiment} title={t.deleteExperiment} data-testid={`button-delete-${e.id}`}>
            <Trash2 size={13} />
          </button>
        )}
        </span>
      </div>
      {peopleOpen && <AddPeopleDialog experiment={e} open={peopleOpen} onOpenChange={setPeopleOpen} />}
      {deleteOpen && <DeleteExperimentDialog experiment={e} open={deleteOpen} onOpenChange={setDeleteOpen} />}
    </article>
  );
}
