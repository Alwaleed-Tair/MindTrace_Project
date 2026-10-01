import { CircleHelp, FlaskConical, LayoutDashboard, Settings, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Logo } from '@/components/common/Logo';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { Avatar } from '@/components/common/Avatar';

export const SIDEBAR_ID = 'app-sidebar';

export function Sidebar() {
  const { t, dir, isDesktop, sidebarCollapsed, mobileNavOpen, closeMobileNav, sidebarVisible } = usePreferences();
  const { user } = useAuth();
  const [location] = useLocation();
  const rtl = dir === 'rtl';
  const nav = [
    { href: '/dashboard', label: t.dashboard, icon: LayoutDashboard, id: 'dashboard' },
    { href: '/dashboard', label: t.experiments, icon: FlaskConical, id: 'experiments' },
  ];
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
        className={`fixed inset-y-0 z-40 flex w-[250px] flex-col overflow-hidden bg-sidebar px-4 py-5 text-sidebar-foreground transition-all duration-300 md:relative md:inset-auto md:translate-x-0 ${rtl ? 'right-0' : 'left-0'} ${slide} ${sidebarCollapsed ? 'md:w-0 md:px-0 md:opacity-0' : 'md:w-[250px] md:opacity-100'}`}
        dir={dir}
      >
        <div className="flex w-[218px] items-center justify-between px-2">
          <Logo inverse />
          <button className="rounded-lg p-1.5 text-sidebar-foreground/60 hover:bg-white/10 hover:text-white md:hidden" onClick={closeMobileNav} aria-label={t.closeNavigation} data-testid="button-close-sidebar">
            <X size={18} />
          </button>
        </div>
        <div className="mt-10 w-[218px] px-2">
          <span className="font-mono text-[9px] uppercase tracking-[.25em] text-sidebar-foreground/40">Workspace</span>
          <nav className="mt-3 space-y-1">
            {nav.map(({ href, label, icon: Icon, id }, index) => (
              <Link key={id} href={href} onClick={closeMobileNav} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${location === href && index === 0 ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm' : 'text-sidebar-foreground/62 hover:bg-white/[.07] hover:text-white'}`} data-testid={`link-nav-${id}`}>
                <Icon size={16} />
                <span>{label}</span>
                {index === 0 && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-accent" />}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto w-[218px] space-y-1">
          <Link href="/settings" onClick={closeMobileNav} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${location === '/settings' ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/62 hover:bg-white/[.07] hover:text-white'}`} data-testid="link-nav-settings">
            <Settings size={16} />
            <span>{t.settings}</span>
          </Link>
          <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/62 transition hover:bg-white/[.07] hover:text-white" onClick={() => window.alert(t.helpMessage)} data-testid="button-help">
            <CircleHelp size={16} />
            <span>{t.help}</span>
          </button>
          {user && (
            <div className="mt-5 flex items-center gap-3 border-t border-sidebar-border px-2 pt-4">
              <Avatar person={user} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-sidebar-foreground">{user.name}</p>
                <p className="truncate text-[10px] text-sidebar-foreground/45">{user.lab}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
