import { CheckCircle2, MessageSquareHeart } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { usePreferences } from '@/context/PreferencesContext';

type Kind = 'idea' | 'bug' | 'other';

/** A mock "send us a note" form: nothing is sent anywhere yet. It follows the theme and the language. */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, dir } = usePreferences();
  const [kind, setKind] = useState<Kind>('idea');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const kinds: [Kind, string][] = [['idea', t.feedbackIdea], ['bug', t.feedbackBug], ['other', t.feedbackOther]];
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setTimeout(() => { setSent(false); setText(''); setKind('idea'); }, 200);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent dir={dir} className="max-w-md rounded-3xl border-border bg-card p-6 text-card-foreground shadow-2xl sm:p-7" data-testid="dialog-feedback">
        {sent ? (
          <div className="py-4 text-center" data-testid="feedback-sent">
            <CheckCircle2 size={38} className="mx-auto text-primary" />
            <DialogTitle className="mt-4 text-xl font-semibold tracking-[-.03em]">{t.feedbackThanks}</DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{t.feedbackThanksSub}</DialogDescription>
            <div className="mt-6 flex justify-center gap-2">
              <button type="button" onClick={() => { setSent(false); setText(''); }} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="button-feedback-another">{t.feedbackAnother}</button>
              <button type="button" onClick={() => close(false)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" data-testid="button-feedback-close">{t.feedbackClose}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary"><MessageSquareHeart size={19} /></span>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-[-.03em]">{t.feedbackTitle}</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs leading-5 text-muted-foreground">{t.feedbackSub}</DialogDescription>
              </div>
            </div>
            <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) setSent(true); }}>
              <div className="flex gap-2" role="radiogroup">
                {kinds.map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${kind === value ? 'border-primary bg-primary/12 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`} data-testid={`feedback-kind-${value}`}>{label}</button>
                ))}
              </div>
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} dir="auto" placeholder={t.feedbackPlaceholder} className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-muted-foreground/55 focus:border-primary" data-testid="textarea-feedback" />
              <div className="flex justify-end">
                <button type="submit" disabled={!text.trim()} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40" data-testid="button-feedback-send">{t.feedbackSend}</button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
