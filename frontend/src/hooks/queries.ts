import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { Experiment, Insights, Status } from '@/lib/types';

/** Queries are per signed-in person (the cache is cleared on sign in/out), and never retry a 4xx. */
const retry = (count: number, err: unknown) => !(err instanceof ApiError && err.status < 500 && err.status !== 0) && count < 1;

export function useExperiments(params: { status?: string; q?: string; sort?: string }) {
  return useQuery({ queryKey: ['experiments', params], queryFn: () => api.listExperiments(params), retry, placeholderData: (prev) => prev });
}

export function useExperiment(id: string) {
  return useQuery({ queryKey: ['experiment', id], queryFn: () => api.getExperiment(id), retry });
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: api.stats, retry });
}

export function useRecentCollaborators(enabled: boolean) {
  return useQuery({ queryKey: ['recent-collaborators'], queryFn: api.recentCollaborators, enabled, retry });
}

export function useInsights(id: string) {
  return useQuery<Insights>({
    queryKey: ['insights', id],
    queryFn: () => api.insights(id),
    retry,
    refetchInterval: (q) => (q.state.data && ['queued', 'running'].includes(q.state.data.status) ? 2000 : false),
  });
}

export function useCreateExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, summary }: { title: string; summary: string }) => api.createExperiment(title, summary),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['experiments'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
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
    mutationFn: (text: string) => api.addNote(id, text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['experiment', id] });
      void qc.invalidateQueries({ queryKey: ['experiments'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
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
