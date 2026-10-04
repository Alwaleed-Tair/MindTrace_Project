import { LayoutDashboard, MessageSquareHeart, Settings, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { FeedbackDialog } from '@/components/layout/FeedbackDialog';
import { Logo } from '@/components/common/Logo';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { Avatar } from '@/components/common/Avatar';
import { useExperiments } from '@/hooks/queries';

export const SIDEBAR_ID = 'app-sidebar';

export function Sidebar() {
  const { t, dir, isDesktop, sidebarCollapsed, mobileNavOpen, closeMobileNav, sidebarVisible } = usePreferences();
  const { user } = useAuth();
  const [location] = useLocation();
  const rtl = dir === 'rtl';
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const active = useExperiments({ status: 'Active', sort: 'newest' });
  const nav = [
    { href: '/dashboard', label: t.dashboard, icon: LayoutDashboard, id: 'dashboard' },
    { href: '/team', label: t.navTeam, icon: Users, id: 'team' },
  ];
  const isActive = (href: string) => location === href || (href === '/team' && (location.startsWith('/team/') || location.startsWith('/join/')));
  const slide = mobileNavOpen ? 'translate-x-0' : rtl ? 'translate-x-full' : '-translate-x-full';
  return (
    <>
      {mobileNavOpen && !isDesktop && <button aria-label={t.closeNavigation} className="fixed inset-0 z-30 bg-[hsl(var(--foreground)/.28)] md:hidden" onClick={closeMobileNav} data-testid="button-close-mobile-nav" />}
      <aside
        id={SIDEBAR_ID}
        aria-hidden={!sidebarVisible}
        inert={!sidebarVisible}
        data-state={sidebarVisible ? 'open' : 'closed'}
        data-testid="sidebar"
        className={`sidebar-ink fixed inset-y-0 z-40 flex w-[250px] flex-col overflow-hidden border-e border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-all duration-300 md:relative md:inset-auto md:translate-x-0 ${rtl ? 'right-0' : 'left-0'} ${slide} ${sidebarCollapsed ? 'md:w-0 md:px-0 md:opacity-0' : 'md:w-[250px] md:opacity-100'}`}
        dir={dir}
      >
        <div className="flex w-[218px] items-center justify-between px-2">
          <Link href="/dashboard" onClick={closeMobileNav} className="rounded-xl" aria-label={t.dashboard} data-testid="link-logo-home">
            <Logo />
          </Link>
          <button className="rounded-lg p-1.5 text-sidebar-muted hover:bg-sidebar-active hover:text-white md:hidden" onClick={closeMobileNav} aria-label={t.closeNavigation} data-testid="button-close-sidebar">
            <X size={18} />
          </button>
        </div>
        <div className="mt-10 w-[218px] px-2">
          <span className="text-[11px] font-semibold text-sidebar-muted">{t.workspaceLabel}</span>
          <nav className="mt-3 space-y-1">
            {nav.map(({ href, label, icon: Icon, id }) => (
              <Link key={id} href={href} onClick={closeMobileNav} aria-current={isActive(href) ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive(href) ? 'bg-sidebar-active font-semibold text-white' : 'text-sidebar-foreground/80 hover:bg-sidebar-active hover:text-white'}`} data-testid={`link-nav-${id}`}>
                <Icon size={16} />
                <span>{label}</span>
                {isActive(href) && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-sidebar-accent" />}
              </Link>
            ))}
          </nav>
        </div>
        {(active.data?.length ?? 0) > 0 && (
          <div className="mt-8 w-[218px] px-2" data-testid="sidebar-active">
            <span className="text-[11px] font-semibold text-sidebar-muted">{t.activeExperimentsNav}</span>
            <ul className="mt-2 space-y-0.5">
              {active.data!.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <Link href={`/experiments/${e.id}`} onClick={closeMobileNav} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${location === `/experiments/${e.id}` ? 'bg-sidebar-active text-white' : 'text-sidebar-foreground/80 hover:bg-sidebar-active hover:text-white'}`} data-testid={`sidebar-exp-${e.id}`}>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-sidebar-accent" />
                    <span className="truncate" dir="auto">{e.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto w-[218px] space-y-1">
          <Link href="/settings" onClick={closeMobileNav} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${location === '/settings' ? 'bg-sidebar-active font-semibold text-white' : 'text-sidebar-foreground/80 hover:bg-sidebar-active hover:text-white'}`} data-testid="link-nav-settings">
            <Settings size={16} />
            <span>{t.settings}</span>
          </Link>
          <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/80 transition hover:bg-sidebar-active hover:text-white" onClick={() => setFeedbackOpen(true)} data-testid="button-help">
            <MessageSquareHeart size={16} />
            <span>{t.help}</span>
          </button>
          {user && (
            <div className="mt-5 flex items-center gap-3 border-t border-sidebar-border px-2 pt-4">
              <Avatar person={user} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{user.name}</p>
                <p className="truncate text-[11px] text-sidebar-muted">{user.lab}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
