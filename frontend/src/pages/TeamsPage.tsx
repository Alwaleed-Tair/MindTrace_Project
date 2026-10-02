import { ArrowUpRight, Link2, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { RoleBadge } from '@/components/common/RoleBadge';
import { usePreferences } from '@/context/PreferencesContext';
import { useCreateTeam, useTeams } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { fill } from '@/lib/format';
import { parseInvite } from '@/lib/invite';

const field = 'h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition placeholder:text-muted-foreground/55 focus:border-primary';
const primary = 'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition disabled:opacity-45';

/** Your teams, plus creating a new one or joining one with an invite link. */
export default function TeamsPage() {
  const { t } = usePreferences();
  const [, navigate] = useLocation();
  const teams = useTeams();
  const create = useCreateTeam();
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const items = teams.data ?? [];
  const submitCreate = () => {
    if (!name.trim() || create.isPending) return;
    create.mutate(name.trim(), { onSuccess: (team) => { setName(''); navigate(`/team/${(team as { id: string }).id}`); } });
  };
  const submitJoin = () => {
    const token = parseInvite(invite);
    if (token) navigate(`/join/${token}`);
  };
  return (
    <div className="animate-in" data-testid="teams-page">
      <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-[-.04em]"><Users size={26} className="text-primary" />{t.navTeam}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t.teamPageSub}</p>

      {items.length > 0 && (
        <section className="mt-8" aria-labelledby="your-teams">
          <h2 id="your-teams" className="text-sm font-semibold">{t.yourTeams}</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="teams-list">
            {items.map((team) => (
              <Link key={team.id} href={`/team/${team.id}`} className="surface group block p-5 transition hover:border-primary/40" data-testid={`team-card-${team.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-lg font-semibold tracking-[-.02em]"><bdi>{team.name}</bdi></span>
                  <RoleBadge role={team.role} />
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{fill(t.membersCount, { n: team.member_count })}</span>
                  <span>{fill(t.sharedExperimentsCount, { n: team.experiment_count })}</span>
                  <ArrowUpRight size={14} className="ms-auto opacity-0 transition group-hover:opacity-100 rtl:-scale-x-100" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="surface p-6" data-testid="card-create-team">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus size={17} className="text-primary" />{t.createTeam}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.createTeamSub}</p>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); submitCreate(); }}>
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t.teamNamePlaceholder} className={field} dir="auto" data-testid="input-team-name" />
            <button type="submit" disabled={!name.trim() || create.isPending} className={primary} data-testid="button-create-team">{t.createBtn}</button>
          </form>
          {create.isError && <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{create.error instanceof ApiError ? create.error.message : t.teamActionFailed}</p>}
        </section>
        <section className="surface p-6" data-testid="card-join-team">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Link2 size={17} className="text-primary" />{t.joinTeam}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.joinTeamSub}</p>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); submitJoin(); }}>
            <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder={t.invitePlaceholder} className={field} dir="ltr" data-testid="input-invite" />
            <button type="submit" disabled={!parseInvite(invite)} className={primary} data-testid="button-join-team">{t.join}</button>
          </form>
        </section>
      </div>
    </div>
  );
}
