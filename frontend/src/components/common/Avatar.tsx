import type { Person } from '@/lib/types';

const tones = ['bg-primary/15 text-primary', 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300', 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'];

function toneOf(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return tones[h % tones.length];
}

export function Avatar({ person, size = 32, ring = false }: { person: Pick<Person, 'id' | 'name' | 'initials'>; size?: number; ring?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${toneOf(person.id)} ${ring ? 'ring-2 ring-card' : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      title={person.name}
      aria-label={person.name}
    >
      {person.initials}
    </span>
  );
}
