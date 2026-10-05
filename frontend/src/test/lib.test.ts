import { describe, expect, it } from 'vitest';
import { activeQuery, segments, toDisplay, toStored } from '@/lib/mentions';
import { fill, greetingName, relativeTime } from '@/lib/format';
import { translations } from '@/lib/i18n';
import { notificationText } from '@/lib/notifications';
import { lina, note } from './utils';

describe('i18n', () => {
  it('Arabic and English have exactly the same keys, none empty', () => {
    const en = Object.keys(translations.en).sort();
    expect(Object.keys(translations.ar).sort()).toEqual(en);
    for (const k of en) {
      expect(translations.en[k as keyof typeof translations.en], k).not.toBe('');
      expect(translations.ar[k as keyof typeof translations.ar], k).not.toBe('');
    }
  });
  it('placeholders match between languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(translations.en) as (keyof typeof translations.en)[]) expect(ph(translations.ar[k]), k).toBe(ph(translations.en[k]));
  });
});

describe('format', () => {
  it('fills placeholders', () => expect(fill('{a} and {b} {a}', { a: 'x', b: 2 })).toBe('x and 2 x'));
  it('greeting name keeps a title', () => {
    expect(greetingName('Dr. Noor Rahman')).toBe('Dr. Noor');
    expect(greetingName('Omar Khalid')).toBe('Omar');
    expect(greetingName('')).toBe('');
  });
  it('relative time', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 5_000).toISOString(), 'en', now)).toBe('Just now');
    expect(relativeTime(new Date(now - 12 * 60_000).toISOString(), 'en', now)).toBe('12 minutes ago');
    expect(relativeTime(new Date(now - 5 * 3600_000).toISOString(), 'en', now)).toBe('5 hours ago');
  });
});

describe('notification text', () => {
  it('is composed per kind in the current language', () => {
    expect(notificationText(note({ kind: 'note_updated' }), translations.en)).toBe('Dr. Lina Haddad updated a note in Ambient temperature');
    expect(notificationText(note({ kind: 'status_changed', actor: lina }), translations.ar)).toContain('Dr. Lina Haddad');
  });
});

import { greetingName as gn } from '@/lib/format';
describe('greeting name keeps the title with the first name', () => {
  it('English and Arabic titles', () => {
    expect(gn('Dr. Noor Rahman')).toBe('Dr. Noor');
    expect(gn('د. وليد الطير')).toBe('د. وليد');
    expect(gn('وليد الطير')).toBe('وليد');
  });
});

describe('mentions', () => {
  const noor = { id: 'MT-AAAA1111', name: 'Noor' };
  const noorAli = { id: 'MT-BBBB2222', name: 'Noor Ali' };
  const waleed = { id: 'MT-CCCC3333', name: 'د. وليد' };
  const people = [noor, noorAli, waleed];

  it('stores @Name as the id and shows it back as @Name', () => {
    const typed = '@Noor Ali check it, @Noor too. cc @د. وليد';
    const stored = toStored(typed, people);
    expect(stored).toBe('@{MT-BBBB2222} check it, @{MT-AAAA1111} too. cc @{MT-CCCC3333}');
    expect(toDisplay(stored, people)).toBe(typed);
  });

  it('leaves emails, partial names and unknown ids alone', () => {
    expect(toStored('mail a@Noor.com or @Noorah', people)).toBe('mail a@Noor.com or @Noorah');
    expect(toDisplay('@{MT-ZZZZ9999} hi', people)).toBe('@{MT-ZZZZ9999} hi');
  });

  it('splits text into chips', () => {
    expect(segments('hi @{MT-AAAA1111}!', people)).toEqual([{ text: 'hi ' }, { person: noor }, { text: '!' }]);
  });

  it('finds the @query before the caret', () => {
    expect(activeQuery('hello @No', 9)).toEqual({ start: 6, query: 'No' });
    expect(activeQuery('a@No', 4)).toBeNull();
    expect(activeQuery('@\nx', 3)).toBeNull();
    expect(activeQuery('@Noor Ali', 9)).toEqual({ start: 0, query: 'Noor Ali' });
  });
});
