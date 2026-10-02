import { Crown, ShieldCheck } from 'lucide-react';
import { usePreferences } from '@/context/PreferencesContext';
import type { TeamRole } from '@/lib/types';

/** Owner and supervisor get an icon; a member is just a member. */
export function RoleBadge({ role, testId }: { role: TeamRole; testId?: string }) {
  const { t } = usePreferences();
  const style = role === 'owner' ? 'bg-kind-dec-soft text-kind-dec' : role === 'supervisor' ? 'bg-kind-hyp-soft text-kind-hyp' : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${style}`} data-role={role} data-testid={testId}>
      {role === 'owner' && <Crown size={11} />}
      {role === 'supervisor' && <ShieldCheck size={11} />}
      {role === 'owner' ? t.roleOwner : role === 'supervisor' ? t.roleSupervisor : t.roleMember}
    </span>
  );
}
