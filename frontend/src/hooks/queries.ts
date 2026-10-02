import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePreferences } from '@/context/PreferencesContext';
import { api, ApiError } from '@/lib/api';
import type { Experiment, Insights, Status, NoteKind } from '@/lib/types';

/** Queries are per signed-in person (the cache is cleared on sign in/out), and never retry a 4xx. */
const retry = (count: number, err: unknown) => !(err instanceof ApiError && err.status < 500 && err.status !== 0) && count < 1;

export function useExperiments(params: { status?: string; q?: string; sort?: string }) {
  return useQuery({ queryKey: ['experiments', params], queryFn: () => api.listExperiments(params), retry, placeholderData: (prev) => prev });
}

export function useExperiment(id: string) {
  return useQuery({ queryKey: ['experiment', id], queryFn: () => api.getExperiment(id), retry });
}

export function useNotes(params: Parameters<typeof api.listNotes>[0]) {
  return useQuery({ queryKey: ['notes', params], queryFn: () => api.listNotes(params), retry, placeholderData: (prev) => prev });
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: api.stats, retry });
}

export function useRecentCollaborators(enabled: boolean) {
  return useQuery({ queryKey: ['recent-collaborators'], queryFn: api.recentCollaborators, enabled, retry });
}

export function useInsights(id: string) {
  const { language } = usePreferences();
  return useQuery<Insights>({
    queryKey: ['insights', id, language],
    queryFn: () => api.insights(id, language),
    retry,
    refetchInterval: (q) => (q.state.data && ['queued', 'running'].includes(q.state.data.status) ? 2000 : false),
  });
}

export function useCreateExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, summary, teamId }: { title: string; summary: string; teamId?: string | null }) => api.createExperiment(title, summary, teamId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['experiments'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

/** The Complete / Paused buttons: the card changes at once, and snaps back if the server says no. */
export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) => api.setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['experiments'] });
      const snapshots = qc.getQueriesData<Experiment[]>({ queryKey: ['experiments'] });
      qc.setQueriesData<Experiment[]>({ queryKey: ['experiments'] }, (list) => list?.map((e) => (e.id === id ? { ...e, status } : e)));
      qc.setQueryData<Experiment>(['experiment', id], (e) => (e ? { ...e, status } : e));
      return { snapshots };
    },
    onError: (_e, _v, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ['experiments'] });
      void qc.invalidateQueries({ queryKey: ['experiment', v.id] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useAddNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    // a plain string is an observation; pass { text, kind } to file a hypothesis or a decision
    mutationFn: (v: string | { text: string; kind: NoteKind }) => (typeof v === 'string' || v.kind === 'observation' ? api.addNote(id, typeof v === 'string' ? v : v.text) : api.addNote(id, v.text, v.kind)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['experiment', id] });
      void qc.invalidateQueries({ queryKey: ['experiments'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

export function useUpdateNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, text }: { noteId: number; text: string }) => api.updateNote(noteId, text),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['experiment', id] }),
  });
}

export function useAddCollaborator(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (identifier: string) => api.addCollaborator(id, identifier),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['experiments'] });
      void qc.invalidateQueries({ queryKey: ['experiment', id] });
      void qc.invalidateQueries({ queryKey: ['recent-collaborators'] });
    },
  });
}

export function useRefreshInsights(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (language: string) => api.refreshInsights(id, language),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['insights', id] }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['experiment', id] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/** Translate the existing analysis once (kept on the server: switching language again costs nothing). */
export function useTranslateInsights(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (language: string) => api.translateInsights(id, language),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['insights', id] }),
  });
}

export function useDeleteExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteExperiment(id),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ['experiment', id] });
      qc.removeQueries({ queryKey: ['insights', id] });
      void qc.invalidateQueries({ queryKey: ['experiments'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

function useExperimentChanged(id: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['experiment', id] });
    void qc.invalidateQueries({ queryKey: ['experiments'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };
}

/** Title and summary (owner only; the server checks it too). */
export function useUpdateExperiment(id: string) {
  const changed = useExperimentChanged(id);
  return useMutation({
    mutationFn: (fields: { title?: string; summary?: string }) => api.updateExperiment(id, fields),
    onSuccess: changed,
  });
}

export function useDeleteNote(id: string) {
  const changed = useExperimentChanged(id);
  return useMutation({ mutationFn: (noteId: number) => api.deleteNote(noteId), onSuccess: changed });
}

export function useRemoveCollaborator(id: string) {
  const changed = useExperimentChanged(id);
  return useMutation({ mutationFn: (personId: string) => api.removeCollaborator(id, personId), onSuccess: changed });
}

// ------------------------------------------------------------------ teams
export function useTeams(enabled = true) {
  return useQuery({ queryKey: ['teams'], queryFn: api.listTeams, retry, enabled });
}

export function useTeam(id: string) {
  return useQuery({ queryKey: ['team', id], queryFn: () => api.getTeam(id), retry });
}

/** Any change to a team: the team page, the list of teams and the experiments it can see are refreshed. */
function useTeamMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['teams'] });
      void qc.invalidateQueries({ queryKey: ['team'] });
      void qc.invalidateQueries({ queryKey: ['experiments'] });
      void qc.invalidateQueries({ queryKey: ['experiment'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

export const useCreateTeam = () => useTeamMutation((name: string) => api.createTeam(name));
export const useRenameTeam = (id: string) => useTeamMutation((name: string) => api.renameTeam(id, name));
export const useDeleteTeam = (id: string) => useTeamMutation(() => api.deleteTeam(id));
export const useAddTeamMember = (id: string) => useTeamMutation((v: { identifier: string; role: 'member' | 'supervisor' }) => api.addTeamMember(id, v.identifier, v.role));
export const useSetTeamRole = (id: string) => useTeamMutation((v: { personId: string; role: 'member' | 'supervisor' }) => api.setTeamRole(id, v.personId, v.role));
export const useRemoveTeamMember = (id: string) => useTeamMutation((personId: string) => api.removeTeamMember(id, personId));
export const useResetInvite = (id: string) => useTeamMutation(() => api.resetInvite(id));
export const useAcceptInvite = () => useTeamMutation((token: string) => api.acceptInvite(token));
export const useShareWithTeam = (experimentId: string) => useTeamMutation((teamId: string | null) => api.shareWithTeam(experimentId, teamId));

export function useInvite(token: string) {
  return useQuery({ queryKey: ['invite', token], queryFn: () => api.previewInvite(token), retry: false });
}
