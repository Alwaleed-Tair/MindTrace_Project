import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal typing for the browser's Web Speech API (Chrome / Edge / Safari). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export type DictationError = 'denied' | 'failed' | null;

/** Speech to text in the browser. Final phrases are handed to `onText`; the phrase being spoken is `interim`. */
export function useDictation(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<DictationError>(null);
  const rec = useRef<Recognition | null>(null);
  const want = useRef(false);                       // true until the user presses stop: Chrome ends a session after a silence, so it is restarted
  const cb = useRef(onText);
  cb.current = onText;
  const supported = typeof window !== 'undefined' && !!getCtor();

  const stop = useCallback(() => {
    want.current = false;
    rec.current?.stop();
  }, []);
  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || rec.current) return;
    setError(null);
    want.current = true;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i];
        if (piece.isFinal) {
          const text = piece[0].transcript.trim();
          if (text) cb.current(text);
        } else live += piece[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setError('denied'); want.current = false; }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') { setError('failed'); want.current = false; }
    };
    r.onend = () => {
      rec.current = null;
      setInterim('');
      if (want.current) {                            // ended by itself (silence): keep listening
        try {
          const again = new Ctor();
          Object.assign(again, { lang: r.lang, continuous: true, interimResults: true, onresult: r.onresult, onerror: r.onerror, onend: r.onend });
          rec.current = again;
          again.start();
          return;
        } catch {
          rec.current = null;
          want.current = false;
        }
      }
      setListening(false);
    };
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      rec.current = null;
      setListening(false);
      setError('failed');
    }
  }, [lang]);

  useEffect(() => () => { want.current = false; rec.current?.stop(); }, []);
  return { supported, listening, interim, error, start, stop, toggle: () => (rec.current ? stop() : start()) };
}

export type Dictation = ReturnType<typeof useDictation>;
