import type { Language } from './types';

const locale = (l: Language) => (l === 'ar' ? 'ar' : 'en');

export function relativeTime(iso: string, language: Language, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(language), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 45) return language === 'ar' ? 'الآن' : 'Just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Intl.DateTimeFormat(locale(language), { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(iso));
}

export function clockTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(locale(language), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function longDate(language: Language, now = new Date()): string {
  return new Intl.DateTimeFormat(locale(language), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
}

export function greetingKey(now = new Date()): 'goodMorning' | 'goodAfternoon' | 'goodEvening' {
  const h = now.getHours();
  return h < 12 ? 'goodMorning' : h < 18 ? 'goodAfternoon' : 'goodEvening';
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
}

/** "Dr. Noor Rahman" -> "Dr. Noor"; "Omar Khalid" -> "Omar". */
export function greetingName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return /^(dr|prof|د|أ\.?د|م)\.?$/i.test(parts[0]) && parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0];   // Dr. Noor / د. وليد
}
