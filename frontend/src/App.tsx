import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import DashboardPage from '@/pages/DashboardPage';
import ExperimentPage from '@/pages/ExperimentPage';
import JoinPage from '@/pages/JoinPage';
import TeamPage from '@/pages/TeamPage';
import TeamsPage from '@/pages/TeamsPage';
import { peekPendingInvite, savePendingInvite } from '@/lib/invite';
import NotFound from '@/pages/not-found';
import ReportPage from '@/pages/ReportPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import SettingsPage from '@/pages/SettingsPage';
import SignInPage from '@/pages/SignInPage';

/** Pages that need a signed-in user: wait for the first check, then either show the page inside the shell or go to the sign-in page. */
function Private({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { status } = useAuth();
  const [location] = useLocation();
  if (status === 'loading') return <div className="min-h-[100dvh] bg-background" aria-busy="true" data-testid="auth-loading" />;
  if (status !== 'authed') {
    // an invite link opened while signed out: remember it, and come back to it after signing in
    const invite = location.match(/^\/join\/([A-Za-z0-9_-]+)/);
    if (invite) savePendingInvite(invite[1]);
    return <Redirect to="/" />;
  }
  return bare ? <>{children}</> : <AppShell>{children}</AppShell>;
}

function Home() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="min-h-[100dvh] bg-background" aria-busy="true" data-testid="auth-loading" />;
  if (status === 'authed') {
    const invite = peekPendingInvite();
    return <Redirect to={invite ? `/join/${invite}` : '/dashboard'} />;
  }
  return <SignInPage />;
}

function Routes() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/dashboard">
          <Private><DashboardPage /></Private>
        </Route>
        <Route path="/team">
          <Private><TeamsPage /></Private>
        </Route>
        <Route path="/team/:id">
          <Private><TeamPage /></Private>
        </Route>
        <Route path="/join/:token">
          <Private><JoinPage /></Private>
        </Route>
        <Route path="/experiments/:id/report">
          <Private bare><ReportPage /></Private>
        </Route>
        <Route path="/experiments/:id">
          <Private><ExperimentPage /></Private>
        </Route>
        <Route path="/settings">
          <Private><SettingsPage /></Private>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true } } });
}

export default function App({ client }: { client?: QueryClient }) {
  const [qc] = useState(() => client ?? makeQueryClient());
  return (
    <QueryClientProvider client={qc}>
      <PreferencesProvider>
        <AuthProvider>
          <NotificationsProvider>
            <Routes />
          </NotificationsProvider>
        </AuthProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
