import { Sparkles, type LucideIcon } from 'lucide-react';
import { Link } from 'wouter';
import { usePreferences } from '@/context/PreferencesContext';
import { fill } from '@/lib/format';
import type { Stats } from '@/lib/types';

export function MetricCard({ icon: Icon, label, value, note, delay = 1, testId }: { icon: LucideIcon; label: string; value: string; note?: string; delay?: number; testId: string }) {
  return (
    <div className={`animate-in delay-${delay} surface p-5`} data-testid={testId}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={17} /></span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <strong className="font-mono text-4xl font-semibold tracking-[-.04em]">{value}</strong>
        {note && <span className="mb-1.5 text-xs text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}

/** The dedicated Insights summary card in the top metrics row: what the AI last said, and what needs a human look. */
export function InsightsMetricCard({ stats }: { stats: Stats | undefined }) {
  const { t } = usePreferences();
  const ins = stats?.insights;
  const quality = ins?.avg_documentation_quality;
  return (
    <div className="animate-in delay-4 surface relative overflow-hidden !border-primary/25 bg-gradient-to-br from-primary/[.07] to-transparent p-5 sm:col-span-2 xl:col-span-2" data-testid="card-insights-summary">
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
            <strong className="font-mono text-4xl font-semibold tracking-[-.04em]" data-testid="insights-quality">{quality ?? 0}%</strong>
            <span className="mb-1 text-[10px] text-muted-foreground">{t.insightsQuality}</span>
            {ins.notes_to_review > 0 && <span className="mb-1 ms-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">{fill(t.insightsReview, { n: ins.notes_to_review })}</span>}
          </div>
          <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted-foreground" data-testid="insights-latest">{ins.latest.summary}</p>
        </div>
      ) : (
        <p className="mt-4 text-xs leading-5 text-muted-foreground" data-testid="insights-empty">{t.insightsNone}</p>
      )}
      
    </div>
  );
}
