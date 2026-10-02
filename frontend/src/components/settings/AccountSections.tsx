import { LockKeyhole, Pencil, Trash2, UserRound } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useLocation } from 'wouter';
import { Avatar } from '@/components/common/Avatar';
import { CopyButton } from '@/components/common/CopyButton';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { api, ApiError } from '@/lib/api';
import type { Person } from '@/lib/types';

const inputClass = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary';
const primaryBtn = 'rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-50';
const ghostBtn = 'rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold transition hover:border-primary/50';

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold">{label}</span>
      {children}
    </label>
  );
}

const message = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

/** Name and lab, editable in place. The e-mail address is the login and the ID is what others use to add you. */
export function ProfileSection({ user }: { user: Person }) {
  const { t } = usePreferences();
  const { updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [lab, setLab] = useState(user.lab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      updateUser((await api.updateProfile({ name, lab })).user);
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-4 border-b border-border p-5 sm:p-7" data-testid="settings-profile">
      <Avatar person={user} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{t.profile}</h2>
          {!editing && (
            <button type="button" onClick={() => { setName(user.name); setLab(user.lab); setEditing(true); setSaved(false); }} className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground" data-testid="button-edit-profile">
              <Pencil size={12} />
              {t.editProfile}
            </button>
          )}
        </div>
        {editing ? (
          <form onSubmit={(e) => void save(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Labeled label={t.name}>
              <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} data-testid="input-profile-name" />
            </Labeled>
            <Labeled label={t.lab}>
              <input maxLength={80} value={lab} onChange={(e) => setLab(e.target.value)} className={inputClass} data-testid="input-profile-lab" />
            </Labeled>
            {error && <p className="text-xs font-semibold text-destructive sm:col-span-2" role="alert" data-testid="profile-error">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={busy || !name.trim()} className={primaryBtn} data-testid="button-save-profile">{busy ? t.saving : t.save}</button>
              <button type="button" onClick={() => setEditing(false)} className={ghostBtn}>{t.cancel}</button>
            </div>
          </form>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="profile-name-lab">{user.name}{user.lab ? ` · ${user.lab}` : ''}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            {saved && <p className="mt-1 text-xs font-semibold text-primary" role="status">{t.saved} ✓</p>}
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-muted px-2.5 py-1.5 font-mono text-xs tracking-wider" dir="ltr" data-testid="settings-user-id">{user.id}</code>
          <CopyButton value={user.id} testId="button-copy-user-id-settings" />
        </div>
      </div>
    </div>
  );
}

/** Change the password (current one required); other browsers are signed out by the server. */
export function PasswordSection() {
  const { t } = usePreferences();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next.length < 8) return setError(t.passwordTooShort);
    if (next !== confirm) return setError(t.passwordsDiffer);
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-border p-5 sm:p-7" data-testid="settings-password">
      <div className="flex items-center gap-3">
        <LockKeyhole size={17} className="text-primary" />
        <div>
          <h2 className="text-sm font-semibold">{t.security}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.securitySub}</p>
        </div>
      </div>
      <form onSubmit={(e) => void submit(e)} className="mt-5 grid gap-3 sm:grid-cols-3">
        <Labeled label={t.currentPassword}>
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} dir="ltr" data-testid="input-current-password" />
        </Labeled>
        <Labeled label={t.newPassword}>
          <input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} dir="ltr" data-testid="input-change-new-password" />
        </Labeled>
        <Labeled label={t.confirmPassword}>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} dir="ltr" data-testid="input-change-confirm-password" />
        </Labeled>
        {error && <p className="text-xs font-semibold text-destructive sm:col-span-3" role="alert" data-testid="password-error">{error}</p>}
        {done && <p className="text-xs font-semibold text-primary sm:col-span-3" role="status" data-testid="password-changed">{t.passwordChanged}</p>}
        <div className="sm:col-span-3">
          <button type="submit" disabled={busy || !current || !next} className={primaryBtn} data-testid="button-change-password">{busy ? t.saving : t.changePassword}</button>
        </div>
      </form>
    </div>
  );
}

/** Delete the account for good, after typing the password. */
export function DeleteAccountSection() {
  const { t, dir } = usePreferences();
  const { signedOut } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password);
      setOpen(false);
      signedOut();
      navigate('/', { replace: true });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-border p-5 sm:p-7" data-testid="settings-delete-account">
      <div className="flex items-start gap-3">
        <UserRound size={17} className="mt-0.5 text-destructive" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{t.dangerZone}</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{t.dangerSub}</p>
        </div>
      </div>
      <button type="button" onClick={() => { setPassword(''); setError(null); setOpen(true); }} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-xs font-semibold text-destructive transition hover:bg-destructive/8" data-testid="button-delete-account">
        <Trash2 size={13} />
        {t.deleteAccount}
      </button>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent dir={dir} className="max-w-md rounded-3xl border-border bg-card p-6 text-card-foreground shadow-2xl sm:p-7" data-testid="dialog-delete-account">
          <DialogTitle className="text-lg font-semibold">{t.deleteAccountTitle}</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-muted-foreground">{t.dangerSub}</DialogDescription>
          <form onSubmit={(e) => void confirm(e)} className="mt-2 space-y-4">
            <Labeled label={t.deleteAccountPassword}>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} dir="ltr" data-testid="input-delete-account-password" />
            </Labeled>
            {error && <p className="text-xs font-semibold text-destructive" role="alert" data-testid="delete-account-error">{error}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted">{t.cancel}</button>
              <button type="submit" disabled={busy || !password} className="rounded-xl bg-destructive px-5 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-50" data-testid="button-confirm-delete-account">{busy ? t.deleting : t.deleteAccountConfirm}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
