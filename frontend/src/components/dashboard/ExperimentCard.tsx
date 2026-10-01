import { Beaker, CheckCircle2, Clock3, PauseCircle, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { StatusPill } from '@/components/common/StatusPill';
import { DeleteExperimentDialog } from '@/components/dashboard/DeleteExperimentDialog';
import { AddPeopleDialog } from '@/components/dashboard/AddPeopleDialog';
import { StatusActions } from '@/components/dashboard/StatusActions';
import { usePreferences } from '@/context/PreferencesContext';
import { fill, relativeTime } from '@/lib/format';
import type { Experiment, Status } from '@/lib/types';

const colorClass: Record<string, string> = {
  mint: 'bg-accent/45 text-primary',
  lilac: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  sand: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  blue: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

const stateClass: Record<Status, string> = {
  Active: '',
  Paused: '!border-amber-400/50 !bg-amber-50/60 dark:!bg-amber-950/20',
  Completed: '!bg-muted/40',
};

export function ExperimentCard({ experiment, onSetStatus }: { experiment: Experiment; onSetStatus: (id: string, status: Status) => void }) {
  const { t, language } = usePreferences();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const e = experiment;
  const people = [e.owner, ...e.collaborators];

  return (
    <article className={`group surface p-5 transition duration-200 hover:border-primary/40 ${stateClass[e.status]}`} data-testid={`card-experiment-${e.id}`} data-status={e.status}>
      <Link href={`/experiments/${e.id}`} className="block rounded-xl" data-testid={`link-experiment-${e.id}`}>
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorClass[e.color] ?? colorClass.mint}`}>
            {e.status === 'Completed' ? <CheckCircle2 size={18} /> : e.status === 'Paused' ? <PauseCircle size={18} /> : <Beaker size={18} />}
          </div>
          <div className="flex -space-x-2 rtl:space-x-reverse" data-testid={`people-${e.id}`}>
            {people.slice(0, 4).map((p) => <Avatar key={p.id} person={p} size={26} ring />)}
            {people.length > 4 && <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-muted text-[10px] font-bold ring-2 ring-card">+{people.length - 4}</span>}
          </div>
        </div>
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={e.status} />
            <span className="font-mono text-[10px] text-muted-foreground">{e.code}</span>
            {e.role === 'editor' && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{fill(t.sharedBy, { name: e.owner.name })}</span>}
          </div>
          <h3 className="mt-3 line-clamp-1 text-[17px] font-semibold tracking-[-.03em]">{e.title}</h3>
          <p className="mt-2 line-clamp-2 min-h-[40px] text-xs leading-5 text-muted-foreground">{e.summary}</p>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Clock3 size={12} />{relativeTime(e.updated_at, language)}</span>
          <span className="font-mono text-primary">{fill(t.signal, { n: e.originality })}</span>
        </div>
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2" data-testid={`actions-${e.id}`}>
        <StatusActions id={e.id} status={e.status} onSetStatus={onSetStatus} />
        <button type="button" onClick={() => setPeopleOpen(true)} className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground" data-testid={`button-add-people-${e.id}`}>
          <UserPlus size={13} />
          {t.addPeople}
        </button>
        {e.role === 'owner' && (
          <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-destructive/50 hover:text-destructive" aria-label={t.deleteExperiment} title={t.deleteExperiment} data-testid={`button-delete-${e.id}`}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {peopleOpen && <AddPeopleDialog experiment={e} open={peopleOpen} onOpenChange={setPeopleOpen} />}
      {deleteOpen && <DeleteExperimentDialog experiment={e} open={deleteOpen} onOpenChange={setDeleteOpen} />}
    </article>
  );
}
