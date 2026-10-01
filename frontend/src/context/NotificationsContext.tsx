import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { NotificationItem, NotificationKind, Person } from '@/lib/types';

const POLL_MS = 4000;
const TOAST_MS = 7000;
const MAX_TOASTS = 3;

export interface MockOptions {
  kind?: NotificationKind;
  actorName?: string;
  experimentId?: string;
  experimentTitle?: string;
}

interface NotificationsValue {
  items: NotificationItem[]; // newest first, mock ones included
  unreadCount: number;
  toasts: NotificationItem[];
  markRead: (ids: (number | string)[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissToast: (id: number | string) => void;
  /** Mock trigger 1: a notification that exists only in this browser tab (no server involved). */
  triggerLocalMock: (opts?: MockOptions) => void;
  /** Mock trigger 2: asks the server (when MINDTRACE_DEV_TOOLS=true) to make a fake colleague add a real note. Falls back to the local mock. */
  triggerServerMock: (experimentId?: string) => Promise<'server' | 'local'>;
}

const Ctx = createContext<NotificationsValue | null>(null);

const MOCK_ACTOR: Person = { id: 'MT-MOCK0000', name: 'Dr. Lina Haddad', lab: 'Biophysics lab', initials: 'LH' };

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [locals, setLocals] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const seen = useRef<Set<number | string> | null>(null);
  const localCounter = useRef(0);

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: api.notifications,
    enabled: !!user,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });

  useEffect(() => {
    seen.current = null; // a different person signed in: start fresh
    setLocals([]);
    setToasts([]);
  }, [user?.id]);

  const pushToast = useCallback((n: NotificationItem) => {
    setToasts((cur) => [n, ...cur.filter((x) => x.id !== n.id)].slice(0, MAX_TOASTS));
    window.setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== n.id)), TOAST_MS);
  }, []);

  // An alert for every unread server notification we have not shown yet (the first load only learns what already exists).
  useEffect(() => {
    const data = query.data;
    if (!data) return;
    if (seen.current === null) {
      seen.current = new Set(data.items.map((i) => i.id));
      return;
    }
    const fresh = data.items.filter((i) => !seen.current!.has(i.id) && !i.read);
    data.items.forEach((i) => seen.current!.add(i.id));
    if (fresh.length) {
      fresh.slice(0, MAX_TOASTS).forEach(pushToast);
      void qc.invalidateQueries({ queryKey: ['experiments'] }); // someone changed shared work: refresh the cards and notes
      void qc.invalidateQueries({ queryKey: ['experiment'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    }
  }, [query.data, pushToast, qc]);

  const items = useMemo(() => [...locals, ...(query.data?.items ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)), [locals, query.data]);
  const unreadCount = (query.data?.unread_count ?? 0) + locals.filter((l) => !l.read).length;

  const markRead = useCallback(
    async (ids: (number | string)[]) => {
      const serverIds = ids.filter((i): i is number => typeof i === 'number');
      setLocals((cur) => cur.map((l) => (ids.includes(l.id) ? { ...l, read: true } : l)));
      if (serverIds.length) {
        await api.markRead(serverIds);
        await qc.invalidateQueries({ queryKey: ['notifications'] });
      }
    },
    [qc],
  );

  const markAllRead = useCallback(async () => {
    setLocals((cur) => cur.map((l) => ({ ...l, read: true })));
    await api.markRead();
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  }, [qc]);

  const triggerLocalMock = useCallback(
    (opts: MockOptions = {}) => {
      localCounter.current += 1;
      const n: NotificationItem = {
        id: `local-${Date.now()}-${localCounter.current}`,
        kind: opts.kind ?? 'note_added',
        message: 'mock',
        created_at: new Date().toISOString(),
        read: false,
        actor: { ...MOCK_ACTOR, name: opts.actorName ?? MOCK_ACTOR.name },
        experiment: { id: opts.experimentId ?? '', title: opts.experimentTitle ?? 'EXP-204' },
        local: true,
      };
      setLocals((cur) => [n, ...cur]);
      pushToast(n);
    },
    [pushToast],
  );

  const triggerServerMock = useCallback(
    async (experimentId?: string) => {
      try {
        await api.simulateCollaboratorNote(experimentId);
        await qc.invalidateQueries({ queryKey: ['notifications'] }); // the poll would find it within a few seconds; do not wait
        return 'server' as const;
      } catch {
        triggerLocalMock({ experimentId });
        return 'local' as const;
      }
    },
    [qc, triggerLocalMock],
  );

  const value = useMemo<NotificationsValue>(
    () => ({ items, unreadCount, toasts, markRead, markAllRead, dismissToast: (id) => setToasts((cur) => cur.filter((x) => x.id !== id)), triggerLocalMock, triggerServerMock }),
    [items, unreadCount, toasts, markRead, markAllRead, triggerLocalMock, triggerServerMock],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotificationsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return v;
}
