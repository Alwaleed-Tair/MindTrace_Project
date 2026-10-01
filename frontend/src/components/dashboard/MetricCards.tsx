import type { LucideIcon } from 'lucide-react';

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
