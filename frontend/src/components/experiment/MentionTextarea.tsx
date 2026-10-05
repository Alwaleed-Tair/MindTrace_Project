import { useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { usePreferences } from '@/context/PreferencesContext';
import { activeQuery } from '@/lib/mentions';
import type { Person } from '@/lib/types';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onValue: (value: string) => void;
  members: Person[];
};

/** A textarea where typing @ opens a list of the experiment's people. Arrows move, Enter/Tab picks, Esc closes. */
export function MentionTextarea({ value, onValue, members, onKeyDown, className, ...rest }: Props) {
  const { t } = usePreferences();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [q, setQ] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const needle = q?.query.trim().toLowerCase() ?? '';
  const matches = q ? members.filter((m) => m.name.toLowerCase().includes(needle) || m.id.toLowerCase().includes(needle)).slice(0, 6) : [];
  // after a space with no match the person has moved on (e.g. kept typing after picking a name): close the list
  const open = !!q && members.length > 0 && (matches.length > 0 || !q.query.includes(' '));

  const look = (text: string, caret: number) => {
    const next = activeQuery(text, caret);
    setQ(next);
    if (!next || next.query !== q?.query) setActive(0);
  };
  const pick = (p: Person) => {
    if (!q) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const insert = `@${p.name} `;
    const next = value.slice(0, q.start) + insert + value.slice(caret).replace(/^ /, '');
    onValue(next);
    setQ(null);
    const pos = q.start + insert.length;
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  };
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return; }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); pick(matches[Math.min(active, matches.length - 1)]); return; }
    }
    if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQ(null); return; }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => { onValue(e.target.value); look(e.target.value, e.target.selectionStart); }}
        onKeyDown={keys}
        onKeyUp={(e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) look(e.currentTarget.value, e.currentTarget.selectionStart); }}
        onClick={(e) => look(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQ(null), 150)}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-xl border border-border bg-popover p-1 text-sm shadow-lg" data-testid="mention-list">
          {matches.length ? matches.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start ${i === active ? 'bg-primary/10 text-foreground' : 'text-foreground/80'}`}
                data-testid={`mention-option-${m.id}`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{m.initials}</span>
                <span className="truncate" dir="auto">{m.name}</span>
                {m.lab && <span className="ms-auto truncate text-[11px] text-muted-foreground" dir="auto">{m.lab}</span>}
              </button>
            </li>
          )) : <li className="px-2 py-1.5 text-xs text-muted-foreground" data-testid="mention-none">{t.mentionNone}</li>}
        </ul>
      )}
    </div>
  );
}
