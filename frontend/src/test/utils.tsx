import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import App from '@/App';
import { AuthProvider } from '@/context/AuthContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import type { Experiment, NotificationItem, Person, Stats } from '@/lib/types';

export const noor: Person = { id: 'MT-NOOR2345', name: 'Dr. Noor Rahman', lab: 'Materials lab', initials: 'NR', email: 'noor@lab.com' };
export const lina: Person = { id: 'MT-LINA2345', name: 'Dr. Lina Haddad', lab: 'Biophysics lab', initials: 'LH', email: 'lina@lab.com' };
export const omar: Person = { id: 'MT-OMAR2345', name: 'Omar Khalid', lab: 'Materials lab', initials: 'OK', email: 'omar@lab.com' };

export function exp(over: Partial<Experiment> = {}): Experiment {
  return { id: '1', code: 'EXP-1', title: 'Ambient temperature', summary: 'Mapping the response curve.', status: 'Active', duration: '00:10:00', duration_sec: 600,
    originality: 80, tags: ['Kinetics'], color: 'mint', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), role: 'owner', owner: noor,
    collaborators: [], note_count: 0, session_id: null, ai_status: 'none', notes: [], ...over };
}

export const emptyStats: Stats = { active_threads: 1, total_threads: 1, notes_this_week: 3, notes_last_week: 1, avg_originality: 78,
  insights: { experiments_analyzed: 0, notes_to_review: 0, avg_documentation_quality: null, latest: null } };

export function note(over: Partial<NotificationItem> = {}): NotificationItem {
  return { id: 1, kind: 'note_added', message: 'added a note', created_at: new Date().toISOString(), read: false, actor: lina, experiment: { id: '1', title: 'Ambient temperature' }, ...over };
}

export function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
}

/** The whole app at a given path. */
export function renderApp(path = '/dashboard') {
  window.history.pushState({}, '', path);
  return render(<App client={newClient()} />);
}

/** Providers only, for testing one component. */
export function renderWithProviders(ui: ReactElement) {
  return render(
    <QueryClientProvider client={newClient()}>
      <PreferencesProvider>
        <AuthProvider>
          <NotificationsProvider>{ui}</NotificationsProvider>
        </AuthProvider>
      </PreferencesProvider>
    </QueryClientProvider>,
  );
}

export function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}
