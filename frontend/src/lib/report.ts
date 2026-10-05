import { translations, type Strings } from './i18n';
import { fill } from './format';
import type { Experiment, Insights, Language, NoteKind, Person, SimilarPaper, Status } from './types';

/** Everything the PDF page and the Word file show, already translated and formatted, so both exports always say the same thing. */
export interface ReportNote {
  id: number;
  kind: NoteKind;
  kindLabel: string;
  text: string;
  date: string;
  time: string;
  /** Position in the recording ("00:04:12"), for notes that came from a recorded session. */
  timeLabel: string | null;
  author: string | null;
  fromRecording: boolean;
  needsReview: boolean;
}

export interface ReportAi {
  summary: string;
  keyPoints: string[];
  nextSteps: string[];
  docScore: number;
  strengths: string[];
  gaps: string[];
  originalityRationale: string;
  papers: SimilarPaper[];
  by: string;
}

export interface ReportModel {
  language: Language;
  dir: 'ltr' | 'rtl';
  t: Strings;
  code: string;
  title: string;
  summary: string;
  status: Status;
  statusLabel: string;
  tags: string[];
  owner: Person;
  collaborators: Person[];
  started: string;
  updated: string;
  duration: string;
  noteCount: number;
  kindCounts: Record<NoteKind, number>;
  /** null until the experiment has really been analyzed: a default value is never shown as a score. */
  originality: number | null;
  ai: ReportAi | null;
  notes: ReportNote[];
  exportedOn: string;
  /** Without extension. Also used as the page title, which browsers suggest as the PDF file name. */
  fileName: string;
}

export const KIND_ORDER: NoteKind[] = ['observation', 'decision'];

/** Brand colors shared by both exports (hex, without the #, as Word wants them). */
export const BRAND = {
  primary: '1F897F',
  primarySoft: 'E8F5F3',
  ink: '1A2330',
  muted: '5C6878',
  line: 'E2E7EE',
  panel: 'F5F7FA',
  kind: { observation: '1F897F', decision: 'C27C0E' } as Record<NoteKind, string>,
  kindSoft: { observation: 'E8F5F3', decision: 'FBF2E3' } as Record<NoteKind, string>,
};

const locale = (l: Language) => (l === 'ar' ? 'ar' : 'en');

function dateText(iso: string, language: Language) {
  return new Intl.DateTimeFormat(locale(language), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

function timeText(iso: string, language: Language) {
  return new Intl.DateTimeFormat(locale(language), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function kindLabel(kind: NoteKind, t: Strings) {
  return kind === 'decision' ? t.kindDecision : t.kindObservation;
}

function statusLabel(status: Status, t: Strings) {
  return status === 'Paused' ? t.paused : status === 'Completed' ? t.completed : t.active;
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[\s.]+$/, '');
}

/** In Arabic, mark the " · " separators as right-to-left so English names between them keep their place (works in the PDF and in Word). */
function rtlSafe(s: string, language: Language) {
  return language === 'ar' ? s.split(' · ').join(' \u200F·\u200F ') : s;
}

export function buildReport(e: Experiment, insights: Insights | null | undefined, language: Language, now = new Date()): ReportModel {
  const t = translations[language];
  const notes = e.notes ?? [];
  const kindCounts: Record<NoteKind, number> = { observation: 0, decision: 0 };
  notes.forEach((n) => (kindCounts[n.kind] = (kindCounts[n.kind] ?? 0) + 1));

  const r = insights?.result ?? null;
  const litOk = r?.literature?.status === 'ok';
  const ai: ReportAi | null = r
    ? {
        summary: r.summary,
        keyPoints: r.key_points ?? [],
        nextSteps: r.next_steps ?? [],
        docScore: r.documentation_quality.score,
        strengths: r.documentation_quality.strengths,
        gaps: r.documentation_quality.gaps,
        originalityRationale: (litOk ? r.literature!.rationale : r.novelty.rationale) ?? '',
        papers: litOk ? r.literature!.similar ?? [] : [],
        by: r.meta ? rtlSafe(fill(t.reportAiBy, { provider: r.meta.provider, model: r.meta.model, date: dateText(r.meta.generated_at, language) }), language) : '',
      }
    : null;
  const originality = r ? (litOk ? r.literature!.score ?? r.novelty.score : r.novelty.score) : null;

  return {
    language,
    dir: language === 'ar' ? 'rtl' : 'ltr',
    t,
    code: e.code,
    title: e.title,
    summary: e.summary,
    status: e.status,
    statusLabel: statusLabel(e.status, t),
    tags: e.tags,
    owner: e.owner,
    collaborators: e.collaborators,
    started: dateText(e.created_at, language),
    updated: dateText(e.updated_at, language),
    duration: e.duration,
    noteCount: notes.length,
    kindCounts,
    originality,
    ai,
    notes: notes.map((n) => ({
      id: n.id,
      kind: n.kind,
      kindLabel: kindLabel(n.kind, t),
      text: n.text,
      date: dateText(n.created_at, language),
      time: timeText(n.created_at, language),
      timeLabel: n.time_label,
      author: n.author?.name ?? null,
      fromRecording: n.source === 'recording',
      needsReview: n.asr?.needs_review === true,
    })),
    exportedOn: fill(t.reportExportedOn, { date: dateText(now.toISOString(), language) }),
    fileName: safeName(`MindTrace - ${e.code} - ${e.title}`) || 'MindTrace report',
  };
}

// The PDF button opens the report page and asks it to print once it is ready. Kept in memory (not in the URL),
// so reloading or sharing the report page never pops a print window by surprise.
let pendingPrint: string | null = null;
export function requestPrint(id: string) {
  pendingPrint = id;
}
export function takePrintRequest(id: string): boolean {
  const yes = pendingPrint === id;
  if (yes) pendingPrint = null;
  return yes;
}
