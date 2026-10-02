import { Users } from 'lucide-react';
import { useEffect } from 'react';
import { takePendingInvite } from '@/lib/invite';
import { Link, useLocation, useParams } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { usePreferences } from '@/context/PreferencesContext';
import { useAcceptInvite, useInvite } from '@/hooks/queries';
import { fill } from '@/lib/format';

/** Where an invite link lands: who invited you to which team, and one button to join. */
export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = usePreferences();
  const [, navigate] = useLocation();
  const q = useInvite(token);
  const accept = useAcceptInvite();
  useEffect(() => { takePendingInvite(); }, []);   // we are here now: the saved link has done its job
  if (q.isPending) return <div className="mx-auto h-56 max-w-md animate-pulse rounded-3xl border border-border bg-card/60" aria-busy="true" />;
  if (q.isError) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-dashed border-border bg-card/70 px-6 py-14 text-center" data-testid="invite-invalid">
        <p className="text-sm font-semibold">{t.inviteInvalid}</p>
        <Link href="/team" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">{t.navTeam}</Link>
      </div>
    );
  }
  const p = q.data;
  return (
    <div className="animate-in mx-auto max-w-md" data-testid="join-page">
      <section className="surface p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Users size={26} /></span>
        <p className="mt-5 text-sm text-muted-foreground">{t.joinTitle}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-.03em]" dir="auto" data-testid="invite-team-name">{p.team.name}</h1>
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground"><Avatar person={p.owner} size={22} />{fill(t.joinOwner, { name: p.owner.name, n: p.team.member_count })}</p>
        {p.already_member ? (
          <>
            <p className="mt-6 text-sm" data-testid="invite-already">{t.alreadyMember}</p>
            <Link href={`/team/${p.team.id}`} className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground">{t.openTeam}</Link>
          </>
        ) : (
          <button
            type="button"
            disabled={accept.isPending}
            onClick={() => accept.mutate(token, { onSuccess: (team) => navigate(`/team/${(team as { id: string }).id}`) })}
            className="mt-6 inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            data-testid="button-accept-invite"
          >
            {t.joinNow}
          </button>
        )}
        {accept.isError && <p className="mt-3 text-xs font-semibold text-destructive" role="alert">{t.inviteInvalid}</p>}
      </section>
    </div>
  );
}
