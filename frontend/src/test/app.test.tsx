import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';
import { emptyStats, exp, lina, mockClipboard, noor, note, omar, renderApp } from './utils';

vi.mock('@/lib/api', async (orig) => {
  const real = await orig<typeof import('@/lib/api')>();
  return { ...real, api: Object.fromEntries(Object.keys(real.api).map((k) => [k, vi.fn()])) };
});
const A = api as unknown as Record<keyof typeof api, ReturnType<typeof vi.fn>>;

function signedIn(experiments = [exp()]) {
  A.me.mockResolvedValue({ user: noor });
  A.listExperiments.mockResolvedValue(experiments);
  A.stats.mockResolvedValue(emptyStats);
  A.notifications.mockResolvedValue({ unread_count: 0, items: [] });
  A.recentCollaborators.mockResolvedValue([lina, omar]);
  A.health.mockResolvedValue({ ok: true, version: 'x', ai_configured: false, demo_enabled: true, dev_tools: false });
  A.insights.mockResolvedValue({ status: 'none', result: null, error: null, updated_at: null, ai_configured: false });
}

beforeEach(() => {
  Object.values(A).forEach((f) => f.mockReset());
});

describe('sign in', () => {
  it('shows the sign-in page when nobody is signed in', async () => {
    A.me.mockRejectedValue(new ApiError(401, 'not signed in'));
    renderApp('/');
    expect(await screen.findByTestId('button-sign-in')).toBeInTheDocument();
    expect(screen.queryByTestId('server-offline')).not.toBeInTheDocument();
  });

  it('tells the user when the backend is offline, and can retry', async () => {
    A.me.mockRejectedValue(new ApiError(0, 'Cannot reach the MindTrace server. Is the backend running?'));
    renderApp('/');
    expect(await screen.findByTestId('server-offline')).toBeInTheDocument();
    A.me.mockRejectedValue(new ApiError(401, 'x'));
    await userEvent.click(screen.getByTestId('button-retry-server'));
    await waitFor(() => expect(screen.queryByTestId('server-offline')).not.toBeInTheDocument());
  });

  it('shows the server message for a wrong password and does not enter', async () => {
    A.me.mockRejectedValue(new ApiError(401, 'x'));
    A.login.mockRejectedValue(new ApiError(401, 'wrong email or password'));
    renderApp('/');
    await userEvent.type(await screen.findByTestId('input-email'), 'a@b.co');
    await userEvent.type(screen.getByTestId('input-password'), 'whatever1');
    await userEvent.click(screen.getByTestId('button-sign-in'));
    expect(await screen.findByTestId('auth-error')).toHaveTextContent('wrong email or password');
    expect(screen.queryByTestId('experiments-grid')).not.toBeInTheDocument();
  });

  it('logs in and lands on the dashboard', async () => {
    A.me.mockRejectedValueOnce(new ApiError(401, 'x'));
    A.login.mockImplementation(async () => {
      signedIn();
      return { user: noor };
    });
    renderApp('/');
    await userEvent.type(await screen.findByTestId('input-email'), 'noor@lab.com');
    await userEvent.type(screen.getByTestId('input-password'), 'correct-horse-1');
    await userEvent.click(screen.getByTestId('button-sign-in'));
    expect(await screen.findByTestId('experiments-grid')).toBeInTheDocument();
    expect(A.login).toHaveBeenCalledWith('noor@lab.com', 'correct-horse-1', true);
  });

  it('a private page redirects to sign-in when signed out', async () => {
    A.me.mockRejectedValue(new ApiError(401, 'x'));
    renderApp('/dashboard');
    expect(await screen.findByTestId('button-sign-in')).toBeInTheDocument();
  });
});

describe('header', () => {
  it('has the three-dots trigger first, then theme, notifications and the avatar together', async () => {
    signedIn();
    renderApp();
    const trigger = await screen.findByTestId('button-toggle-sidebar');
    const header = trigger.closest('header')!;
    const order = [...header.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid'));
    expect(order[0]).toBe('button-toggle-sidebar');
    const i = (id: string) => order.indexOf(id);
    expect(i('button-toggle-theme')).toBeGreaterThan(-1);
    expect(i('button-notifications')).toBe(i('button-toggle-theme') + 1);
    expect(i('avatar-user')).toBe(i('button-notifications') + 1);
    // and the theme switch is no longer in the sidebar or the dashboard body
    expect(within(screen.getByTestId('sidebar')).queryByTestId('button-toggle-theme')).toBeNull();
    expect(document.querySelectorAll('[data-testid=button-toggle-theme]')).toHaveLength(1);
  });

  it('the three-dots trigger opens and closes the sidebar, and remembers it', async () => {
    signedIn();
    renderApp();
    const trigger = await screen.findByTestId('button-toggle-sidebar');
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveAttribute('data-state', 'open');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(trigger);
    expect(sidebar).toHaveAttribute('data-state', 'closed');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(JSON.parse(window.localStorage.getItem('mindtrace.prefs')!).sidebarCollapsed).toBe(true);
    await userEvent.click(trigger);
    expect(sidebar).toHaveAttribute('data-state', 'open');
  });

  it('the theme switch flips dark mode and remembers it', async () => {
    signedIn();
    renderApp();
    await userEvent.click(await screen.findByTestId('button-toggle-theme'));
    expect(document.documentElement).toHaveClass('dark');
    expect(JSON.parse(window.localStorage.getItem('mindtrace.prefs')!).theme).toBe('dark');
    await userEvent.click(screen.getByTestId('button-toggle-theme'));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('the profile popover shows the user and a working Copy ID button', async () => {
    signedIn();
    const writeText = mockClipboard();
    renderApp();
    await userEvent.click(await screen.findByTestId('avatar-user'));
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Dr. Noor Rahman');
    expect(screen.getByTestId('profile-email')).toHaveTextContent('noor@lab.com');
    expect(screen.getByTestId('profile-user-id')).toHaveTextContent('MT-NOOR2345');
    await userEvent.click(screen.getByTestId('button-copy-user-id'));
    expect(writeText).toHaveBeenCalledWith('MT-NOOR2345');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('Copy ID still works when the Clipboard API is blocked', async () => {
    signedIn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);
    renderApp();
    await userEvent.click(await screen.findByTestId('avatar-user'));
    await userEvent.click(await screen.findByTestId('button-copy-user-id'));
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('signing out clears the session and returns to sign-in', async () => {
    signedIn();
    A.logout.mockResolvedValue({ ok: true });
    renderApp();
    await userEvent.click(await screen.findByTestId('avatar-user'));
    await userEvent.click(await screen.findByTestId('button-sign-out'));
    expect(await screen.findByTestId('button-sign-in')).toBeInTheDocument();
  });
});

describe('dashboard metrics', () => {
  it('shows real figures only: active, notes this week, documentation quality and notes to review; no Log Note button and no Insights card', async () => {
    signedIn();
    renderApp();
    await screen.findByTestId('experiments-grid');
    expect(screen.queryByText(/log note/i)).toBeNull();
    expect(screen.getByTestId('metric-active')).toHaveTextContent('1of 1');
    expect(screen.getByTestId('metric-notes')).toHaveTextContent('Notes this week31 last week');
    expect(screen.getByTestId('metric-quality')).toHaveTextContent('—'); // nothing analysed yet: no made-up number
    expect(screen.getByTestId('metric-review')).toHaveTextContent('0');
    // the old average originality averaged the default 50 of unanalysed experiments, so it is gone
    expect(screen.queryByTestId('metric-originality')).toBeNull();
    expect(screen.queryByTestId('link-nav-experiments')).toBeNull();
    expect(screen.queryByTestId('card-insights-summary')).toBeNull();
  });

  it('shows the documentation quality once experiments are analysed', async () => {
    signedIn();
    A.stats.mockResolvedValue({ ...emptyStats, insights: { ...emptyStats.insights, experiments_analyzed: 2, avg_documentation_quality: 74, notes_to_review: 3 } });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('metric-quality')).toHaveTextContent('74%'));
    expect(screen.getByTestId('metric-review')).toHaveTextContent('3');
  });
});

describe('the trace', () => {
  const at = (min: number) => new Date(Date.now() - (60 - min) * 60_000).toISOString();
  it('cards draw one dot per note and count the kinds; originality shows only after an analysis', async () => {
    signedIn([
      exp({ id: '1', trace: [{ at: at(0), kind: 'observation', time_label: null }, { at: at(30), kind: 'hypothesis', time_label: null }], kind_counts: { observation: 1, hypothesis: 1, decision: 0 } }),
      exp({ id: '2', title: 'Second', code: 'EXP-2', ai_status: 'done', originality: 71 }),
    ]);
    renderApp();
    await screen.findByTestId('experiments-grid');
    expect(screen.getByTestId('trace-1')).toHaveAttribute('data-points', '2');
    expect(screen.getByTestId('kinds-1')).toHaveTextContent('1Observation');
    expect(screen.getByTestId('kinds-1')).toHaveTextContent('1Hypothesis');
    expect(screen.getByTestId('originality-1')).toHaveTextContent('Not analyzed');
    expect(screen.getByTestId('originality-2')).toHaveTextContent('71');
  });

  it('the experiment page trace jumps to a note, and hypotheses are listed', async () => {
    signedIn();
    const n = (id: number, kind: 'observation' | 'hypothesis' | 'decision', min: number, text: string) => ({ id, text, kind, source: 'manual' as const, text_source: 'human' as const, time_label: null, created_at: at(min), updated_at: at(min), author: noor, asr: null, audio_file: null, has_audio: false, can_edit: true });
    A.getExperiment.mockResolvedValue(exp({ notes: [n(1, 'observation', 0, 'colour turned amber'), n(2, 'hypothesis', 20, 'airflow cools the sample'), n(3, 'decision', 40, 'repeat at 26 degrees')] }));
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderApp('/experiments/1');
    await screen.findByTestId('session-trace');
    expect(screen.getByTestId('trace-kinds')).toHaveTextContent('1 observations · 1 hypotheses · 1 decisions');
    expect(screen.getByTestId('note-kind-2')).toHaveTextContent('Hypothesis');
    expect(within(screen.getByTestId('card-hypotheses')).getByTestId('hypothesis-2')).toHaveTextContent('airflow cools the sample');
    await userEvent.click(screen.getByTestId('trace-mark-3'));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    // the kind filter keeps only one kind in the timeline
    await userEvent.click(screen.getByTestId('filter-kind-decision'));
    expect(screen.queryByTestId('note-1')).toBeNull();
    expect(screen.getByTestId('note-3')).toBeInTheDocument();
  });

  it('a note can be filed as a hypothesis', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.addNote.mockResolvedValue({});
    renderApp('/experiments/1');
    const box = await screen.findByTestId('textarea-new-note');
    await userEvent.click(screen.getByTestId('note-kind-hypothesis'));
    fireEvent.change(box, { target: { value: 'humidity matters' } });
    await userEvent.click(screen.getByTestId('button-save-note'));
    await waitFor(() => expect(A.addNote).toHaveBeenCalledWith('1', 'humidity matters', 'hypothesis'));
  });
});

describe('experiment card', () => {
  it('Complete and Paused buttons update the card at once and call the API', async () => {
    signedIn();
    let current = exp(); // a stateful fake server: it remembers the status like the real one
    A.listExperiments.mockImplementation(async () => [current]);
    A.setStatus.mockImplementation(async (id: string, status: string) => {
      current = exp({ id, status: status as 'Active' });
      return current;
    });
    renderApp();
    const card = await screen.findByTestId('card-experiment-1');
    expect(card).toHaveAttribute('data-status', 'Active');
    await userEvent.click(screen.getByTestId('button-complete-1'));
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'Completed'));
    expect(A.setStatus).toHaveBeenCalledWith('1', 'Completed');
    expect(screen.getByTestId('button-complete-1')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByTestId('button-pause-1'));
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'Paused'));
    expect(A.setStatus).toHaveBeenLastCalledWith('1', 'Paused');
    await userEvent.click(screen.getByTestId('button-pause-1')); // pressing the active one goes back to Active
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'Active'));
    expect(A.setStatus).toHaveBeenLastCalledWith('1', 'Active');
  });

  it('snaps back and says so when the server refuses', async () => {
    signedIn();
    A.setStatus.mockRejectedValue(new ApiError(500, 'boom'));
    renderApp();
    const card = await screen.findByTestId('card-experiment-1');
    await userEvent.click(screen.getByTestId('button-complete-1'));
    expect(await screen.findByTestId('status-error')).toBeInTheDocument();
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'Active'));
  });

  it('every card has an Add people button that opens the modal', async () => {
    signedIn([exp({ id: '1' }), exp({ id: '2', title: 'Second', code: 'EXP-2' })]);
    renderApp();
    await screen.findByTestId('card-experiment-2');
    expect(screen.getByTestId('button-add-people-1')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('button-add-people-2'));
    const dialog = await screen.findByTestId('dialog-add-people');
    expect(dialog).toHaveTextContent('Second');
  });
});

describe('add people', () => {
  it('finds a person by email or ID and adds them', async () => {
    signedIn();
    A.searchUsers.mockResolvedValue([lina]);
    A.addCollaborator.mockResolvedValue({ collaborator: lina, experiment: exp({ collaborators: [lina] }) });
    renderApp();
    await userEvent.click(await screen.findByTestId('button-add-people-1'));
    await userEvent.type(await screen.findByTestId('input-people-search'), 'lina@lab.com');
    const result = await screen.findByTestId(`result-${lina.id}`, undefined, { timeout: 3000 });
    expect(A.searchUsers).toHaveBeenCalledWith('lina@lab.com');
    await userEvent.click(within(result).getByTestId(`button-add-${lina.id}`));
    await waitFor(() => expect(A.addCollaborator).toHaveBeenCalledWith('1', lina.id));
    expect(await screen.findByTestId('people-success')).toBeInTheDocument();
  });

  it('says so when nobody matches', async () => {
    signedIn();
    A.searchUsers.mockResolvedValue([]);
    renderApp();
    await userEvent.click(await screen.findByTestId('button-add-people-1'));
    await userEvent.type(await screen.findByTestId('input-people-search'), 'MT-ZZZZZZZZ');
    expect(await screen.findByTestId('people-no-match', undefined, { timeout: 3000 })).toHaveTextContent('No user with that email or ID');
  });

  it('shows the server error when adding a stranger by typing the identifier', async () => {
    signedIn();
    A.searchUsers.mockResolvedValue([]);
    A.addCollaborator.mockRejectedValue(new ApiError(404, 'no user with that email or ID'));
    renderApp();
    await userEvent.click(await screen.findByTestId('button-add-people-1'));
    await userEvent.type(await screen.findByTestId('input-people-search'), 'nobody@lab.com');
    await userEvent.click(screen.getByTestId('button-people-add-typed'));
    expect(await screen.findByTestId('people-error')).toHaveTextContent('no user with that email or ID');
  });

  it('adds a recent collaborator with one click, and shows who already has access', async () => {
    signedIn([exp({ collaborators: [omar] })]);
    A.addCollaborator.mockResolvedValue({ collaborator: lina, experiment: exp({ collaborators: [omar, lina] }) });
    renderApp();
    await userEvent.click(await screen.findByTestId('button-add-people-1'));
    expect(await screen.findByTestId(`recent-${omar.id}`)).toHaveTextContent('Added'); // already in: no button
    expect(screen.queryByTestId(`button-add-${omar.id}`)).toBeNull();
    await userEvent.click(await screen.findByTestId(`button-add-${lina.id}`));
    await waitFor(() => expect(A.addCollaborator).toHaveBeenCalledWith('1', lina.id));
    const access = screen.getByTestId('people-with-access');
    expect(access).toHaveTextContent('Dr. Noor Rahman');
    expect(access).toHaveTextContent('Omar Khalid');
  });
});

describe('notifications', () => {
  it('shows no alert for what was already there, then an alert and a badge for a new collaborator note', async () => {
    signedIn();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      A.notifications.mockResolvedValue({ unread_count: 0, items: [] });
      renderApp();
      await screen.findByTestId('experiments-grid');
      expect(screen.queryByTestId('badge-notifications')).toBeNull();
      expect(screen.queryByTestId('toast-notification')).toBeNull();
      A.notifications.mockResolvedValue({ unread_count: 1, items: [note({ id: 7 })] });
      await vi.advanceTimersByTimeAsync(4500);
      const toast = await screen.findByTestId('toast-notification');
      expect(toast).toHaveTextContent('Dr. Lina Haddad added a note in Ambient temperature');
      expect(screen.getByTestId('badge-notifications')).toHaveTextContent('1');
      await vi.advanceTimersByTimeAsync(4500); // the same notification does not alert twice
      expect(screen.getAllByTestId('toast-notification')).toHaveLength(1);
      expect(A.listExperiments.mock.calls.length).toBeGreaterThan(1); // shared work was refreshed
    } finally {
      vi.useRealTimers();
    }
  });

  it('the bell lists notifications and "mark all read" clears the badge', async () => {
    signedIn();
    A.notifications.mockResolvedValue({ unread_count: 2, items: [note({ id: 2, kind: 'collaborator_added' }), note({ id: 1 })] });
    A.markRead.mockImplementation(async () => {
      A.notifications.mockResolvedValue({ unread_count: 0, items: [note({ id: 2, kind: 'collaborator_added', read: true }), note({ id: 1, read: true })] });
      return { marked: 2 };
    });
    renderApp();
    expect(await screen.findByTestId('badge-notifications')).toHaveTextContent('2');
    await userEvent.click(screen.getByTestId('button-notifications'));
    const pop = await screen.findByTestId('popover-notifications');
    expect(pop).toHaveTextContent('Dr. Lina Haddad added you to Ambient temperature');
    expect(pop).toHaveTextContent('Dr. Lina Haddad added a note in Ambient temperature');
    await userEvent.click(screen.getByTestId('button-mark-all-read'));
    await waitFor(() => expect(screen.queryByTestId('badge-notifications')).toBeNull());
    expect(A.markRead).toHaveBeenCalledWith();
  });

  it('the local mock trigger raises an alert and a badge without any server', async () => {
    signedIn();
    renderApp('/settings');
    await userEvent.click(await screen.findByTestId('button-mock-local'));
    expect(await screen.findByTestId('toast-notification')).toHaveTextContent('added a note');
    expect(screen.getByTestId('badge-notifications')).toHaveTextContent('1');
    await userEvent.click(screen.getByTestId('button-dismiss-toast'));
    expect(screen.queryByTestId('toast-notification')).toBeNull();
    expect(screen.getByTestId('badge-notifications')).toHaveTextContent('1'); // dismissing the alert does not mark it read
  });

  it('the server mock trigger falls back to the local one when dev tools are off', async () => {
    signedIn();
    A.simulateCollaboratorNote.mockRejectedValue(new ApiError(404, 'not found'));
    renderApp('/settings');
    await userEvent.click(await screen.findByTestId('button-mock-server'));
    expect(await screen.findByTestId('toast-notification')).toBeInTheDocument();
    expect(await screen.findByTestId('mock-result')).toHaveTextContent('local');
  });
});

describe('experiment page', () => {
  it('an unknown or foreign experiment is a clear "not found", never somebody else\'s data', async () => {
    signedIn();
    A.getExperiment.mockRejectedValue(new ApiError(404, 'no such experiment'));
    renderApp('/experiments/999');
    expect(await screen.findByTestId('experiment-missing')).toHaveTextContent('does not exist');
  });

  it('shows the Notes timeline wide and a compact Add note card; no Notes tab and no Insights card in the metrics', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ notes: [{ id: 5, text: 'first note', kind: 'observation', source: 'manual', text_source: 'human', time_label: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), author: noor, asr: null, audio_file: null, has_audio: false, can_edit: true }] }));
    renderApp('/experiments/1');
    const metrics = await screen.findByTestId('experiment-metrics');
    expect(within(metrics).queryByTestId('card-insights-summary')).toBeNull();
    expect(screen.queryByTestId('tab-notes')).toBeNull();
    expect(screen.getByTestId('tab-insights')).toBeInTheDocument();
    expect(screen.getByTestId('card-notes')).toHaveTextContent('first note');
    const grid = screen.getByTestId('card-notes').parentElement!;
    expect(grid.className).toMatch(/2\.1fr/); // notes column is the wide one
    expect(grid.className).toMatch(/\.9fr/); // add-note column is the narrow one
    expect(screen.getByTestId('card-add-note')).toBeInTheDocument();
    expect(screen.queryByText(/log note/i)).toBeNull();
  });

  it('adding a note posts it and clears the box; an empty note cannot be saved', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.addNote.mockResolvedValue({});
    renderApp('/experiments/1');
    const box = await screen.findByTestId('textarea-new-note');
    expect(screen.getByTestId('button-save-note')).toBeDisabled();
    fireEvent.change(box, { target: { value: '  the colour changed  ' } });
    await userEvent.click(screen.getByTestId('button-save-note'));
    await waitFor(() => expect(A.addNote).toHaveBeenCalledWith('1', 'the colour changed'));
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('a recorded note that needs review shows the second reading, and audio only when it exists', async () => {
    signedIn();
    const base = { kind: 'observation' as const, source: 'recording' as const, text_source: 'asr' as const, time_label: '00:25', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), author: noor, can_edit: true };
    A.getExperiment.mockResolvedValue(exp({ notes: [
      { ...base, id: 1, text: 'قاسنة تيم بريتشر', asr: { language: 'Arabic', confidence: 0.6, needs_review: true, language_rechecked: false, alternative: { engine: 'faster-whisper', model: 'turbo', text: 'جسنا التمبريتشر' } }, audio_file: 'notes/note_01.wav', has_audio: true },
      { ...base, id: 2, text: 'no audio here', asr: null, audio_file: 'notes/note_02.wav', has_audio: false },
    ] }));
    renderApp('/experiments/1');
    expect(await screen.findByTestId('note-review-1')).toBeInTheDocument();
    expect(screen.getByTestId('note-alt-1')).toHaveTextContent('جسنا التمبريتشر');
    expect(screen.getByTestId('audio-1')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-2')).toBeNull();
  });
});

describe('language', () => {
  it('switches to Arabic: right-to-left, translated, and remembered', async () => {
    signedIn();
    renderApp();
    await userEvent.click(await screen.findByTestId('button-toggle-language'));
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(await screen.findByText('التجارب الأخيرة')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('mindtrace.prefs')!).language).toBe('ar');
  });
});


const PAPER = { title: 'Temperature and reaction rate', authors: ['A. Author'], year: 2010, venue: 'arXiv', url: 'http://arxiv.org/abs/1', doi: '', source: 'arXiv', similarity: 'high' as const, why: 'Same topic.' };
const insightsOf = (over: Record<string, unknown> = {}, lang = 'en') => ({ status: 'done' as const, error: null, updated_at: 't1', ai_configured: true,
  result: { summary: 's', documentation_quality: { score: 50, strengths: [], gaps: [] }, novelty: { score: 40, rationale: 'r', caveat: 'c' }, note_suggestions: [], notes_to_review: [], note_kinds: [],
    meta: { model: 'm', provider: 'deepseek', generated_at: 'x', language: lang },
    literature: { status: 'ok', score: 64, rationale: 'Known principle.', caveat: 'Limited search.', sources: ['arXiv', 'Crossref'], similar: [PAPER] }, ...over } });

describe('originality from scholarly papers', () => {
  it('shows the score and the closest papers as links, and says where it searched', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.insights.mockResolvedValue(insightsOf());
    renderApp('/experiments/1');
    const card = await screen.findByTestId('card-originality');
    await waitFor(() => expect(within(card).getByTestId('similar-paper')).toBeInTheDocument());
    expect(within(card).getByRole('link', { name: /Temperature and reaction rate/ })).toHaveAttribute('href', 'http://arxiv.org/abs/1');
    expect(card).toHaveTextContent('64');
    expect(card).toHaveTextContent('Very similar');
    expect(card).toHaveTextContent('Searched: arXiv, Crossref');
  });

  it('says so when no related paper was found', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.insights.mockResolvedValue(insightsOf({ literature: { status: 'ok', score: 90, rationale: 'New.', caveat: '', sources: ['arXiv'], similar: [] } }));
    renderApp('/experiments/1');
    expect(await screen.findByTestId('no-similar-papers')).toBeInTheDocument();
  });
});

describe('AI text follows the interface language automatically (one cached translation, no regeneration)', () => {
  it('translates by itself once when the language differs, and never regenerates', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.insights.mockResolvedValue({ ...insightsOf({}, 'ar'), needs_translation: true });
    A.translateInsights.mockResolvedValue(insightsOf({}, 'en'));
    renderApp('/experiments/1');
    await waitFor(() => expect(A.translateInsights).toHaveBeenCalledWith('1', 'en'));
    await new Promise((r) => setTimeout(r, 60));
    expect(A.translateInsights).toHaveBeenCalledTimes(1);
    expect(A.refreshInsights).not.toHaveBeenCalled();
  });

  it('a failed translation is not retried by itself; the banner offers a retry', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.insights.mockResolvedValue({ ...insightsOf({}, 'ar'), needs_translation: true });
    A.translateInsights.mockRejectedValue(new ApiError(502, 'boom'));
    renderApp('/experiments/1');
    await waitFor(() => expect(A.translateInsights).toHaveBeenCalledTimes(1));
    await userEvent.click(await screen.findByTestId('tab-insights'));
    await userEvent.click(await screen.findByTestId('button-translate-insights'));
    await waitFor(() => expect(A.translateInsights).toHaveBeenCalledTimes(2));
  });

  it('does nothing when the text is already in the interface language', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.insights.mockResolvedValue({ ...insightsOf({}, 'en'), needs_translation: false });
    renderApp('/experiments/1');
    await screen.findByTestId('card-originality');
    await new Promise((r) => setTimeout(r, 60));
    expect(A.translateInsights).not.toHaveBeenCalled();
    expect(A.refreshInsights).not.toHaveBeenCalled();
  });
});

describe('originality note', () => {
  it('says higher is better, in a small note', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.insights.mockResolvedValue(insightsOf());
    renderApp('/experiments/1');
    expect(await screen.findByTestId('originality-scale')).toHaveTextContent('Higher is better');
  });
});

describe('delete experiment', () => {
  it('the owner confirms, then the experiment is deleted and gone from the list', async () => {
    signedIn([exp({ id: '7', title: 'Bad run' })]);
    A.deleteExperiment.mockImplementation(async () => { A.listExperiments.mockResolvedValue([]); });
    renderApp();
    await userEvent.click(await screen.findByTestId('button-delete-7'));
    expect(await screen.findByTestId('dialog-delete-experiment')).toHaveTextContent('Bad run');
    expect(A.deleteExperiment).not.toHaveBeenCalled(); // asking first
    await userEvent.click(screen.getByTestId('button-confirm-delete'));
    await waitFor(() => expect(A.deleteExperiment).toHaveBeenCalledWith('7'));
    await waitFor(() => expect(screen.queryByTestId('card-experiment-7')).toBeNull());
  });

  it('cancel keeps the experiment', async () => {
    signedIn([exp({ id: '7' })]);
    renderApp();
    await userEvent.click(await screen.findByTestId('button-delete-7'));
    await userEvent.click(await screen.findByTestId('button-cancel-delete'));
    expect(A.deleteExperiment).not.toHaveBeenCalled();
    expect(screen.getByTestId('card-experiment-7')).toBeInTheDocument();
  });

  it('a collaborator does not get a delete button', async () => {
    signedIn([exp({ id: '8', role: 'editor', owner: omar })]);
    renderApp();
    await screen.findByTestId('card-experiment-8');
    expect(screen.queryByTestId('button-delete-8')).toBeNull();
  });

  it('deleting from the experiment page goes back to the dashboard', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.deleteExperiment.mockResolvedValue(undefined);
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('button-delete-experiment'));
    await userEvent.click(await screen.findByTestId('button-confirm-delete'));
    expect(await screen.findByTestId('experiments-grid')).toBeInTheDocument();
  });

  it('shows an error and keeps the dialog when the server refuses', async () => {
    signedIn([exp({ id: '7' })]);
    A.deleteExperiment.mockRejectedValue(new ApiError(500, 'boom'));
    renderApp();
    await userEvent.click(await screen.findByTestId('button-delete-7'));
    await userEvent.click(await screen.findByTestId('button-confirm-delete'));
    expect(await screen.findByTestId('delete-error')).toBeInTheDocument();
    expect(screen.getByTestId('card-experiment-7')).toBeInTheDocument();
  });
});

describe('sidebar extras', () => {
  it('the logo goes back to the dashboard', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    renderApp('/experiments/1');
    await screen.findByTestId('experiment-page');
    await userEvent.click(screen.getByTestId('link-logo-home'));
    expect(await screen.findByTestId('experiments-grid')).toBeInTheDocument();
  });

  it('there is no Experiments button in the sidebar', async () => {
    signedIn();
    renderApp();
    await screen.findByTestId('experiments-grid');
    expect(screen.queryByTestId('link-nav-experiments')).toBeNull();
  });

  it('Feedback opens a mock form that can be filled and "sent"', async () => {
    signedIn();
    renderApp();
    await userEvent.click(await screen.findByTestId('button-help'));
    const dialog = await screen.findByTestId('dialog-feedback');
    expect(screen.getByTestId('button-feedback-send')).toBeDisabled();
    await userEvent.click(within(dialog).getByTestId('feedback-kind-bug'));
    await userEvent.type(within(dialog).getByTestId('textarea-feedback'), 'The chart is great');
    await userEvent.click(screen.getByTestId('button-feedback-send'));
    expect(await screen.findByTestId('feedback-sent')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('button-feedback-close'));
    await waitFor(() => expect(screen.queryByTestId('dialog-feedback')).toBeNull());
  });
});

describe('voice note (dictation)', () => {
  class FakeRecognition {
    static last: FakeRecognition | null = null;
    lang = ''; continuous = false; interimResults = false;
    onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
    start() { FakeRecognition.last = this; }
    stop() { this.onend?.(); }
  }
  const say = (text: string, isFinal = true) => FakeRecognition.last!.onresult!({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });

  it('the header button dictates into the note box and Stop saves it as a note', async () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.addNote.mockResolvedValue({ id: 9 });
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('button-toggle-recording'));
    expect(FakeRecognition.last!.lang).toBe('en-US');
    expect(await screen.findByTestId('status-recording')).toBeInTheDocument();
    act(() => say('we measured twenty five degrees'));
    expect(screen.getByTestId('textarea-new-note')).toHaveValue('we measured twenty five degrees');
    act(() => say('and it was stable'));
    expect(screen.getByTestId('textarea-new-note')).toHaveValue('we measured twenty five degrees and it was stable');
    await userEvent.click(screen.getByTestId('button-toggle-recording'));
    await waitFor(() => expect(screen.queryByTestId('status-recording')).toBeNull());
    await waitFor(() => expect(A.addNote).toHaveBeenCalledWith('1', 'we measured twenty five degrees and it was stable'));
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });

  it('says so, and the dictate button is disabled, when the browser cannot do speech recognition', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    renderApp('/experiments/1');
    expect(await screen.findByTestId('dictation-message')).toHaveTextContent('Chrome or Edge');
    expect(screen.getByTestId('button-dictate')).toBeDisabled();
  });
});


const mine = (id: number, text: string, over = {}) => ({ id, text, kind: 'observation' as const, source: 'manual' as const, text_source: 'human' as const, time_label: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), author: noor, asr: null, audio_file: null, has_audio: false, can_edit: true, ...over });

describe('edit and delete a note', () => {
  it('edits a note in place and saves it', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ notes: [mine(5, 'first draft')] }));
    A.updateNote.mockResolvedValue(mine(5, 'better text'));
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('note-edit-5'));
    const box = screen.getByTestId('note-edit-text-5');
    await userEvent.clear(box);
    await userEvent.type(box, 'better text');
    await userEvent.click(screen.getByTestId('note-edit-save-5'));
    await waitFor(() => expect(A.updateNote).toHaveBeenCalledWith(5, 'better text'));
    await waitFor(() => expect(screen.queryByTestId('note-editor-5')).toBeNull());
  });

  it('cancel keeps the text, and an empty text cannot be saved', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ notes: [mine(5, 'keep me')] }));
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('note-edit-5'));
    await userEvent.clear(screen.getByTestId('note-edit-text-5'));
    expect(screen.getByTestId('note-edit-save-5')).toBeDisabled();
    await userEvent.click(screen.getByTestId('note-edit-cancel-5'));
    expect(A.updateNote).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-5')).toHaveTextContent('keep me');
  });

  it('asks before deleting, then deletes', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ notes: [mine(5, 'remove me'), mine(6, 'stay')] }));
    A.deleteNote.mockResolvedValue(undefined);
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('button-delete-note-5'));
    expect(A.deleteNote).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('note-delete-cancel-5'));
    await userEvent.click(screen.getByTestId('button-delete-note-5'));
    await userEvent.click(screen.getByTestId('button-confirm-delete-note-5'));
    await waitFor(() => expect(A.deleteNote).toHaveBeenCalledWith(5));
  });

  it('somebody else\'s note has no edit or delete for a collaborator', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ role: 'editor', owner: omar, notes: [mine(5, 'not yours', { can_edit: false, author: omar })] }));
    renderApp('/experiments/1');
    await screen.findByTestId('note-5');
    expect(screen.queryByTestId('note-edit-5')).toBeNull();
    expect(screen.queryByTestId('button-delete-note-5')).toBeNull();
  });

  it('notes the AI left out as unrelated are marked', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ notes: [mine(5, 'random chatter'), mine(6, 'real work')] }));
    A.insights.mockResolvedValue(insightsOf({ ignored_note_ids: [5] }, 'en'));
    renderApp('/experiments/1');
    expect(await screen.findByTestId('note-ignored-5')).toBeInTheDocument();
    expect(screen.queryByTestId('note-ignored-6')).toBeNull();
  });
});

describe('dictation errors are specific', () => {
  it('a speech-service network error says what to do', async () => {
    class Failing { lang = ''; continuous = false; interimResults = false; onresult = null; onend: (() => void) | null = null; onerror: ((e: { error: string }) => void) | null = null;
      start() { setTimeout(() => { this.onerror?.({ error: 'network' }); this.onend?.(); }, 0); } stop() { this.onend?.(); } }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = Failing;
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('button-dictate'));
    expect(await screen.findByTestId('dictation-message')).toHaveTextContent('speech service');
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });
});


describe('the "needs review" badge is only for really uncertain notes', () => {
  const asr = (confidence: number) => ({ language: 'Arabic', confidence, needs_review: true, language_rechecked: false, alternative: { engine: 'faster-whisper', model: 'turbo', text: 'second' } });
  it('shows it below 0.85 confidence and hides it (and the second reading) at 0.85 or above', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ notes: [mine(1, 'low confidence', { asr: asr(0.7) }), mine(2, 'fine really', { asr: asr(0.89) })] }));
    renderApp('/experiments/1');
    expect(await screen.findByTestId('note-review-1')).toBeInTheDocument();
    expect(screen.getByTestId('note-alt-1')).toBeInTheDocument();
    expect(screen.queryByTestId('note-review-2')).toBeNull();
    expect(screen.queryByTestId('note-alt-2')).toBeNull();
  });
});
