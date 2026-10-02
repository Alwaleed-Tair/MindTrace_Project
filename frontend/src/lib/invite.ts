/** Team invite links: build one to share, read the code back out of a pasted link, and keep it across a sign-in. */
const KEY = 'mindtrace.pendingInvite';

export function inviteUrl(token: string): string {
  const { origin, pathname, hash } = window.location;
  return hash.startsWith('#/') ? `${origin}${pathname}#/join/${token}` : `${origin}/join/${token}`;
}

/** Accepts the whole link or just the code. */
export function parseInvite(input: string): string {
  const v = input.trim();
  const m = v.match(/join\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : v.replace(/[^A-Za-z0-9_-]/g, '');
}

export function savePendingInvite(token: string) {
  try { window.sessionStorage.setItem(KEY, token); } catch { /* ignore */ }
}

export function takePendingInvite(): string | null {
  try {
    const v = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

/** Read without clearing (safe during render); the join page clears it. */
export function peekPendingInvite(): string | null {
  try { return window.sessionStorage.getItem(KEY); } catch { return null; }
}
