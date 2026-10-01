import { Lightbulb, RefreshCw, Sparkles, Tag } from 'lucide-react';
import { usePreferences } from '@/context/PreferencesContext';
import { useInsights, useRefreshInsights, useUpdateNote } from '@/hooks/queries';
import type { Experiment, Insights } from '@/lib/types';

export function CircularScore({ value }: { value: number }) {
  const radius = 39;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-28 w-28">
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

/** The Insights summary card shown in the top metrics row of an experiment. */
export function InsightsSummaryCard({ experiment }: { experiment: Experiment }) {
  const { t } = usePreferences();
  const q = useInsights(experiment.id);
  const r = q.data?.result;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card p-5 sm:col-span-2" data-testid="card-insights-summary">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold text-primary"><Sparkles size={14} />{t.insightsCard}</span>
        {r && <span className="font-mono text-[10px] text-muted-foreground">{r.documentation_quality.score}% {t.insightsQuality}</span>}
      </div>
      {r ? <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground" dir="auto" data-testid="insights-summary-text">{r.summary}</p> : <p className="mt-3 text-xs leading-5 text-muted-foreground" data-testid="insights-summary-empty">{statusText(q.data, t) ?? t.noInsightsYet}</p>}
    </div>
  );
}

export function OriginalityCard({ experiment }: { experiment: Experiment }) {
  const { t } = usePreferences();
  return (
    <div className="rounded-2xl border border-border bg-card p-5" data-testid="card-originality">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold">{t.originality}</p>
          <p className="mt-1 max-w-[170px] text-xs leading-5 text-muted-foreground">{t.originalitySub}</p>
        </div>
        <Lightbulb size={17} className="text-primary" />
      </div>
      <div className="mt-4 flex items-center gap-4">
        <CircularScore value={experiment.originality} />
        <div>
          <span className="text-sm font-semibold">{experiment.originality > 80 ? t.distinctive : t.promising}</span>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.keepCapturing}</p>
        </div>
      </div>
    </div>
  );
}

export function SimilarCard() {
  const { t } = usePreferences();
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2"><Sparkles size={16} className="text-primary" /><p className="text-xs font-semibold">{t.similar}</p></div>
      <p className="mt-4 text-2xl font-semibold tracking-[-.05em]">{t.lowOverlap}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{t.similarSub}.</p>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-[18%] rounded-full bg-primary" /></div>
    </div>
  );
}

/** The Insights tab: the DeepSeek review of the experiment. Suggestions only; the researcher accepts or ignores them. */
export function InsightsTab({ experiment }: { experiment: Experiment }) {
  const { t } = usePreferences();
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
        <button type="button" disabled={busy || q.data?.ai_configured === false} onClick={() => refresh.mutate()} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold transition hover:border-primary/50 disabled:opacity-50" data-testid="button-refresh-insights">
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
          {t.refreshInsights}
        </button>
      </div>
      {r ? (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 text-primary"><Sparkles size={17} /><h3 className="text-sm font-semibold">{t.signalSummary}</h3></div>
            <p className="mt-4 text-sm leading-7" dir="auto" data-testid="insights-summary">{r.summary}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{t.docQuality}</h3><strong className="font-mono text-xl" data-testid="insights-doc-score">{r.documentation_quality.score}%</strong></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${r.documentation_quality.score}%` }} /></div>
            {r.documentation_quality.strengths.length > 0 && <><p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.strengths}</p><ul className="mt-1 list-disc space-y-1 ps-5 text-xs leading-5" dir="auto">{r.documentation_quality.strengths.map((s) => <li key={s}>{s}</li>)}</ul></>}
            {r.documentation_quality.gaps.length > 0 && <><p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.gaps}</p><ul className="mt-1 list-disc space-y-1 ps-5 text-xs leading-5" dir="auto">{r.documentation_quality.gaps.map((s) => <li key={s}>{s}</li>)}</ul></>}
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{t.novelty}</h3><strong className="font-mono text-xl">{r.novelty.score}</strong></div>
            <p className="mt-3 text-xs leading-5" dir="auto">{r.novelty.rationale}</p>
            <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-[11px] leading-5 text-muted-foreground" dir="auto" data-testid="insights-caveat">{r.novelty.caveat}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 text-primary"><Tag size={17} /><h3 className="text-sm font-semibold">{t.related}</h3></div>
            <div className="mt-4 flex flex-wrap gap-2">{experiment.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">{tag}</span>)}</div>
          </div>
          {r.note_suggestions.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 md:col-span-2" data-testid="insights-suggestions">
              <h3 className="text-sm font-semibold">{t.suggestions}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">{t.suggestionsHint}</p>
              <ul className="mt-4 space-y-3">
                {r.note_suggestions.map((s) => {
                  const n = noteById.get(s.note_id);
                  return (
                    <li key={s.note_id} className="rounded-xl border border-border bg-background p-4 text-xs leading-5" data-testid={`suggestion-${s.note_id}`}>
                      {n && <p className="text-muted-foreground line-through decoration-muted-foreground/40" dir="auto">{n.text}</p>}
                      <p className="mt-1 font-semibold" dir="auto">{s.suggested_text}</p>
                      <p className="mt-1 text-muted-foreground" dir="auto">{s.reason}</p>
                      {n?.can_edit && n.text !== s.suggested_text && (
                        <button type="button" onClick={() => update.mutate({ noteId: s.note_id, text: s.suggested_text })} disabled={update.isPending} className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50" data-testid={`button-use-suggestion-${s.note_id}`}>
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
