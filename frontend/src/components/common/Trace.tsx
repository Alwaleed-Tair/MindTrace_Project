import type { NoteKind } from '@/lib/types';

/** One note on the trace: where it sits (0..1 along the experiment) and its kind. */
export interface TracePoint {
  id?: number;
  pos: number;
  kind: NoteKind;
  label?: string;
}

export const KIND_VAR: Record<NoteKind, string> = { observation: '--kind-obs' };
export const kindColor = (k: NoteKind) => `hsl(var(${KIND_VAR[k] ?? '--kind-obs'}))`;

const toSeconds = (label: string) => label.split(':').reduce((a, x) => a * 60 + Number(x), 0);

/** Keeps every note visible: notes written at the same moment are nudged apart (in order) instead of stacking on one dot. */
function spread(pos: number[], gap = 0.025): number[] {
  if (pos.length < 2) return pos;
  const order = pos.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = new Array<number>(pos.length);
  let last = -Infinity;
  for (const [p, i] of order) {
    last = Math.max(p, last + gap);
    out[i] = last;
  }
  const max = Math.max(...out);
  return max > 1 ? out.map((x) => x / max) : out;
}

/** Whether every note has a time inside the recording (then the trace follows the recording clock). */
export const usesRecordingClock = (marks: { time_label: string | null }[]) => marks.length > 0 && marks.every((m) => !!m.time_label && Number.isFinite(toSeconds(m.time_label)));

/** Where each note sits along the experiment: by its position in the recording when every note has one,
 *  otherwise by when it was written. A single note sits in the middle. */
export function tracePositions(marks: { at: string; time_label: string | null }[], durationSec = 0): number[] {
  if (!marks.length) return [];
  if (marks.length === 1) return [0.5];
  if (usesRecordingClock(marks)) {
    const labels = marks.map((m) => toSeconds(m.time_label as string));
    const end = Math.max(durationSec, ...labels, 1);
    return spread(labels.map((x) => Math.min(1, Math.max(0, x / end))));
  }
  const times = marks.map((m) => new Date(m.at).getTime());
  const first = Math.min(...times);
  const span = Math.max(...times) - first;
  return spread(span > 0 ? times.map((x) => (x - first) / span) : times.map((_, i) => i / (times.length - 1)));
}

/** How busy each part of the experiment was: a smooth curve built from where the notes are (not a fake waveform). */
function density(points: TracePoint[], bins: number): number[] {
  const out = Array.from({ length: bins }, (_, i) => {
    const x = i / (bins - 1);
    return points.reduce((sum, p) => sum + Math.exp(-((x - p.pos) ** 2) / (2 * 0.05 ** 2)), 0);
  });
  const max = Math.max(1, ...out);
  return out.map((v) => v / max);
}

/** The small trace drawn on experiment cards: activity curve plus one dot per note, colored by kind. */
export function TraceLine({ points, height = 52, testId }: { points: TracePoint[]; height?: number; testId?: string }) {
  const W = 300;
  const pad = 8;
  const curve = density(points, 48)
    .map((v, i) => `${(i / 47) * W},${(height - pad - v * (height - 2 * pad)).toFixed(1)}`)
    .join(' ');
  return (
    <div dir="ltr" className="relative rounded-xl bg-muted/60" style={{ height }} data-testid={testId} data-points={points.length}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true" className="absolute inset-0">
        <polyline points={curve} fill="none" stroke="hsl(var(--muted-foreground) / .45)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map((p, i) => (
        <span
          key={p.id ?? i}
          className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full border-[2.5px] bg-card"
          style={{ left: `${3 + p.pos * 94}%`, top: height / 2 - 5, borderColor: kindColor(p.kind) }}
        />
      ))}
    </div>
  );
}

/** The large trace at the top of an experiment: bars show where notes cluster, and each note is a button that jumps to it. */
export function SessionTrace({ points, start, end, onPick }: { points: TracePoint[]; start: string; end: string; onPick: (id: number) => void }) {
  const bars = density(points, 120);
  return (
    <div dir="ltr" className="relative h-[92px]" data-testid="session-trace">
      <div className="absolute inset-x-0 top-[18px] bottom-[24px] flex items-center gap-[2px]" aria-hidden="true">
        {bars.map((v, i) => (
          <span key={i} className="flex-1 rounded-[2px] bg-sidebar-accent/35" style={{ height: `${10 + v * 90}%` }} />
        ))}
      </div>
      {points.map((p) => (
        <button
          type="button"
          key={p.id}
          onClick={() => p.id !== undefined && onPick(p.id)}
          aria-label={p.label}
          title={p.label}
          className="group absolute top-0 flex h-[68px] w-5 -translate-x-1/2 flex-col items-center"
          style={{ left: `${1.5 + p.pos * 97}%` }}
          data-testid={`trace-mark-${p.id}`}
        >
          <span className="h-3.5 w-3.5 rounded-full border-[3px] bg-sidebar transition group-hover:scale-125" style={{ borderColor: kindColor(p.kind) }} />
          <span className="w-[2px] flex-1" style={{ background: kindColor(p.kind) }} />
        </button>
      ))}
      <span className="absolute bottom-0 left-0 font-mono text-[11px] text-sidebar-muted">{start}</span>
      <span className="absolute bottom-0 right-0 font-mono text-[11px] text-sidebar-muted">{end}</span>
    </div>
  );
}
