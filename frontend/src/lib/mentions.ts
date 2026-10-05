import type { Person } from './types';

/** A mention is stored in the note as @{MT-XXXXXXXX} so a rename never breaks it; people type and read it as @Name. */
const TOKEN = /@\{(MT-[A-Z0-9]{8})\}/g;

type Who = Pick<Person, 'id' | 'name'>;

const byId = (people: Who[]) => new Map(people.map((p) => [p.id, p]));

/** Stored text -> what the textarea shows (@Name). Unknown ids stay as they are. */
export function toDisplay(text: string, people: Who[]): string {
  const map = byId(people);
  return text.replace(TOKEN, (all, id: string) => (map.has(id) ? `@${map.get(id)!.name}` : all));
}

/** Text from the textarea -> stored text. Longest names first, so "@Noor Ali" wins over "@Noor". */
export function toStored(text: string, people: Who[]): string {
  const sorted = [...people].filter((p) => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  let out = '';
  let i = 0;
  while (i < text.length) {
    const startOk = text[i] === '@' && (i === 0 || /\s|[(\[«"']/.test(text[i - 1]));
    const hit = startOk && sorted.find((p) => text.startsWith(p.name, i + 1) && !/[\p{L}\p{N}_]/u.test(text[i + 1 + p.name.length] ?? ''));
    if (hit) {
      out += `@{${hit.id}}`;
      i += 1 + hit.name.length;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

export type Segment = { text: string } | { person: Who };

/** Split stored text into plain parts and mentions, for showing chips. */
export function segments(text: string, people: Who[]): Segment[] {
  const map = byId(people);
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const p = map.get(m[1]);
    if (!p) continue;
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ person: p });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The "@query" being typed just before the caret, or null. */
export function activeQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0 || (at > 0 && !/\s|[(\[«"']/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || /[\n@]/.test(query) || /\s\s/.test(query)) return null;
  return { start: at, query };
}
