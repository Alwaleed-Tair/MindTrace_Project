import { Download, FileText, FileType2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePreferences } from '@/context/PreferencesContext';
import { api } from '@/lib/api';
import { downloadDocx } from '@/lib/exportDocx';
import { buildReport, requestPrint } from '@/lib/report';
import type { Experiment, Insights } from '@/lib/types';

/** Export the experiment as a designed PDF report (via the report page) or an editable Word file. */
export function ExportMenu({ experiment }: { experiment: Experiment }) {
  const { t, language } = usePreferences();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pdf = () => {
    setOpen(false);
    requestPrint(experiment.id);
    navigate(`/experiments/${encodeURIComponent(experiment.id)}/report`);
  };

  const word = async () => {
    setBusy(true);
    setFailed(false);
    try {
      let insights: Insights | null = null;
      try {
        insights = await api.insights(experiment.id, language);
      } catch {
        insights = null; // export without the AI section rather than not at all
      }
      await downloadDocx(buildReport(experiment, insights, language));
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const item = 'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start transition hover:bg-muted disabled:opacity-50';
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFailed(false); }}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground" data-testid="button-export">
          <Download size={13} />
          {t.exportBtn}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-xl p-1.5" data-testid="export-menu">
        <button type="button" onClick={pdf} className={item} data-testid="button-export-pdf">
          <FileText size={17} className="mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="block text-xs font-semibold">{t.exportPdf}</span>
            <span className="block text-[11px] text-muted-foreground">{t.exportPdfHint}</span>
          </span>
        </button>
        <button type="button" onClick={word} disabled={busy} className={item} data-testid="button-export-word">
          <FileType2 size={17} className="mt-0.5 shrink-0 text-[#2b579a] dark:text-[#7aa2e3]" />
          <span>
            <span className="block text-xs font-semibold">{busy ? t.exporting : t.exportWord}</span>
            <span className="block text-[11px] text-muted-foreground">{t.exportWordHint}</span>
          </span>
        </button>
        {failed && <p className="px-3 pb-2 pt-1 text-[11px] font-semibold text-destructive" role="alert" data-testid="export-failed">{t.exportFailed}</p>}
      </PopoverContent>
    </Popover>
  );
}
