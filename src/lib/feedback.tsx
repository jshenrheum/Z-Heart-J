import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { copyText } from './clipboard.ts';
import { Icon } from '../components/Icon.tsx';

/** Toasts (polite live region) and the copy helper with its manual fallback. */

export interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastOptions {
  action?: ToastAction;
  tone?: 'ok' | 'error';
  ms?: number;
}
interface ToastState extends ToastOptions {
  id: number;
  message: string;
}

interface FeedbackApi {
  toast: (message: string, opts?: ToastOptions) => void;
  /** Copies `text` and says exactly what was copied: "Fax copied." */
  copy: (what: string, text: string) => Promise<void>;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toastState, setToast] = useState<ToastState | null>(null);
  const [manual, setManual] = useState<{ what: string; text: string } | null>(null);
  const seq = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((message: string, opts: ToastOptions = {}) => {
    window.clearTimeout(timer.current);
    const id = ++seq.current;
    setToast({ id, message, ...opts });
    timer.current = window.setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), opts.ms ?? (opts.action ? 7000 : 2600));
  }, []);

  const copy = useCallback(
    async (what: string, text: string) => {
      const ok = await copyText(text);
      if (ok) toast(`${what} copied.`);
      else setManual({ what, text });
    },
    [toast],
  );

  const api = useMemo(() => ({ toast, copy }), [toast, copy]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toastState && (
          <div className={`toast ${toastState.tone === 'error' ? 'toast-error' : ''}`} key={toastState.id}>
            <span>{toastState.message}</span>
            {toastState.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toastState.action?.onClick();
                  setToast(null);
                }}
              >
                {toastState.action.label}
              </button>
            )}
          </div>
        )}
      </div>
      {manual && <ManualCopy what={manual.what} text={manual.text} onClose={() => setManual(null)} />}
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('FeedbackProvider missing');
  return v;
}

function ManualCopy({ what, text, onClose }: { what: string; text: string; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="manual-copy-title">
        <h2 id="manual-copy-title" className="dialog-title">
          Copy {what.toLowerCase()}
        </h2>
        <p className="muted">This browser blocked automatic copying. The text is selected — copy it with your device’s copy command.</p>
        <textarea ref={ref} className="input mono" readOnly rows={Math.min(8, text.split('\n').length + 1)} value={text} aria-label={`${what} text`} onFocus={(e) => e.currentTarget.select()} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            <Icon name="check" size={18} /> Done
          </button>
        </div>
      </div>
    </div>
  );
}
