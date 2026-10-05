import { BRAND, KIND_ORDER, kindLabel, type ReportModel } from './report';
import type { NoteKind } from './types';

/**
 * The experiment report as an editable Word file, built in the browser (no server change).
 * Mirrors the PDF page: same header with the logo, same sections, same colors.
 * `docx` is loaded only when someone exports, so it never weighs on the normal app.
 */

type Docx = typeof import('docx');

const RTL_TEXT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const FIRST_STRONG = /[A-Za-z\u00C0-\u024F\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

function isRtlText(text: string, fallback: boolean) {
  const c = text.match(FIRST_STRONG)?.[0];
  return c ? RTL_TEXT.test(c) : fallback;
}

const FONT = { ascii: 'Segoe UI', hAnsi: 'Segoe UI', cs: 'Segoe UI', eastAsia: 'Segoe UI' };
const PAGE_W = 11906; // A4, twips
const MARGIN = 1077; // 1.9 cm
const CONTENT_W = PAGE_W - 2 * MARGIN;

interface RunOpts { bold?: boolean; size?: number; color?: string; shade?: string; italics?: boolean }
interface ParaOpts { align?: 'start' | 'end' | 'center'; before?: number; after?: number; line?: number; keepNext?: boolean; underline?: string; bullet?: boolean; /** free text: its own first letter decides the direction, like dir="auto" in the PDF */ auto?: string }

export async function buildDocx(m: ReportModel, logo: ArrayBuffer | null): Promise<Blob> {
  const d: Docx = await import('docx');
  const { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType } = d;
  const rtl = m.dir === 'rtl';
  const { t } = m;

  const run = (text: string, o: RunOpts = {}) =>
    new TextRun({
      text,
      bold: o.bold,
      italics: o.italics,
      size: o.size,
      color: o.color,
      font: FONT,
      rightToLeft: RTL_TEXT.test(text),
      shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shade } : undefined,
    });

  const align = (a: ParaOpts['align']) => (a === 'end' ? AlignmentType.END : a === 'center' ? AlignmentType.CENTER : AlignmentType.START);
  const para = (children: (InstanceType<Docx['TextRun']> | InstanceType<Docx['ImageRun']>)[], o: ParaOpts = {}) =>
    new Paragraph({
      children,
      bidirectional: o.auto !== undefined ? isRtlText(o.auto, rtl) : rtl,
      alignment: align(o.align),
      keepNext: o.keepNext,
      spacing: { before: o.before ?? 0, after: o.after ?? 0, line: o.line },
      bullet: o.bullet ? { level: 0 } : undefined,
      border: o.underline ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: o.underline, space: 6 } } : undefined,
    });
  const gap = (twips = 120) => new Paragraph({ children: [run('', { size: 2 })], spacing: { before: 0, after: twips, line: 240 } });

  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const white = (size: number) => ({ style: BorderStyle.SINGLE, size, color: 'FFFFFF' });

  type Child = InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>;
  const cell = (children: Child[], o: { w: number; fill?: string; pad?: number; borders?: object; vCenter?: boolean }) =>
    new TableCell({
      children,
      width: { size: o.w, type: WidthType.DXA },
      shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
      margins: { top: o.pad ?? 0, bottom: o.pad ?? 0, left: o.pad ?? 0, right: o.pad ?? 0 },
      borders: (o.borders as never) ?? { top: none, bottom: none, left: none, right: none },
      verticalAlign: o.vCenter ? VerticalAlign.CENTER : undefined,
    });
  const table = (rows: InstanceType<Docx['TableRow']>[], widths: number[], borders: object = noBorders) =>
    new Table({
      rows,
      width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: borders as never,
      visuallyRightToLeft: rtl,
    });
  const row = (cells: InstanceType<Docx['TableCell']>[], cantSplit = true) => new TableRow({ children: cells, cantSplit });

  /** A colored strip on the reading side (right in Arabic, left in English) + the content. */
  const accentCard = (accent: string, fill: string, children: Child[], pad = 170) =>
    table([row([cell([para([run('')])], { w: 70, fill: accent }), cell(children, { w: CONTENT_W - 70, fill, pad })])], [70, CONTENT_W - 70]);

  const h2 = (text: string) => para([run(text, { bold: true, size: 27, color: BRAND.ink })], { before: 380, after: 170, keepNext: true, underline: BRAND.line });
  const label = (text: string, o: ParaOpts = {}) => para([run(rtl ? text : text.toUpperCase(), { bold: true, size: rtl ? 17 : 15, color: BRAND.muted })], { after: 40, keepNext: true, ...o });
  const bullets = (items: string[]) => items.map((s) => para([run(s, { size: 19 })], { bullet: true, after: 40, line: 290, auto: s }));

  // ---- header / footer
  const brand: (InstanceType<Docx['TextRun']> | InstanceType<Docx['ImageRun']>)[] = [];
  if (logo) brand.push(new ImageRun({ type: 'png', data: logo, transformation: { width: 24, height: 24 } }));
  brand.push(run(' Mind', { bold: true, size: 26, color: BRAND.ink }), run('Trace', { bold: true, size: 26, color: BRAND.primary }));
  const headerTable = table(
    [row([
      cell([para(brand)], { w: CONTENT_W * 0.5, vCenter: true }),
      cell([para([run(`${t.reportTitle} · `, { size: 16, color: BRAND.muted, bold: true }), run(m.code, { size: 16, color: BRAND.muted, bold: true })], { align: 'end' })], { w: CONTENT_W * 0.5, vCenter: true }),
    ])],
    [CONTENT_W * 0.5, CONTENT_W * 0.5],
    { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.line } },
  );
  const pageParts = t.reportPage.split(/(\{n\}|\{total\})/).filter(Boolean).map((part) =>
    part === '{n}' ? new TextRun({ children: [PageNumber.CURRENT], size: 15, color: BRAND.muted, font: FONT })
      : part === '{total}' ? new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: BRAND.muted, font: FONT })
        : run(part, { size: 15, color: BRAND.muted }),
  );
  const footer = new Paragraph({
    bidirectional: rtl,
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: BRAND.line, space: 6 } },
    children: [run(`${t.reportGenerated}   ·   ${m.exportedOn}   ·   `, { size: 15, color: BRAND.muted }), ...pageParts],
  });

  // ---- body
  const body: Child[] = [];
  const statusColor = m.status === 'Paused' ? 'C27C0E' : m.status === 'Completed' ? '4A5A70' : BRAND.primary;

  // hero
  const hero: Child[] = [
    para([run(` ● ${m.statusLabel} `, { bold: true, size: 17, color: statusColor, shade: 'FFFFFF' }), run('   '), run(m.code, { bold: true, size: 17, color: BRAND.muted })], { after: 140 }),
    para([run(m.title, { bold: true, size: 46, color: BRAND.ink })], { after: m.summary || m.tags.length ? 120 : 0, line: 300, auto: m.title }),
  ];
  if (m.summary) hero.push(para([run(m.summary, { size: 21, color: '3D4A5A' })], { after: m.tags.length ? 160 : 0, line: 320, auto: m.summary }));
  if (m.tags.length) hero.push(para(m.tags.flatMap((tag, i) => [...(i ? [run('  ')] : []), run(` ${tag} `, { bold: true, size: 17, color: BRAND.primary, shade: 'FFFFFF' })])));
  body.push(table([row([cell(hero, { w: CONTENT_W, fill: 'EEF8F6', pad: 340 })])], [CONTENT_W], { ...noBorders }));
  body.push(gap(160));

  // stats
  const stats: [string, string][] = [[t.reportStarted, m.started], [t.reportUpdated, m.updated], [t.reportDuration, m.duration], [t.reportNotes, String(m.noteCount)]];
  const sw = CONTENT_W / 4;
  body.push(table([row(stats.map(([l, v]) => cell([label(l), para([run(v, { bold: true, size: 24, color: BRAND.ink })])], { w: sw, fill: BRAND.panel, pad: 170, borders: { top: white(1), bottom: white(1), left: white(36), right: white(36) } })))], [sw, sw, sw, sw]));

  // team
  body.push(h2(t.reportTeam));
  const people = [{ p: m.owner, role: t.owner }, ...m.collaborators.map((p) => ({ p, role: t.reportCollaborator }))];
  const pw = CONTENT_W / 3;
  const teamRows: InstanceType<Docx['TableRow']>[] = [];
  for (let i = 0; i < people.length; i += 3) {
    const slice = people.slice(i, i + 3);
    teamRows.push(row([0, 1, 2].map((k) => {
      const x = slice[k];
      if (!x) return cell([para([run('')])], { w: pw });
      return cell([
        para([run(`${x.p.initials}  `, { bold: true, size: 18, color: BRAND.primary }), run(x.p.name, { bold: true, size: 20, color: BRAND.ink })]),
        para([run([x.role, x.p.lab].filter(Boolean).join(' · '), { size: 16, color: BRAND.muted })]),
      ], { w: pw, fill: BRAND.panel, pad: 140, borders: { top: white(30), bottom: white(30), left: white(30), right: white(30) } });
    })));
  }
  body.push(table(teamRows, [pw, pw, pw]));

  // AI analysis
  body.push(h2(t.reportAi));
  if (m.ai) {
    const ai = m.ai;
    const summary: Child[] = ai.summary.split(/\n+/).filter(Boolean).map((s) => para([run(s, { size: 20, color: BRAND.ink })], { after: 80, line: 320, auto: s }));
    if (ai.by) summary.push(para([run(ai.by, { size: 15, color: BRAND.muted })], { before: 60 }));
    body.push(accentCard(BRAND.primary, BRAND.primarySoft, summary, 200));
    if (ai.keyPoints.length) body.push(label(t.keyPoints, { before: 220 }), ...bullets(ai.keyPoints));
    if (ai.nextSteps.length) body.push(label(t.nextSteps, { before: 220 }), ...bullets(ai.nextSteps));

    // documentation quality: score + bar
    const score = Math.max(0, Math.min(100, Math.round(ai.docScore)));
    body.push(para([run(`${t.reportDocQuality}   `, { bold: true, size: 21, color: BRAND.ink }), run(`${score}%`, { bold: true, size: 26, color: BRAND.primary })], { before: 300, after: 100, keepNext: true }));
    const bw = CONTENT_W;
    const filled = Math.round((bw * score) / 100);
    const barCells = [filled > 0 ? cell([para([run('', { size: 2 })])], { w: Math.max(filled, 1), fill: BRAND.primary }) : null, bw - filled > 0 ? cell([para([run('', { size: 2 })])], { w: bw - filled, fill: BRAND.line }) : null].filter(Boolean) as InstanceType<Docx['TableCell']>[];
    body.push(table([new TableRow({ children: barCells, height: { value: 100, rule: 'exact' } })], barCells.length === 2 ? [filled, bw - filled] : [bw]));
    if (ai.strengths.length) body.push(label(t.strengths, { before: 180 }), ...bullets(ai.strengths));
    if (ai.gaps.length) body.push(label(t.gaps, { before: 180 }), ...bullets(ai.gaps));

    // originality
    body.push(para([run(`${t.reportOriginality}   `, { bold: true, size: 21, color: BRAND.ink }), ...(m.originality !== null ? [run(`${m.originality}`, { bold: true, size: 26, color: BRAND.primary }), run(' / 100', { size: 18, color: BRAND.muted })] : [])], { before: 300, after: 40, keepNext: true }));
    body.push(para([run(t.origScale, { size: 16, color: BRAND.muted })], { after: 80 }));
    if (ai.originalityRationale) body.push(para([run(ai.originalityRationale, { size: 19 })], { after: 80, line: 300, auto: ai.originalityRationale }));
    if (ai.papers.length) {
      body.push(label(t.origSimilar, { before: 140 }));
      ai.papers.slice(0, 4).forEach((p) => {
        body.push(para([run(p.title, { bold: true, size: 18 })], { before: 60, keepNext: true, auto: p.title }));
        body.push(para([run([p.authors.slice(0, 3).join(', '), p.year, p.venue || p.source].filter(Boolean).join(' · '), { size: 15, color: BRAND.muted })], { after: 40, auto: p.title }));
      });
    }
  } else {
    body.push(table([row([cell([para([run(t.reportNotAnalyzed, { size: 19, color: BRAND.muted })], { align: 'center' })], { w: CONTENT_W, fill: BRAND.panel, pad: 220 })])], [CONTENT_W]));
  }

  // notes timeline
  body.push(h2(t.reportTimeline));
  if (m.noteCount > 0) {
    body.push(para(KIND_ORDER.flatMap((k: NoteKind, i) => [
      ...(i ? [run('      ')] : []),
      run('● ', { size: 18, color: BRAND.kind[k] }),
      run(`${kindLabel(k, t)} `, { size: 17, color: BRAND.muted }),
      run(String(m.kindCounts[k]), { bold: true, size: 17, color: BRAND.ink }),
    ]), { after: 160 }));
  } else {
    body.push(table([row([cell([para([run(t.reportNoNotes, { size: 19, color: BRAND.muted })], { align: 'center' })], { w: CONTENT_W, fill: BRAND.panel, pad: 220 })])], [CONTENT_W]));
  }
  let lastDate = '';
  for (const n of m.notes) {
    if (n.date !== lastDate) {
      body.push(para([run(n.date, { bold: true, size: 17, color: BRAND.muted })], { before: lastDate ? 200 : 40, after: 100, keepNext: true }));
      lastDate = n.date;
    }
    const meta = [run(`${n.timeLabel ?? n.time}`, { size: 16, color: BRAND.muted })];
    if (n.fromRecording) meta.push(run(`   ·   ${t.fromRecording}`, { size: 16, color: BRAND.muted }));
    if (n.needsReview) meta.push(run(`   ·   ${t.needsReview}`, { bold: true, size: 16, color: '9A6208' }));
    if (n.author) meta.push(run(`   ·   ${n.author}`, { bold: true, size: 16, color: BRAND.ink }));
    const text = n.text.split(/\n/).map((s) => para([run(s, { size: 20, color: BRAND.ink })], { line: 310, auto: s }));
    body.push(accentCard(BRAND.kind[n.kind], 'FFFFFF', [para(meta, { after: 80 }), ...text], 150));
    body.push(gap(110));
  }

  const doc = new Document({
    creator: 'MindTrace',
    title: m.fileName,
    description: `${t.reportTitle} · ${m.code}`,
    styles: { default: { document: { run: { font: FONT, size: 20, color: BRAND.ink } } } },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 1150, bottom: 1000, left: MARGIN, right: MARGIN, header: 520, footer: 480 } } },
      headers: { default: new Header({ children: [headerTable, gap(0)] }) },
      footers: { default: new Footer({ children: [footer] }) },
      children: body,
    }],
  });
  return Packer.toBlob(doc);
}

async function loadLogo(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch('/mindtrace-mark.png');
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null; // the file is still useful without the image
  }
}

export async function downloadDocx(m: ReportModel): Promise<void> {
  const blob = await buildDocx(m, await loadLogo());
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${m.fileName}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
