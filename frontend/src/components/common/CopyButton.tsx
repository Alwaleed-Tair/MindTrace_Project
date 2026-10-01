import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '@/context/PreferencesContext';

/** Copies `value` to the clipboard (with a fallback for pages where the Clipboard API is blocked) and says so for 2 seconds. */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the old way */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ value, label, testId = 'button-copy' }: { value: string; label?: string; testId?: string }) {
  const { t } = usePreferences();
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onClick = async () => {
    if (await copyText(value)) {
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 2000);
    }
  };
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground" data-testid={testId}>
      {done ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
      <span aria-live="polite">{done ? t.copied : (label ?? t.copyId)}</span>
    </button>
  );
}
