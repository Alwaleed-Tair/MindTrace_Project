import { describe, expect, it } from 'vitest';
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
