import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '@/components/common/Avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useAddCollaborator, useRecentCollaborators, useRemoveCollaborator } from '@/hooks/queries';
import { api, ApiError } from '@/lib/api';
import { fill } from '@/lib/format';
import type { Experiment, Person } from '@/lib/types';

const LOOKS_LIKE_ID = /^(?:[^@\s]+@[^@\s]+\.[^@\s]+|mt-[a-z0-9]{8})$/i;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function PersonRow({ person, action, testId }: { person: Person; action: React.ReactNode; testId: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5" data-testid={testId}>
      <Avatar person={person} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{person.name}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground" dir="ltr">{person.id}{person.lab ? ` · ${person.lab}` : ''}</p>
      </div>
      {action}
    </li>
  );
}

/** Owner only: remove a collaborator, after a one-line confirm. */
function RemoveButton({ experiment, person }: { experiment: Experiment; person: Person }) {
  const { t } = usePreferences();
  const [asking, setAsking] = useState(false);
  const remove = useRemoveCollaborator(experiment.id);
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive" data-testid={`button-remove-${person.id}`}>
        {t.removePerson}
      </button>
    );
  return (
    <span className="flex flex-col items-end gap-1" data-testid={`confirm-remove-${person.id}`}>
      <span className="text-[10px] font-semibold text-destructive">{remove.isError ? t.actionFailed : fill(t.removePersonAsk, { name: person.name })}</span>
      <span className="flex gap-1">
        <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(person.id)} className="rounded-md bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground disabled:opacity-50" data-testid={`button-confirm-remove-${person.id}`}>{t.removePerson}</button>
        <button type="button" disabled={remove.isPending} onClick={() => { remove.reset(); setAsking(false); }} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{t.cancel}</button>
      </span>
    </span>
  );
}

/** Add People: find someone by email or user ID, or invite a recent collaborator with one click. */
export function AddPeopleDialog({ experiment, open, onOpenChange }: { experiment: Experiment; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, dir } = usePreferences();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const add = useAddCollaborator(experiment.id);
  const recent = useRecentCollaborators(open);
  const query = useDebounced(input.trim(), 350);
  const valid = LOOKS_LIKE_ID.test(query);

  useEffect(() => {
    if (!open) {
      setInput('');
      setError(null);
      setJustAdded(null);
    }
  }, [open]);

  const found = useQuery({ queryKey: ['user-search', query], queryFn: () => api.searchUsers(query), enabled: open && valid, retry: false });
  const member = useMemo(() => new Set([experiment.owner.id, ...experiment.collaborators.map((c) => c.id), user?.id ?? '']), [experiment, user]);

  const invite = (identifier: string) => {
    setError(null);
    add.mutate(identifier, {
      onSuccess: (r) => {
        setJustAdded(r.collaborator.id);
        setInput('');
      },
      onError: (e) => setError(e instanceof ApiError ? e.message : t.notFound),
    });
  };

  const addButton = (p: Person) =>
    member.has(p.id) ? (
      <span className="text-[11px] font-semibold text-muted-foreground" data-testid={`added-${p.id}`}>{t.added}</span>
    ) : (
      <button type="button" onClick={() => invite(p.id)} disabled={add.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-50" data-testid={`button-add-${p.id}`}>
        <UserPlus size={12} />
        {t.add}
      </button>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-h-[90dvh] max-w-md overflow-y-auto rounded-3xl border-border bg-card p-6 text-card-foreground shadow-2xl" data-testid="dialog-add-people">
        <DialogTitle className="text-xl font-semibold tracking-[-.04em]">{t.addPeopleTitle}</DialogTitle>
        <DialogDescription className="text-xs leading-5 text-muted-foreground">{fill(t.addPeopleSub, { title: experiment.title })}</DialogDescription>

        <form
          className="mt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) invite(input.trim());
          }}
        >
          <label className="block">
            <span className="mb-2 block text-xs font-semibold">{t.idOrEmail}</span>
            <span className="flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-3 transition focus-within:border-primary">
              <Search size={15} className="text-muted-foreground" />
              <input autoFocus value={input} onChange={(e) => { setInput(e.target.value); setError(null); setJustAdded(null); }} placeholder={t.idOrEmailPlaceholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/55" dir="ltr" data-testid="input-people-search" />
              <button type="submit" disabled={!input.trim() || add.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40" data-testid="button-people-add-typed">
                {t.add}
              </button>
            </span>
          </label>
        </form>

        {error && <p className="text-xs font-semibold text-destructive" role="alert" data-testid="people-error">{error}</p>}
        {justAdded && !error && <p className="text-xs font-semibold text-primary" role="status" data-testid="people-success">{t.added} ✓</p>}

        {valid && (
          <ul className="space-y-2" data-testid="people-search-results">
            {found.isFetching && <li className="text-xs text-muted-foreground">{t.searching}</li>}
            {!found.isFetching && found.data?.length === 0 && <li className="text-xs text-muted-foreground" data-testid="people-no-match">{t.notFound}</li>}
            {found.data?.map((p) => <PersonRow key={p.id} person={p} action={addButton(p)} testId={`result-${p.id}`} />)}
          </ul>
        )}

        <section>
          <h3 className="text-xs font-semibold">{t.recentCollaborators}</h3>
          {recent.data && recent.data.length > 0 ? (
            <ul className="mt-2 space-y-2" data-testid="recent-collaborators">
              {recent.data.map((p) => <PersonRow key={p.id} person={p} action={addButton(p)} testId={`recent-${p.id}`} />)}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="recent-empty">{t.noRecent}</p>
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold">{t.withAccess}</h3>
          <ul className="mt-2 space-y-2" data-testid="people-with-access">
            <PersonRow person={experiment.owner} testId="access-owner" action={<span className="text-[11px] font-semibold text-muted-foreground">{t.owner}</span>} />
            {experiment.collaborators.map((p) => <PersonRow key={p.id} person={p} testId={`access-${p.id}`} action={experiment.role === 'owner' ? <RemoveButton experiment={experiment} person={p} /> : null} />)}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}
