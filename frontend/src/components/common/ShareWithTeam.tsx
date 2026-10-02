import { Users } from 'lucide-react';
import { usePreferences } from '@/context/PreferencesContext';
import { useShareWithTeam, useTeams } from '@/hooks/queries';
import type { Experiment } from '@/lib/types';

/** On an experiment: which team it is shared with. The owner can change it; everyone else just sees it. */
export function ShareWithTeam({ experiment }: { experiment: Experiment }) {
  const { t } = usePreferences();
  const teams = useTeams(experiment.role === 'owner').data ?? [];
  const share = useShareWithTeam(experiment.id);
  if (experiment.role !== 'owner') {
    return experiment.team ? (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground" data-testid="experiment-team">
        <Users size={13} />{experiment.team.name}
      </span>
    ) : null;
  }
  if (!teams.length && !experiment.team) return null;
  return (
    <label className="relative inline-flex items-center" title={t.teamLabel}>
      <Users size={13} className="pointer-events-none absolute start-2.5 text-muted-foreground" />
      <select
        value={experiment.team?.id ?? ''}
        disabled={share.isPending}
        onChange={(e) => share.mutate(e.target.value || null)}
        className="h-[30px] appearance-none rounded-lg border border-border bg-background ps-7 pe-3 text-[11px] font-semibold text-muted-foreground outline-none transition hover:border-primary/50 hover:text-foreground focus:border-primary"
        aria-label={t.teamLabel}
        data-testid="select-experiment-team"
      >
        <option value="">{t.notShared}</option>
        {experiment.team && !teams.some((tm) => tm.id === experiment.team!.id) && <option value={experiment.team.id}>{experiment.team.name}</option>}
        {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
      </select>
    </label>
  );
}
