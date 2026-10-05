import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { buildDocx } from '@/lib/exportDocx';
import { buildReport } from '@/lib/report';
import type { Insights, Note } from '@/lib/types';
import { emptyStats, exp, lina, noor, renderApp } from './utils';

vi.mock('@/lib/api', async (orig) => {
  const real = await orig<typeof import('@/lib/api')>();
  return { ...real, api: Object.fromEntries(Object.keys(real.api).map((k) => [k, vi.fn()])) };
});
const A = api as unknown as Record<keyof typeof api, ReturnType<typeof vi.fn>>;

const now = new Date().toISOString();
function n(id: number, over: Partial<Note> = {}): Note {
  return { id, text: `note ${id}`, kind: 'observation', source: 'manual', text_source: 'human', time_label: null, created_at: now, updated_at: now, author: noor, asr: null, audio_file: null, has_audio: false, can_edit: true, ...over };
}

const analysed: Insights = {
  status: 'done', error: null, updated_at: now, ai_configured: true,
  result: {
    summary: 'The response gets faster with heat.', key_points: ['14% faster'], next_steps: ['Control humidity'],
    documentation_quality: { score: 82, strengths: ['Clear runs'], gaps: ['No humidity'] },
    novelty: { score: 60, rationale: 'model guess', caveat: '' },
    literature: { status: 'ok', score: 71, rationale: 'Few direct comparisons.', similar: [] },
    note_suggestions: [], notes_to_review: [], note_kinds: [],
    meta: { model: 'deepseek-chat', provider: 'DeepSeek', generated_at: now },
  },
};

const notAnalysed: Insights = { status: 'none', result: null, error: null, updated_at: null, ai_configured: false };

describe('report model', () => {
  it('never shows the default originality as a score before an analysis', () => {
    const m = buildReport(exp({ originality: 50 }), notAnalysed, 'en');
    expect(m.originality).toBeNull();
    expect(m.ai).toBeNull();
  });

  it('uses the scholarly score when there is one, and counts note types', () => {
    const e = exp({ notes: [n(1), n(2, { kind: 'observation' }), n(3, { kind: 'decision' }), n(4, { kind: 'decision' })], collaborators: [lina] });
    const m = buildReport(e, analysed, 'en');
    expect(m.originality).toBe(71);
    expect(m.kindCounts).toEqual({ observation: 2, decision: 2 });
    expect(m.ai?.keyPoints).toEqual(['14% faster']);
    expect(m.notes[2].kindLabel).toBe('Decision');
  });

  it('is translated to Arabic and gives a safe file name', () => {
    const m = buildReport(exp({ code: 'EXP-5', title: 'اليوم بدأنا التجربة / الساعة 9.', status: 'Completed', notes: [n(1, { kind: 'decision' })] }), null, 'ar');
    expect(m.dir).toBe('rtl');
    expect(m.statusLabel).toBe('مكتملة');
    expect(m.notes[0].kindLabel).toBe('قرار');
    expect(m.fileName).toBe('MindTrace - EXP-5 - اليوم بدأنا التجربة الساعة 9');
  });
});

describe('word export', () => {
  async function documentXml(blob: Blob) {
    const zip = await JSZip.loadAsync(blob);
    return zip.file('word/document.xml')!.async('string');
  }

  it('builds a real .docx with the content and the logo', async () => {
    const m = buildReport(exp({ notes: [n(1, { text: 'colour changed at 24 °C' })] }), analysed, 'en');
    const blob = await buildDocx(m, new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer);
    const xml = await documentXml(blob);
    expect(xml).toContain('Ambient temperature');
    expect(xml).toContain('colour changed at 24 °C');
    expect(xml).toContain('The response gets faster with heat.');
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
  });

  it('writes Arabic right-to-left but keeps an English note left-to-right', async () => {
    const m = buildReport(exp({ title: 'تجربة الحرارة', notes: [n(1, { text: 'ملاحظة عربية' }), n(2, { text: 'English note.' })] }), null, 'ar');
    const xml = await documentXml(await buildDocx(m, null));
    expect(xml).toContain('<w:bidi/>');
    expect(xml).toContain('<w:rtl/>');
    const english = xml.slice(xml.lastIndexOf('<w:p>', xml.indexOf('English note.')), xml.indexOf('English note.'));
    expect(english).not.toContain('<w:bidi/>');
  });
});

describe('export from the experiment page', () => {
  beforeEach(() => {
    Object.values(A).forEach((f) => f.mockReset());
    A.me.mockResolvedValue({ user: noor });
    A.listExperiments.mockResolvedValue([exp()]);
    A.stats.mockResolvedValue(emptyStats);
    A.notifications.mockResolvedValue({ unread_count: 0, items: [] });
    A.recentCollaborators.mockResolvedValue([]);
    A.health.mockResolvedValue({ ok: true, version: 'x', ai_configured: false, dev_tools: false });
    A.insights.mockResolvedValue(notAnalysed);
    A.getExperiment.mockResolvedValue(exp({ notes: [n(7, { text: 'first reading' })] }));
  });

  it('PDF opens the designed report and the print window', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderApp('/experiments/1');
    await userEvent.click(await screen.findByTestId('button-export'));
    await userEvent.click(await screen.findByTestId('button-export-pdf'));
    expect(await screen.findByTestId('report-document')).toBeInTheDocument();
    expect(screen.getByTestId('report-title')).toHaveTextContent('Ambient temperature');
    expect(screen.getByTestId('report-note-7')).toHaveTextContent('first reading');
    expect(screen.getByTestId('report-not-analyzed')).toBeInTheDocument();
    expect(screen.getByTestId('report-logo')).toHaveAttribute('src', '/mindtrace-mark.png');
    expect(screen.queryByTestId('app-shell')).toBeNull();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(document.title).toBe('MindTrace - EXP-1 - Ambient temperature');
    print.mockRestore();
  });

  it('opening the report link directly does not pop up the print window', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderApp('/experiments/1/report');
    expect(await screen.findByTestId('report-document')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });
});
