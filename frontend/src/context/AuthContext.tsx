import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Person } from '@/lib/types';

type Status = 'loading' | 'authed' | 'anon' | 'offline';

interface AuthValue {
  user: Person | null;
  status: Status;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (name: string, email: string, password: string, lab: string) => Promise<void>;
  demo: () => Promise<void>;
  logout: () => Promise<void>;
  recheck: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<Person | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const recheck = useCallback(async () => {
    try {
      const r = await api.me();
      setUser(r.user);
      setStatus('authed');
    } catch (e) {
      setUser(null);
      setStatus(e instanceof ApiError && e.isNetwork ? 'offline' : 'anon');
    }
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  const enter = useCallback(
    (u: Person) => {
      qc.clear(); // never show the previous person's data
      setUser(u);
      setStatus('authed');
    },
    [qc],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user,
      status,
      recheck,
      login: async (email, password, remember) => enter((await api.login(email, password, remember)).user),
      register: async (name, email, password, lab) => enter((await api.register(name, email, password, lab)).user),
      demo: async () => enter((await api.demo()).user),
      logout: async () => {
        try {
          await api.logout();
        } finally {
          qc.clear();
          setUser(null);
          setStatus('anon');
        }
      },
    }),
    [user, status, recheck, enter, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
