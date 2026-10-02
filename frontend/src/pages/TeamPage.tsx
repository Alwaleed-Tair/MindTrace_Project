import { ArrowLeft, LogOut, Pencil, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { CopyButton } from '@/components/common/CopyButton';
import { StatusPill } from '@/components/common/StatusPill';
import { RoleBadge } from '@/components/common/RoleBadge';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useAddTeamMember, useDeleteTeam, useRemoveTeamMember, useRenameTeam, useResetInvite, useSetTeamRole, useTeam } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { fill, relativeTime } from '@/lib/format';
import { inviteUrl } from '@/lib/invite';
import type { TeamDetail, TeamMember } from '@/lib/types';

const field = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground/55 focus:border-primary';
const ghost = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:opacity-45';

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function MemberRow({ team, m, meId }: { team: TeamDetail; m: TeamMember; meId?: string }) {
  const { t } = usePreferences();
  const setRole = useSetTeamRole(team.id);
  const remove = useRemoveTeamMember(team.id);
  const [asking, setAsking] = useState(false);
  const isMe = m.id === meId;
  // who may remove whom: the owner anyone but themself; a supervisor only members
  const canRemove = !isMe && m.role !== 'owner' && (team.role === 'owner' || (team.role === 'supervisor' && m.role === 'member'));
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4" data-testid={`member-${m.id}`}>
      <Avatar person={m} size={38} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{m.name}</span>
          <RoleBadge role={m.role} testId={`member-role-${m.id}`} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {[m.lab, m.email, fill(t.memberStats, { e: m.experiment_count, n: m.notes_14d })].filter(Boolean).join(' · ')}
        </p>
      </div>
      {team.role === 'owner' && m.role !== 'owner' && (
        <select
          value={m.role}
          onChange={(e) => setRole.mutate({ personId: m.id, role: e.target.value as 'member' | 'supervisor' })}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-semibold outline-none focus:border-primary"
          aria-label={t.roleSupervisor}
          data-testid={`select-role-${m.id}`}
        >
          <option value="member">{t.roleMember}</option>
          <option value="supervisor">{t.roleSupervisor}</option>
        </select>
      )}
      {canRemove && (asking ? (
        <span className="inline-flex items-center gap-1.5" role="alertdialog">
          <button type="button" onClick={() => remove.mutate(m.id)} className="rounded-md bg-destructive px-2 py-1 text-[11px] font-semibold text-destructive-foreground" data-testid={`confirm-remove-${m.id}`}>{t.removeMember}</button>
          <button type="button" onClick={() => setAsking(false)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted">{t.cancel}</button>
        </span>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={ghost} data-testid={`button-remove-${m.id}`}>{t.removeMember}</button>
      ))}
    </li>
  );
}

function AddMember({ team }: { team: TeamDetail }) {
  const { t } = usePreferences();
  const add = useAddTeamMember(team.id);
  const [who, setWho] = useState('');
  const [role, setRole] = useState<'member' | 'supervisor'>('member');
  const submit = () => {
    if (!who.trim() || add.isPending) return;
    add.mutate({ identifier: who.trim(), role }, { onSuccess: () => { setWho(''); setRole('member'); } });
  };
  return (
    <section className="surface p-5" data-testid="card-add-member">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus size={15} className="text-primary" />{t.addMember}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t.addMemberSub}</p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="name@lab.com · MT-…" className={field} dir="ltr" data-testid="input-member" />
        {team.role === 'owner' && (
          <select value={role} onChange={(e) => setRole(e.target.value as 'member' | 'supervisor')} className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" data-testid="select-new-member-role">
            <option value="member">{t.roleMember}</option>
            <option value="supervisor">{t.roleSupervisor}</option>
          </select>
        )}
        <button type="submit" disabled={!who.trim() || add.isPending} className="h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45" data-testid="button-add-member">{t.add}</button>
      </form>
      {add.isError && <p className="mt-2 text-xs font-semibold text-destructive" role="alert" data-testid="add-member-error">{errorText(add.error, t.teamActionFailed)}</p>}
    </section>
  );
}

function InviteCard({ team }: { team: TeamDetail }) {
  const { t } = usePreferences();
  const reset = useResetInvite(team.id);
  if (!team.invite_token) return null;
  const url = inviteUrl(team.invite_token);
  return (
    <section className="surface p-5" data-testid="card-invite">
      <h3 className="text-sm font-semibold">{t.inviteLink}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.inviteLinkSub}</p>
      <p className="mt-3 truncate rounded-xl bg-muted px-3 py-2.5 font-mono text-[11px]" dir="ltr" data-testid="invite-url">{url}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={url} label={t.copyLink} testId="button-copy-invite" />
        <button type="button" onClick={() => reset.mutate(undefined)} disabled={reset.isPending} className={ghost} data-testid="button-reset-invite"><RefreshCw size={13} />{t.resetLink}</button>
      </div>
    </section>
  );
}

function Header({ team, meId }: { team: TeamDetail; meId?: string }) {
  const { t } = usePreferences();
  const [, navigate] = useLocation();
  const rename = useRenameTeam(team.id);
  const del = useDeleteTeam(team.id);
  const leave = useRemoveTeamMember(team.id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [asking, setAsking] = useState(false);
  const owner = team.role === 'owner';
  return (
    <header className="ink-band rounded-3xl border border-sidebar-border p-6 sm:p-8" data-testid="team-header">
      <Link href="/team" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft size={15} className="rtl:rotate-180" />{t.navTeam}</Link>
      {editing ? (
        <form className="flex max-w-lg gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) rename.mutate(name.trim(), { onSuccess: () => setEditing(false) }); }}>
          <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={field} dir="auto" data-testid="input-rename-team" />
          <button type="submit" className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="button-save-team-name">{t.save}</button>
          <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-xl px-3 text-sm text-muted-foreground">{t.cancel}</button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl" dir="auto" data-testid="team-name">{team.name}</h1>
          <RoleBadge role={team.role} testId="my-team-role" />
          {owner && <button type="button" onClick={() => { setName(team.name); setEditing(true); }} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground" aria-label={t.rename} title={t.rename} data-testid="button-rename-team"><Pencil size={14} /></button>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex -space-x-2 rtl:space-x-reverse">{team.members.slice(0, 6).map((m) => <Avatar key={m.id} person={m} size={26} ring />)}</span>
        <span>{fill(t.membersCount, { n: team.member_count })}</span>
        <span>{fill(t.sharedExperimentsCount, { n: team.experiment_count })}</span>
        <span className="ms-auto flex items-center gap-2">
          {asking ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-xs" role="alertdialog" data-testid="team-confirm">
              <span>{owner ? t.deleteTeamAsk : t.leaveTeamAsk}</span>
              <button
                type="button"
                onClick={() => (owner ? del.mutate(undefined, { onSuccess: () => navigate('/team') }) : leave.mutate(meId ?? '', { onSuccess: () => navigate('/team') }))}
                className="rounded-md bg-destructive px-2.5 py-1 font-semibold text-destructive-foreground"
                data-testid="button-confirm-team"
              >
                {owner ? t.deleteTeam : t.leaveTeam}
              </button>
              <button type="button" onClick={() => setAsking(false)} className="rounded-md px-2 py-1 font-semibold">{t.cancel}</button>
            </span>
          ) : (
            <button type="button" onClick={() => setAsking(true)} className={`${ghost} hover:border-destructive/50 hover:text-destructive`} data-testid={owner ? 'button-delete-team' : 'button-leave-team'}>
              {owner ? <Trash2 size={13} /> : <LogOut size={13} className="rtl:-scale-x-100" />}
              {owner ? t.deleteTeam : t.leaveTeam}
            </button>
          )}
        </span>
      </div>
    </header>
  );
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = usePreferences();
  const { user } = useAuth();
  const q = useTeam(id);
  if (q.isPending) return <div className="h-64 animate-pulse rounded-3xl border border-border bg-card/60" aria-busy="true" />;
  if (q.isError) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/70 px-6 py-16 text-center" data-testid="team-missing">
        <p className="text-sm font-semibold">{t.teamMissing}</p>
        <Link href="/team" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">{t.navTeam}</Link>
      </div>
    );
  }
  const team = q.data;
  const manager = team.role === 'owner' || team.role === 'supervisor';
  return (
    <div className="animate-in" data-testid="team-page" data-role={team.role}>
      <Header team={team} meId={user?.id} />
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="surface overflow-hidden" aria-labelledby="members-h">
            <h2 id="members-h" className="border-b border-border px-5 py-4 text-sm font-semibold">{t.members}</h2>
            <ul className="divide-y divide-border" data-testid="members-list">{team.members.map((m) => <MemberRow key={m.id} team={team} m={m} meId={user?.id} />)}</ul>
          </section>
          {manager && <AddMember team={team} />}
        </div>
        <div className="space-y-5">
          {manager && <InviteCard team={team} />}
          <section className="surface overflow-hidden" aria-labelledby="team-exps-h">
            <h2 id="team-exps-h" className="border-b border-border px-5 py-4 text-sm font-semibold">{t.teamExperiments}</h2>
            {team.experiments.length ? (
              <ul className="divide-y divide-border" data-testid="team-experiments">
                {team.experiments.map((e) => (
                  <li key={e.id}>
                    <Link href={`/experiments/${e.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-muted/50" data-testid={`team-exp-${e.id}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold" dir="auto">{e.title}</span>
                        <span className="text-[11px] text-muted-foreground">{e.owner.name} · {relativeTime(e.updated_at, language)}</span>
                      </span>
                      <StatusPill status={e.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-xs leading-5 text-muted-foreground" data-testid="team-experiments-empty">{t.noTeamExperiments}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
