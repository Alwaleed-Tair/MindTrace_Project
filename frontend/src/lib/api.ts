import type { Experiment, Health, Insights, Note, NoteKind, NotificationItem, Person, Stats, Status, LibraryNote } from './types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
  /** The backend could not be reached at all (offline, wrong address, CORS). */
  get isNetwork() {
    return this.status === 0;
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x) => (typeof x === 'string' ? x : `${(x as { field?: string }).field ?? ''}: ${(x as { problem?: string }).problem ?? ''}`)).join('; ');
  }
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mindtrace' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the MindTrace server. Is the backend running?');
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new ApiError(res.status, messageOf(data, `Request failed (${res.status})`));
  return data as T;
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b);
const del = <T = void>(p: string) => request<T>('DELETE', p);

export const api = {
  health: () => get<Health>('/health'),
  me: () => get<{ user: Person }>('/auth/me'),
  login: (email: string, password: string, remember: boolean) => post<{ user: Person }>('/auth/login', { email, password, remember }),
  register: (name: string, email: string, password: string, lab: string) => post<{ user: Person }>('/auth/register', { name, email, password, lab }),
  demo: () => post<{ user: Person }>('/auth/demo'),
  logout: () => post<{ ok: boolean }>('/auth/logout'),
  createApiToken: (label: string) => post<{ token: string; label: string }>('/auth/api-token', { label }),
  updateProfile: (fields: { name?: string; lab?: string }) => patch<{ user: Person }>('/auth/me', fields),
  changePassword: (current_password: string, new_password: string) => post<{ ok: boolean }>('/auth/password', { current_password, new_password }),
  forgotPassword: (email: string) => post<{ ok: boolean; email_configured: boolean }>('/auth/forgot', { email }),
  resetPassword: (token: string, new_password: string) => post<{ user: Person }>('/auth/reset', { token, new_password }),
  deleteAccount: (password: string) => request<{ ok: boolean }>('DELETE', '/auth/me', { password }),

  stats: () => get<Stats>('/stats'),
  listExperiments: (p: { status?: string; q?: string; sort?: string } = {}) => {
    const qs = new URLSearchParams();
    if (p.status && p.status !== 'All') qs.set('status', p.status);
    if (p.q) qs.set('q', p.q);
    if (p.sort) qs.set('sort', p.sort);
    return get<{ items: Experiment[] }>(`/experiments${qs.size ? `?${qs}` : ''}`).then((r) => r.items);
  },
  getExperiment: (id: string) => get<Experiment>(`/experiments/${encodeURIComponent(id)}`),
  createExperiment: (title: string, summary: string) => post<Experiment>('/experiments', { title, summary }),
  setStatus: (id: string, status: Status) => patch<Experiment>(`/experiments/${encodeURIComponent(id)}`, { status }),
  updateExperiment: (id: string, fields: { title?: string; summary?: string }) => patch<Experiment>(`/experiments/${encodeURIComponent(id)}`, fields),

  addNote: (id: string, text: string, kind: NoteKind = 'observation') => post<Note>(`/experiments/${encodeURIComponent(id)}/notes`, { text, kind }),
  listNotes: (p: { kind?: NoteKind; source?: 'manual' | 'recording'; q?: string; review?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (p.kind) qs.set('kind', p.kind);
    if (p.source) qs.set('source', p.source);
    if (p.q) qs.set('q', p.q);
    if (p.review) qs.set('review', 'true');
    return get<{ items: LibraryNote[] }>(`/notes${qs.size ? `?${qs}` : ''}`).then((r) => r.items);
  },
  updateNote: (noteId: number, text: string) => patch<Note>(`/notes/${noteId}`, { text }),
  deleteNote: (noteId: number) => del(`/notes/${noteId}`),

  searchUsers: (q: string) => get<{ items: Person[] }>(`/users/search?q=${encodeURIComponent(q)}`).then((r) => r.items),
  removeCollaborator: (id: string, personId: string) => del(`/experiments/${encodeURIComponent(id)}/collaborators/${encodeURIComponent(personId)}`),
  recentCollaborators: () => get<{ items: Person[] }>('/collaborators/recent').then((r) => r.items),
  addCollaborator: (id: string, identifier: string) =>
    post<{ collaborator: Person; experiment: Experiment }>(`/experiments/${encodeURIComponent(id)}/collaborators`, { identifier }),

  notifications: () => get<{ unread_count: number; items: NotificationItem[] }>('/notifications?limit=30'),
  markRead: (ids?: number[]) => post<{ marked: number }>('/notifications/read', ids ? { ids } : {}),

  insights: (id: string, language: string) => get<Insights>(`/experiments/${encodeURIComponent(id)}/insights?language=${language}`),
  translateInsights: (id: string, language: string) => post<Insights>(`/experiments/${encodeURIComponent(id)}/insights/translate?language=${language}`),
  deleteExperiment: (id: string) => del(`/experiments/${encodeURIComponent(id)}`),
  refreshInsights: (id: string, language: string) => post<{ status: string }>(`/experiments/${encodeURIComponent(id)}/insights?language=${language}`),

  simulateCollaboratorNote: (experimentId?: string) => post<{ experiment_id: string }>('/dev/simulate-collaborator-note', experimentId ? { experiment_id: experimentId } : {}),
};
