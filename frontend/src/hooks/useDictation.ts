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
  const cb = useRef(onText);
  cb.current = onText;
  const supported = typeof window !== 'undefined' && !!getCtor();

  const stop = useCallback(() => rec.current?.stop(), []);
  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || rec.current) return;
    setError(null);
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
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('denied');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError('failed');
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      setInterim('');
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

  useEffect(() => () => rec.current?.stop(), []);
  return { supported, listening, interim, error, start, stop, toggle: () => (rec.current ? stop() : start()) };
}

export type Dictation = ReturnType<typeof useDictation>;
