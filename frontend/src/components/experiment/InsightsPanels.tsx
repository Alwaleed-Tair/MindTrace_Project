import { useEffect, useRef } from 'react';
import { ExternalLink, Languages, Lightbulb, RefreshCw, Sparkles } from 'lucide-react';
import { usePreferences } from '@/context/PreferencesContext';
import { useInsights, useRefreshInsights, useTranslateInsights, useUpdateNote } from '@/hooks/queries';
import { fill } from '@/lib/format';
import { toDisplay, toStored } from '@/lib/mentions';
import type { Experiment, Insights, Literature, SimilarPaper } from '@/lib/types';

export function CircularScore({ value }: { value: number }) {
  const radius = 39;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--primary))" strokeLinecap="round" strokeWidth="7" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="font-mono text-2xl tracking-[-.08em]">{value}</strong>
        <span className="text-[9px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function statusText(i: Insights | undefined, t: ReturnType<typeof usePreferences>['t']) {
  if (!i) return null;
  if (i.status === 'queued' || i.status === 'running') return t.generating;
  if (i.status === 'disabled' || (!i.ai_configured && i.status === 'none')) return t.aiOff;
  if (i.status === 'failed') return `${t.aiFailed}: ${i.error ?? ''}`;
  return null;
}

const SIM_STYLE = { high: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', medium: 'bg-primary/12 text-primary', low: 'bg-muted text-muted-foreground' } as const;

/** The closest scholarly papers the originality check found (never more than a handful). */
export function PapersList({ papers }: { papers: SimilarPaper[] }) {
  const { t } = usePreferences();
  const label = { high: t.simHigh, medium: t.simMedium, low: t.simLow };
  return (
    <ul className="mt-3 space-y-2.5" data-testid="similar-papers">
      {papers.map((p) => (
        <li key={p.url || p.title} className="rounded-xl bg-muted/50 p-3.5 text-xs leading-5" data-testid="similar-paper">
          <div className="flex items-start justify-between gap-3">
            {p.url ? (
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 font-semibold text-foreground hover:text-primary" dir="auto">
                <span>{p.title}</span>
                <ExternalLink size={12} className="mt-1 shrink-0" />
              </a>
            ) : <span className="font-semibold" dir="auto">{p.title}</span>}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${SIM_STYLE[p.similarity]}`}>{label[p.similarity]}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground" dir="ltr">{[p.authors.join(', '), p.year, p.venue || p.source].filter(Boolean).join(' · ')}</p>
          {p.why && <p className="mt-1.5 text-muted-foreground" dir="auto">{p.why}</p>}
        </li>
      ))}
    </ul>
  );
}

function literatureNote(lit: Literature | undefined, t: ReturnType<typeof usePreferences>['t']) {
  if (!lit) return t.origNotYet;
  if (lit.status === 'ok') return lit.sources?.length ? fill(t.origSearched, { sources: lit.sources.join(', ') }) : '';
  if (lit.status === 'unavailable' || lit.status === 'failed') return t.origUnavailable;
  return t.origNotYet;
}

/** The originality estimate: a score plus the closest published papers it was compared with. */
export function OriginalityCard({ experiment }: { experiment: Experiment }) {
  const { t } = usePreferences();
  const q = useInsights(experiment.id);
  const lit = q.data?.result?.literature;
  const hasLit = lit?.status === 'ok';
  const score = hasLit ? lit!.score ?? experiment.originality : experiment.originality;
  const papers = hasLit ? lit!.similar ?? [] : [];
  return (
    <section className="surface p-5" data-testid="card-originality">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t.origTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t.origSub}</p>
        </div>
        <Lightbulb size={16} className="text-primary" />
      </div>
      {hasLit || experiment.ai_status === 'done' ? (
        <>
          <div className="mt-4 flex justify-center"><CircularScore value={score} /></div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground" data-testid="originality-scale">{t.origScale}</p>
        </>
      ) : (
        // no score before an analysis: the stored default (50) is not a real estimate
        <p className="mt-4 rounded-xl bg-muted/60 px-3 py-3 text-center text-sm font-semibold text-muted-foreground" data-testid="originality-pending">{t.notAnalyzed}</p>
      )}
      <p className="mt-4 text-xs leading-6 text-muted-foreground" dir="auto" data-testid="originality-rationale">{hasLit ? lit!.rationale : literatureNote(lit, t)}</p>
      {hasLit && (
        <>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.origSimilar}</p>
          {papers.length ? <PapersList papers={papers} /> : <p className="mt-2 text-xs text-muted-foreground" data-testid="no-similar-papers">{t.origNone}</p>}
          <p className="mt-3 text-[11px] text-muted-foreground">{literatureNote(lit, t)}</p>
        </>
      )}
    </section>
  );
}

/** The Insights tab: the DeepSeek review of the experiment. Suggestions only; the researcher accepts or ignores them. */
export function InsightsTab({ experiment, translate }: { experiment: Experiment; translate: ReturnType<typeof useTranslateInsights> }) {
  const { t, language } = usePreferences();
  const q = useInsights(experiment.id);
  const refresh = useRefreshInsights(experiment.id);
  const update = useUpdateNote(experiment.id);
  const r = q.data?.result;
  const busy = q.data?.status === 'queued' || q.data?.status === 'running' || refresh.isPending;
  const noteById = new Map((experiment.notes ?? []).map((n) => [n.id, n]));
  const info = statusText(q.data, t);

  return (
    <div className="mt-7 space-y-5" data-testid="panel-insights">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" data-testid="insights-status">{info ?? (r?.meta ? `${r.meta.provider} · ${r.meta.model}` : '')}</p>
        <button type="button" disabled={busy || q.data?.ai_configured === false} onClick={() => refresh.mutate(language)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold transition hover:border-primary/50 disabled:opacity-50" data-testid="button-refresh-insights">
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
          {t.refreshInsights}
        </button>
      </div>
      {r && q.data?.needs_translation && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs" data-testid="translate-banner">
          <span className="text-muted-foreground">{translate.isError ? t.translateFailed : t.translating}</span>
          {translate.isError && (
            <button type="button" onClick={() => translate.mutate(language)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground" data-testid="button-translate-insights">
              <Languages size={13} />
              {t.translateNow}
            </button>
          )}
        </div>
      )}
      {r ? (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="surface p-6 md:col-span-2">
            <div className="flex items-center gap-2 text-primary"><Sparkles size={17} /><h3 className="text-sm font-semibold">{t.signalSummary}</h3></div>
            <p className="mt-4 whitespace-pre-line text-sm leading-7" dir="auto" data-testid="insights-summary">{r.summary}</p>
            {(r.ignored_note_ids?.length ?? 0) > 0 && <p className="mt-3 text-[11px] text-muted-foreground" data-testid="insights-ignored">{fill(t.ignoredCount, { n: r.ignored_note_ids!.length })}</p>}
            {(r.key_points?.length ?? 0) > 0 && <><p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.keyPoints}</p><ul className="mt-1 list-disc space-y-1 ps-5 text-xs leading-6" dir="auto" data-testid="insights-key-points">{r.key_points!.map((s) => <li key={s}>{s}</li>)}</ul></>}
            {(r.next_steps?.length ?? 0) > 0 && <><p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.nextSteps}</p><ul className="mt-1 list-disc space-y-1 ps-5 text-xs leading-6" dir="auto" data-testid="insights-next-steps">{r.next_steps!.map((s) => <li key={s}>{s}</li>)}</ul></>}
          </div>
          <div className="surface p-6">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{t.docQuality}</h3><strong className="font-mono text-xl" data-testid="insights-doc-score">{r.documentation_quality.score}%</strong></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${r.documentation_quality.score}%` }} /></div>
            {r.documentation_quality.strengths.length > 0 && <><p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.strengths}</p><ul className="mt-1 list-disc space-y-1 ps-5 text-xs leading-5" dir="auto">{r.documentation_quality.strengths.map((s) => <li key={s}>{s}</li>)}</ul></>}
            {r.documentation_quality.gaps.length > 0 && <><p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.gaps}</p><ul className="mt-1 list-disc space-y-1 ps-5 text-xs leading-5" dir="auto">{r.documentation_quality.gaps.map((s) => <li key={s}>{s}</li>)}</ul></>}
          </div>
          <div className="surface p-6" data-testid="insights-originality">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{t.origTitle}</h3><strong className="font-mono text-xl" data-testid="insights-originality-score">{r.literature?.status === 'ok' ? r.literature.score : r.novelty.score}</strong></div>
            <p className="mt-1 text-[11px] text-muted-foreground">{t.origScale}</p>
            <p className="mt-3 text-xs leading-6" dir="auto">{r.literature?.status === 'ok' ? r.literature.rationale : r.novelty.rationale}</p>
            {r.literature?.status === 'ok' && (
              <>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.origSimilar}</p>
                {(r.literature.similar?.length ?? 0) > 0 ? <PapersList papers={r.literature.similar!} /> : <p className="mt-2 text-xs text-muted-foreground">{t.origNone}</p>}
              </>
            )}
            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-[11px] leading-5 text-muted-foreground" dir="auto" data-testid="insights-caveat">{r.literature?.status === 'ok' ? `${literatureNote(r.literature, t)} · ${r.literature.caveat ?? ''}` : `${r.novelty.caveat} ${literatureNote(r.literature, t)}`}</p>
          </div>
          {r.note_suggestions.length > 0 && (
            <div className="surface p-6 md:col-span-2" data-testid="insights-suggestions">
              <h3 className="text-sm font-semibold">{t.suggestions}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">{t.suggestionsHint}</p>
              <ul className="mt-4 space-y-3">
                {r.note_suggestions.map((s) => {
                  const n = noteById.get(s.note_id);
                  return (
                    <li key={s.note_id} className="rounded-xl border border-border bg-background p-4 text-xs leading-5" data-testid={`suggestion-${s.note_id}`}>
                      {n && <p className="text-muted-foreground line-through decoration-muted-foreground/40" dir="auto">{toDisplay(n.text, n.mentions ?? [])}</p>}
                      <p className="mt-1 font-semibold" dir="auto">{s.suggested_text}</p>
                      <p className="mt-1 text-muted-foreground" dir="auto">{s.reason}</p>
                      {n?.can_edit && toDisplay(n.text, n.mentions ?? []) !== s.suggested_text && (
                        <button type="button" onClick={() => update.mutate({ noteId: s.note_id, text: toStored(s.suggested_text, n.mentions ?? []) })} disabled={update.isPending} className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50" data-testid={`button-use-suggestion-${s.note_id}`}>
                          {t.useThis}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/70 px-6 py-14 text-center text-xs text-muted-foreground" data-testid="insights-empty-panel">{info ?? t.noInsightsYet}</div>
      )}
    </div>
  );
}

/** When the interface language differs from the analysis' language, translate it once (one short call, then kept on the server).
 *  Switching back and forth afterwards is free. A failed attempt is not repeated by itself: the banner offers a retry. */
export function useAutoTranslate(experimentId: string) {
  const { language } = usePreferences();
  const q = useInsights(experimentId);
  const translate = useTranslateInsights(experimentId);
  const tried = useRef<string | null>(null);
  const want = q.data?.status === 'done' && q.data.ai_configured && q.data.needs_translation;
  useEffect(() => {
    if (!want || translate.isPending) return;
    const key = `${language}|${q.data?.updated_at}`;
    if (tried.current === key) return;
    tried.current = key;
    translate.mutate(language);
  }, [want, language, q.data?.updated_at, translate]);
  return translate;
}
