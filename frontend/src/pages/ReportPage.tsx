import { ArrowLeft, AudioLines, Download, Eye, Printer } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { usePreferences } from '@/context/PreferencesContext';
import { useExperiment, useInsights } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { BRAND, buildReport, KIND_ORDER, kindLabel, takePrintRequest, type ReportModel } from '@/lib/report';
import { downloadDocx } from '@/lib/exportDocx';
import type { Person } from '@/lib/types';
import './report.css';

const hex = (c: string) => `#${c}`;

function Brand() {
  return (
    <div className="rp-brand">
      <img src="/mindtrace-mark.png" alt="" data-testid="report-logo" />
      <span>Mind<b>Trace</b></span>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 84 84" className="rp-ring" aria-hidden>
      <circle cx="42" cy="42" r={r} fill="none" stroke={hex(BRAND.line)} strokeWidth="7" />
      <circle cx="42" cy="42" r={r} fill="none" stroke={hex(BRAND.primary)} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, value)) / 100)} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" className="rp-ring-num">{value}</text>
    </svg>
  );
}

function PersonChip({ p, role }: { p: Person; role: string }) {
  return (
    <div className="rp-person">
      <span className="rp-avatar">{p.initials}</span>
      <div>
        <p className="rp-person-name" dir="auto">{p.name}</p>
        <p className="rp-person-sub" dir="auto">{[role, p.lab].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rp-list">
      <p className="rp-label">{title}</p>
      <ul>{items.map((s, i) => <li key={i} dir="auto">{s}</li>)}</ul>
    </div>
  );
}

/** The report itself: an A4 document that prints cleanly to PDF (the running header and footer repeat on every page). */
export function ReportDocument({ m }: { m: ReportModel }) {
  const { t } = m;
  const people = [{ p: m.owner, role: t.owner }, ...m.collaborators.map((p) => ({ p, role: t.reportCollaborator }))];
  const stats: [string, string][] = [
    [t.reportStarted, m.started],
    [t.reportUpdated, m.updated],
    [t.reportDuration, m.duration],
    [t.reportNotes, String(m.noteCount)],
  ];
  let lastDate = '';
  return (
    <article className="rp-sheet" data-testid="report-document">
      <table className="rp-frame">
        <thead>
          <tr><td>
            <header className="rp-run">
              <Brand />
              <span className="rp-run-meta">{t.reportTitle} · <span dir="ltr">{m.code}</span></span>
            </header>
          </td></tr>
        </thead>
        <tfoot>
          <tr><td>
            <footer className="rp-foot">
              <span>{t.reportGenerated}</span>
              <span>{m.exportedOn}</span>
            </footer>
          </td></tr>
        </tfoot>
        <tbody>
          <tr><td className="rp-body">
            <section className="rp-hero">
              <div className="rp-eyebrow">
                <span className={`rp-status rp-status-${m.status.toLowerCase()}`}><i />{m.statusLabel}</span>
                <span className="rp-code" dir="ltr">{m.code}</span>
              </div>
              <h1 dir="auto" data-testid="report-title">{m.title}</h1>
              {m.summary && <p className="rp-summary" dir="auto">{m.summary}</p>}
              {m.tags.length > 0 && <div className="rp-tags">{m.tags.map((tag) => <span key={tag} dir="auto">{tag}</span>)}</div>}
            </section>

            <section className="rp-stats">
              {stats.map(([label, value]) => (
                <div key={label} className="rp-stat">
                  <p className="rp-label">{label}</p>
                  <p className="rp-stat-value">{value}</p>
                </div>
              ))}
            </section>

            <section className="rp-section rp-keep">
              <h2>{t.reportTeam}</h2>
              <div className="rp-people">{people.map(({ p, role }) => <PersonChip key={p.id} p={p} role={role} />)}</div>
            </section>

            <section className="rp-section" data-testid="report-ai">
              <h2>{t.reportAi}</h2>
              {m.ai ? (
                <>
                  <div className="rp-ai-summary rp-keep">
                    <p dir="auto">{m.ai.summary}</p>
                    {m.ai.by && <span className="rp-ai-by" dir="auto">{m.ai.by}</span>}
                  </div>
                  <div className="rp-grid2">
                    <List title={t.keyPoints} items={m.ai.keyPoints} />
                    <List title={t.nextSteps} items={m.ai.nextSteps} />
                  </div>
                  <div className="rp-grid2 rp-keep">
                    <div className="rp-card">
                      <div className="rp-card-head"><p className="rp-label">{t.reportDocQuality}</p><strong>{m.ai.docScore}%</strong></div>
                      <div className="rp-bar"><span style={{ width: `${m.ai.docScore}%` }} /></div>
                      <List title={t.strengths} items={m.ai.strengths} />
                      <List title={t.gaps} items={m.ai.gaps} />
                    </div>
                    <div className="rp-card">
                      <div className="rp-orig">
                        {m.originality !== null && <Ring value={m.originality} />}
                        <div>
                          <p className="rp-label">{t.reportOriginality}</p>
                          <p className="rp-muted-sm">{t.origScale}</p>
                        </div>
                      </div>
                      {m.ai.originalityRationale && <p className="rp-text-sm" dir="auto">{m.ai.originalityRationale}</p>}
                      {m.ai.papers.length > 0 && (
                        <>
                          <p className="rp-label rp-mt">{t.origSimilar}</p>
                          <ul className="rp-papers">
                            {m.ai.papers.slice(0, 4).map((p) => (
                              <li key={p.url || p.title}>
                                <p dir="auto">{p.title}</p>
                                <span dir="ltr">{[p.authors.slice(0, 3).join(', '), p.year, p.venue || p.source].filter(Boolean).join(' · ')}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="rp-empty" data-testid="report-not-analyzed">{t.reportNotAnalyzed}</p>
              )}
            </section>

            <section className="rp-section" data-testid="report-timeline">
              <div className="rp-section-head">
                <h2>{t.reportTimeline}</h2>
                {m.noteCount > 0 && (
                  <div className="rp-breakdown" aria-label={t.reportBreakdown}>
                    <div className="rp-stack">
                      {KIND_ORDER.filter((k) => m.kindCounts[k]).map((k) => <span key={k} style={{ flex: m.kindCounts[k], background: hex(BRAND.kind[k]) }} />)}
                    </div>
                    <div className="rp-legend">
                      {KIND_ORDER.map((k) => (
                        <span key={k}><i style={{ background: hex(BRAND.kind[k]) }} />{kindLabel(k, t)} <b>{m.kindCounts[k]}</b></span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {m.notes.length === 0 && <p className="rp-empty">{t.reportNoNotes}</p>}
              <ol className="rp-timeline">
                {m.notes.map((n) => {
                  const showDate = n.date !== lastDate;
                  lastDate = n.date;
                  return (
                    <Fragment key={n.id}>
                      {showDate && <li className="rp-day">{n.date}</li>}
                      <li className="rp-note" style={{ ['--k' as string]: hex(BRAND.kind[n.kind]), ['--ks' as string]: hex(BRAND.kindSoft[n.kind]) }} data-testid={`report-note-${n.id}`}>
                        <span className="rp-dot" />
                        <div className="rp-note-card">
                          <div className="rp-note-meta">
                            <span dir="ltr">{n.timeLabel ?? n.time}</span>
                            {n.fromRecording && <span className="rp-badge"><AudioLines size={10} />{t.fromRecording}</span>}
                            {n.needsReview && <span className="rp-badge rp-badge-warn"><Eye size={10} />{t.needsReview}</span>}
                            {n.author && <span className="rp-author" dir="auto">{n.author}</span>}
                          </div>
                          <p dir="auto">{n.text}</p>
                        </div>
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
            </section>
          </td></tr>
        </tbody>
      </table>
    </article>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = usePreferences();
  const [, navigate] = useLocation();
  const q = useExperiment(id);
  const ins = useInsights(id);
  const [wordBusy, setWordBusy] = useState(false);
  const [wordError, setWordError] = useState(false);
  const printed = useRef(false);
  const ready = q.isSuccess && !ins.isPending;
  const model = ready ? buildReport(q.data, ins.data ?? null, language) : null;

  // the browser offers the page title as the PDF file name
  useEffect(() => {
    if (!model) return;
    const before = document.title;
    document.title = model.fileName;
    return () => {
      document.title = before;
    };
  }, [model?.fileName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || printed.current || !takePrintRequest(id)) return;
    printed.current = true;
    let cancelled = false;
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
    const images = Array.from(document.images).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; })));
    // never wait forever: a missing font or logo should not stop the print window
    Promise.race([Promise.all([fonts, ...images]), new Promise((r) => setTimeout(r, 2500))]).then(() => {
      if (!cancelled) setTimeout(() => window.print(), 150);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, id]);

  const word = async () => {
    if (!model) return;
    setWordBusy(true);
    setWordError(false);
    try {
      await downloadDocx(model);
    } catch {
      setWordError(true);
    } finally {
      setWordBusy(false);
    }
  };

  return (
    <div className="rp-root" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language} data-testid="report-page">
      <div className="rp-toolbar">
        <button type="button" onClick={() => navigate(`/experiments/${encodeURIComponent(id)}`)} className="rp-btn rp-btn-ghost" data-testid="button-report-back">
          <ArrowLeft size={15} className="rtl:rotate-180" />
          {t.reportBack}
        </button>
        <p className="rp-toolbar-hint">{wordError ? t.exportFailed : t.reportPdfHint}</p>
        <div className="rp-toolbar-actions">
          <button type="button" onClick={word} disabled={!model || wordBusy} className="rp-btn rp-btn-ghost" data-testid="button-report-word">
            <Download size={15} />
            {wordBusy ? t.exporting : t.reportDownloadWord}
          </button>
          <button type="button" onClick={() => window.print()} disabled={!model} className="rp-btn rp-btn-primary" data-testid="button-report-print">
            <Printer size={15} />
            {t.reportSavePdf}
          </button>
        </div>
      </div>
      {q.isError ? (
        <p className="rp-error" data-testid="report-missing">{q.error instanceof ApiError && q.error.status !== 404 ? q.error.message : t.experimentMissing}</p>
      ) : model ? (
        <ReportDocument m={model} />
      ) : (
        <div className="rp-sheet rp-loading" aria-busy="true" data-testid="report-loading" />
      )}
    </div>
  );
}
