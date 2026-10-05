import { Link } from 'wouter';
import { usePreferences } from '@/context/PreferencesContext';
import { useBridgeStatus } from '@/hooks/queries';
import { fill, relativeTime } from '@/lib/format';

type Tone = 'live' | 'rec' | 'warn' | 'off';
const DOT: Record<Tone, string> = { live: 'bg-emerald-400', rec: 'bg-red-500 recording-pulse', warn: 'bg-amber-400', off: 'bg-sidebar-muted/60' };

/** Mic level bars: one per recent sample, -70 dB (empty) .. -20 dB (full). */
function Bars({ levels, tone }: { levels: number[]; tone: Tone }) {
  const shown = levels.slice(-24);
  return (
    <div className="mt-3 flex h-7 items-end gap-[3px]" dir="ltr" aria-hidden="true" data-testid="device-levels">
      {Array.from({ length: 24 }, (_, i) => {
        const v = shown[i - (24 - shown.length)];
        const h = v === undefined ? 0.08 : Math.max(0.08, Math.min(1, (v + 70) / 50));
        return <span key={i} className={`w-[5px] rounded-sm ${tone === 'rec' ? 'bg-red-400/80' : 'bg-sidebar-accent/80'}`} style={{ height: `${Math.round(h * 100)}%` }} />;
      })}
    </div>
  );
}

/** Bottom of the sidebar: is the recording device linked to this account and live right now? */
export function DeviceStatusCard() {
  const { t, language } = usePreferences();
  const q = useBridgeStatus();
  const s = q.data;
  if (!s) return null;
  let tone: Tone = 'off';
  let title = t.devNotLinked;
  let sub = t.devNotLinkedSub;
  if (s.linked && !s.online) [tone, title, sub] = ['off', t.devOffline, t.devOfflineSub];
  else if (s.online && !s.listener_running) [tone, title, sub] = ['warn', t.devListenerOff, t.devListenerOffSub];
  else if (s.online && !s.device_connected) [tone, title, sub] = ['warn', t.devUnplugged, t.devUnpluggedSub];
  else if (s.online && s.recording) [tone, title, sub] = ['rec', t.devRecording, ''];
  else if (s.online) [tone, title, sub] = ['live', t.devConnected, ''];
  const upload = s.last_upload_at ? fill(t.devLastUpload, { time: relativeTime(s.last_upload_at, language) }) : t.devNoUpload;
  const body = (
    <div className="rounded-2xl bg-sidebar-active p-3.5" data-testid="device-status" data-state={tone}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`} />
        <p className="truncate text-xs font-semibold text-white" data-testid="device-status-title">{title}</p>
      </div>
      {(tone === 'live' || tone === 'rec') && <Bars levels={s.levels} tone={tone} />}
      {sub && <p className="mt-2 text-[11px] leading-4 text-sidebar-muted" dir="auto">{sub}</p>}
      <p className="mt-2 text-[11px] text-sidebar-muted" data-testid="device-last-upload">{upload}{s.firmware ? ` · fw ${s.firmware}` : ''}</p>
    </div>
  );
  return s.linked ? body : <Link href="/settings" className="block rounded-2xl" data-testid="device-status-link">{body}</Link>;
}
