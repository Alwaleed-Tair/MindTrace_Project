import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';
import type { Note } from '@/lib/types';
import { emptyStats, exp, lina, noor, renderApp } from './utils';

vi.mock('@/lib/api', async (orig) => {
  const real = await orig<typeof import('@/lib/api')>();
  return { ...real, api: Object.fromEntries(Object.keys(real.api).map((k) => [k, vi.fn()])) };
});
const A = api as unknown as Record<keyof typeof api, ReturnType<typeof vi.fn>>;
const now = new Date().toISOString();
const note = (over: Partial<Note> = {}): Note => ({ id: 7, text: 'first reading', kind: 'observation', source: 'manual', text_source: 'human', time_label: null, created_at: now, updated_at: now, author: noor, asr: null, audio_file: null, has_audio: false, can_edit: true, ...over });

function signedIn() {
  A.me.mockResolvedValue({ user: noor });
  A.listExperiments.mockResolvedValue([exp()]);
  A.stats.mockResolvedValue(emptyStats);
  A.notifications.mockResolvedValue({ unread_count: 0, items: [] });
  A.recentCollaborators.mockResolvedValue([]);
  A.health.mockResolvedValue({ ok: true, version: 'x', ai_configured: false, demo_enabled: true, dev_tools: false });
  A.insights.mockResolvedValue({ status: 'none', result: null, error: null, updated_at: null, ai_configured: false });
}

beforeEach(() => {
  Object.values(A).forEach((f) => f.mockReset());
});

describe('forgot and reset password', () => {
  it('asks for a reset link from the sign-in page without revealing whether the account exists', async () => {
    A.me.mockRejectedValue(new ApiError(401, 'x'));
    A.forgotPassword.mockResolvedValue({ ok: true, email_configured: false });
    renderApp('/');
    await userEvent.click(await screen.findByTestId('button-forgot-password'));
    expect(screen.queryByTestId('input-password')).toBeNull();
    await userEvent.type(screen.getByTestId('input-email'), 'noor@lab.com');
    await userEvent.click(screen.getByTestId('button-sign-in'));
    expect(A.forgotPassword).toHaveBeenCalledWith('noor@lab.com');
    expect(await screen.findByTestId('forgot-sent')).toBeInTheDocument();
    expect(screen.getByTestId('forgot-no-email')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('button-switch-mode'));
    expect(screen.getByTestId('input-password')).toBeInTheDocument();
  });

  it('sets a new password from the link and signs in', async () => {
    A.me.mockRejectedValue(new ApiError(401, 'x'));
    A.resetPassword.mockImplementation(async () => {
      signedIn();
      return { user: noor };
    });
    renderApp('/reset-password?token=abc123token');
    await userEvent.type(await screen.findByTestId('input-new-password'), 'brand-new-33');
    await userEvent.type(screen.getByTestId('input-confirm-password'), 'different-44');
    await userEvent.click(screen.getByTestId('button-reset-save'));
    expect(await screen.findByTestId('reset-error')).toBeInTheDocument();
    expect(A.resetPassword).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByTestId('input-confirm-password'));
    await userEvent.type(screen.getByTestId('input-confirm-password'), 'brand-new-33');
    await userEvent.click(screen.getByTestId('button-reset-save'));
    await waitFor(() => expect(A.resetPassword).toHaveBeenCalledWith('abc123token', 'brand-new-33'));
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });

  it('says so when the link has no token', async () => {
    A.me.mockRejectedValue(new ApiError(401, 'x'));
    renderApp('/reset-password');
    expect(await screen.findByTestId('reset-missing')).toBeInTheDocument();
  });
});

describe('settings: own account', () => {
  it('edits name and lab', async () => {
    signedIn();
    A.updateProfile.mockResolvedValue({ user: { ...noor, name: 'Dr. Noor R.', lab: 'Optics' } });
    renderApp('/settings');
    await userEvent.click(await screen.findByTestId('button-edit-profile'));
    const nameInput = screen.getByTestId('input-profile-name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Dr. Noor R.');
    await userEvent.clear(screen.getByTestId('input-profile-lab'));
    await userEvent.type(screen.getByTestId('input-profile-lab'), 'Optics');
    await userEvent.click(screen.getByTestId('button-save-profile'));
    expect(A.updateProfile).toHaveBeenCalledWith({ name: 'Dr. Noor R.', lab: 'Optics' });
    expect(await screen.findByTestId('profile-name-lab')).toHaveTextContent('Dr. Noor R. · Optics');
  });

  it('changes the password, checking the confirmation first and showing the server message', async () => {
    signedIn();
    A.changePassword.mockRejectedValueOnce(new ApiError(422, 'the current password is not correct')).mockResolvedValueOnce({ ok: true });
    renderApp('/settings');
    await userEvent.type(await screen.findByTestId('input-current-password'), 'old-pass-11');
    await userEvent.type(screen.getByTestId('input-change-new-password'), 'new-pass-22');
    await userEvent.type(screen.getByTestId('input-change-confirm-password'), 'new-pass-23');
    await userEvent.click(screen.getByTestId('button-change-password'));
    expect(await screen.findByTestId('password-error')).toBeInTheDocument();
    expect(A.changePassword).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('input-change-confirm-password'), { target: { value: 'new-pass-22' } });
    await userEvent.click(screen.getByTestId('button-change-password'));
    expect(await screen.findByTestId('password-error')).toHaveTextContent('the current password is not correct');
    await userEvent.click(screen.getByTestId('button-change-password'));
    expect(await screen.findByTestId('password-changed')).toBeInTheDocument();
    expect(A.changePassword).toHaveBeenLastCalledWith('old-pass-11', 'new-pass-22');
  });

  it('deletes the account after the password and returns to sign in', async () => {
    signedIn();
    A.deleteAccount.mockResolvedValue({ ok: true });
    renderApp('/settings');
    await userEvent.click(await screen.findByTestId('button-delete-account'));
    await userEvent.type(screen.getByTestId('input-delete-account-password'), 'correct-horse-1');
    A.me.mockRejectedValue(new ApiError(401, 'x'));
    await userEvent.click(screen.getByTestId('button-confirm-delete-account'));
    expect(A.deleteAccount).toHaveBeenCalledWith('correct-horse-1');
    expect(await screen.findByTestId('button-sign-in')).toBeInTheDocument();
  });
});

describe('editing an experiment', () => {
  it('the owner edits the title and summary', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp());
    A.updateExperiment.mockResolvedValue(exp({ title: 'Heat and reaction time' }));
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('button-edit-details'));
    const title = screen.getByTestId('input-edit-title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Heat and reaction time');
    A.getExperiment.mockResolvedValue(exp({ title: 'Heat and reaction time' }));
    await userEvent.click(screen.getByTestId('button-save-details'));
    expect(A.updateExperiment).toHaveBeenCalledWith('1', { title: 'Heat and reaction time', summary: 'Mapping the response curve.' });
    expect(await screen.findByTestId('experiment-title')).toHaveTextContent('Heat and reaction time');
  });

  it('a collaborator does not see the edit button', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ role: 'editor', owner: lina, collaborators: [noor] }));
    renderApp('/experiments/1');
    await screen.findByTestId('experiment-title');
    expect(screen.queryByTestId('button-edit-details')).toBeNull();
  });

  it('deletes a note after confirming', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ notes: [note(), note({ id: 8, text: 'not mine', can_edit: false, author: lina })] }));
    A.deleteNote.mockResolvedValue(undefined);
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('button-delete-note-7'));
    expect(screen.queryByTestId('button-delete-note-8')).toBeNull();
    A.getExperiment.mockResolvedValue(exp({ notes: [note({ id: 8, text: 'not mine', can_edit: false, author: lina })] }));
    await userEvent.click(screen.getByTestId('button-confirm-delete-note-7'));
    expect(A.deleteNote).toHaveBeenCalledWith(7);
    await waitFor(() => expect(screen.queryByTestId('note-7')).toBeNull());
  });

  it('the owner removes a collaborator from Add people', async () => {
    signedIn();
    A.getExperiment.mockResolvedValue(exp({ collaborators: [lina] }));
    A.removeCollaborator.mockResolvedValue(undefined);
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('button-add-people-page'));
    await userEvent.click(await screen.findByTestId(`button-remove-${lina.id}`));
    A.getExperiment.mockResolvedValue(exp({ collaborators: [] }));
    await userEvent.click(screen.getByTestId(`button-confirm-remove-${lina.id}`));
    expect(A.removeCollaborator).toHaveBeenCalledWith('1', lina.id);
    await waitFor(() => expect(screen.queryByTestId(`access-${lina.id}`)).toBeNull());
  });
});
