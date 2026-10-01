import { Lightbulb, Sparkles, type LucideIcon } from 'lucide-react';
import { Link } from 'wouter';
import { usePreferences } from '@/context/PreferencesContext';
import { fill } from '@/lib/format';
import type { Stats } from '@/lib/types';

export function MetricCard({ icon: Icon, label, value, note, delay = 1, testId }: { icon: LucideIcon; label: string; value: string; note?: string; delay?: number; testId: string }) {
  return (
    <div className={`animate-in delay-${delay} relative overflow-hidden rounded-2xl border border-border bg-card p-5`} data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon size={16} className="text-primary/70" />
      </div>
      <div className="mt-4 flex items-end gap-2">
        <strong className="font-mono text-3xl tracking-[-.08em]">{value}</strong>
        {note && <span className="mb-1 text-[10px] text-muted-foreground">{note}</span>}
      </div>
      <div className="pointer-events-none absolute -bottom-8 -end-5 h-24 w-24 rounded-full border border-primary/10" />
    </div>
  );
}

/** The dedicated Insights summary card in the top metrics row: what the AI last said, and what needs a human look. */
export function InsightsMetricCard({ stats }: { stats: Stats | undefined }) {
  const { t } = usePreferences();
  const ins = stats?.insights;
  const quality = ins?.avg_documentation_quality;
  return (
    <div className="animate-in delay-4 relative overflow-hidden rounded-2xl border border-primary/25 bg-card p-5 sm:col-span-2 xl:col-span-2" data-testid="card-insights-summary">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold text-primary">
          <Sparkles size={14} />
          {t.insightsCard}
        </span>
        {ins?.latest && (
          <Link href={`/experiments/${ins.latest.experiment_id}`} className="text-[11px] font-semibold text-primary hover:underline" data-testid="link-insights-open">
            {t.insightsOpen}
          </Link>
        )}
      </div>
      {ins && ins.experiments_analyzed > 0 && ins.latest ? (
        <div className="mt-3">
          <div className="flex items-end gap-3">
            <strong className="font-mono text-3xl tracking-[-.08em]" data-testid="insights-quality">{quality ?? 0}%</strong>
            <span className="mb-1 text-[10px] text-muted-foreground">{t.insightsQuality}</span>
            {ins.notes_to_review > 0 && <span className="mb-1 ms-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">{fill(t.insightsReview, { n: ins.notes_to_review })}</span>}
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground" data-testid="insights-latest">{ins.latest.summary}</p>
        </div>
      ) : (
        <p className="mt-4 text-xs leading-5 text-muted-foreground" data-testid="insights-empty">{t.insightsNone}</p>
      )}
      <Lightbulb size={64} className="pointer-events-none absolute -bottom-3 -end-2 text-primary/[.06]" />
    </div>
  );
}
