import type { LucideIcon } from 'lucide-react';

/** One figure in the stats strip at the top of the dashboard. */
export function MetricCard({ icon: Icon, label, value, note, delay = 1, testId, tone = 'default' }: { icon: LucideIcon; label: string; value: string; note?: string; delay?: number; testId: string; tone?: 'default' | 'warn' }) {
  return (
    <div className={`animate-in delay-${delay} surface flex flex-col gap-3 p-4`} data-testid={testId}>
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon size={15} className={tone === 'warn' ? 'text-kind-dec' : 'text-primary'} />
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <strong className="font-mono text-[28px] font-semibold leading-none tracking-[-.03em]">{value}</strong>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}
