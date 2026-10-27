import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isDateStr } from '../lib/dates.ts';
import { setDirty } from '../lib/dirty.ts';
import { useOnline } from '../lib/online.ts';
import { safeUrl } from '../lib/summary.ts';
import { Icon } from './Icon.tsx';

export type FieldType = 'text' | 'textarea' | 'tel' | 'email' | 'url' | 'date' | 'time' | 'select' | 'number';
export type Values = Record<string, string>;

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  suggestions?: string[];
  maxLength?: number;
  min?: number;
  max?: number;
  autoComplete?: string;
  showIf?: (v: Values) => boolean;
  validate?: (value: string, all: Values) => string | undefined;
}

const PHONE_RE = /^[0-9\s().+\-x#,]{3,30}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side checks. The server repeats every one of them in Stage 2. */
export function validateField(def: FieldDef, raw: string, all: Values): string | undefined {
  const value = raw.trim();
  if (!value) return def.required ? 'Required' : def.validate?.(value, all);
  const max = def.maxLength ?? (def.type === 'textarea' ? 1000 : 200);
  if (value.length > max) return `Keep this under ${max} characters`;
  switch (def.type) {
    case 'tel':
      if (!PHONE_RE.test(value)) return 'Use digits and ( ) + - only';
      break;
    case 'email':
      if (!EMAIL_RE.test(value)) return 'Enter a valid email address';
      break;
    case 'url':
      if (!safeUrl(value)) return 'Enter a web address starting with http:// or https://';
      break;
    case 'date':
      if (!isDateStr(value)) return 'Enter a real date';
      break;
    case 'time':
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return 'Enter a time';
      break;
    case 'number': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < (def.min ?? 1) || n > (def.max ?? 999)) return `Enter a whole number from ${def.min ?? 1} to ${def.max ?? 999}`;
      break;
    }
  }
  return def.validate?.(value, all);
}

interface Props {
  title: string;
  fields: FieldDef[];
  initial: Values;
  submitLabel?: string;
  /** true when saved; otherwise a message saying why not (shown in the form). */
  onSubmit: (values: Values) => Promise<true | string>;
  onClose: () => void;
  note?: string;
  extraAction?: ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function FormSheet({ title, fields, initial, submitLabel = 'Save', onSubmit, onClose, note, extraAction }: Props) {
  const uid = useId();
  const online = useOnline();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  const dirty = useMemo(() => Object.keys({ ...initial, ...values }).some((k) => (values[k] ?? '') !== (initial[k] ?? '')), [initial, values]);

  useEffect(() => {
    setDirty(uid, dirty);
    return () => setDirty(uid, false);
  }, [dirty, uid]);

  const requestClose = useCallback(() => (dirty ? setConfirmDiscard(true) : onClose()), [dirty, onClose]);

  useEffect(() => {
    document.body.classList.add('scroll-lock');
    const first = panel.current?.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea');
    first?.focus();
    const back = opener.current as HTMLElement | null;
    return () => {
      document.body.classList.remove('scroll-lock');
      if (back && document.contains(back)) back.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
      } else if (e.key === 'Tab' && panel.current) {
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [requestClose]);

  const visible = fields.filter((f) => !f.showIf || f.showIf(values));

  const set = (name: string, v: string) => {
    setValues((s) => ({ ...s, [name]: v }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !online) return;
    const next: Record<string, string> = {};
    for (const f of visible) {
      const msg = validateField(f, values[f.name] ?? '', values);
      if (msg) next[f.name] = msg;
    }
    setErrors(next);
    if (Object.keys(next).length) {
      const firstBad = visible.find((f) => next[f.name]);
      if (firstBad) panel.current?.querySelector<HTMLElement>(`[name="${firstBad.name}"]`)?.focus();
      return;
    }
    setBusy(true);
    setFailed(null);
    const trimmed: Values = {};
    for (const f of visible) trimmed[f.name] = (values[f.name] ?? '').trim();
    const result = await onSubmit(trimmed);
    setBusy(false);
    if (result === true) {
      setDirty(uid, false);
      onClose();
    } else {
      setFailed(result);
    }
  };

  return (
    <div className="scrim sheet-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={`${uid}-heading`} ref={panel}>
        <header className="sheet-head">
          <h2 id={`${uid}-heading`} className="sheet-title">
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label="Close without saving">
            <Icon name="x" />
          </button>
        </header>

        <form className="sheet-body" onSubmit={submit} noValidate>
          {!online && (
            <p className="inline-note inline-note-warn" role="status">
              You’re offline. Your edit is kept here, unsaved, but it can’t be saved until you reconnect.
            </p>
          )}
          {failed && (
            <p className="inline-note inline-note-error" role="alert">
              {failed}
            </p>
          )}

          {visible.map((f) => {
            const id = `${uid}-field-${f.name}`; // prefixed so a field called "title" can never collide with the dialog heading
            const err = errors[f.name];
            const describedBy = [f.hint ? `${id}-hint` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
            const common = { id, name: f.name, value: values[f.name] ?? '', 'aria-invalid': err ? true : undefined, 'aria-describedby': describedBy, 'aria-required': f.required || undefined };
            return (
              <div className="field" key={f.name}>
                <label htmlFor={id}>
                  {f.label}
                  {f.required ? <span className="req"> · required</span> : <span className="opt"> · optional</span>}
                </label>
                {f.type === 'textarea' ? (
                  <textarea className="input" rows={3} maxLength={f.maxLength ?? 1000} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} {...common} />
                ) : f.type === 'select' ? (
                  <select className="input" onChange={(e) => set(f.name, e.target.value)} {...common}>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    type={f.type === 'number' ? 'text' : (f.type ?? 'text')}
                    inputMode={f.type === 'number' ? 'numeric' : f.type === 'tel' ? 'tel' : undefined}
                    autoComplete={f.autoComplete ?? 'off'}
                    list={f.suggestions ? `${id}-list` : undefined}
                    placeholder={f.placeholder}
                    maxLength={f.maxLength ?? 200}
                    onChange={(e) => set(f.name, e.target.value)}
                    {...common}
                  />
                )}
                {f.suggestions && (
                  <datalist id={`${id}-list`}>
                    {f.suggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                )}
                {f.hint && (
                  <p className="hint" id={`${id}-hint`}>
                    {f.hint}
                  </p>
                )}
                {err && (
                  <p className="field-error" id={`${id}-err`}>
                    {err}
                  </p>
                )}
              </div>
            );
          })}

          {note && <p className="shared-note">{note}</p>}

          {confirmDiscard ? (
            <div className="discard" role="alertdialog" aria-labelledby={`${uid}-discard`}>
              <p id={`${uid}-discard`}>
                <strong>Discard your changes?</strong> What you typed won’t be saved.
              </p>
              <div className="sheet-actions">
                <button type="button" className="btn btn-quiet" onClick={() => setConfirmDiscard(false)}>
                  Keep editing
                </button>
                <button type="button" className="btn btn-danger" onClick={onClose}>
                  Discard
                </button>
              </div>
            </div>
          ) : (
            <div className="sheet-actions">
              {extraAction}
              <span className="grow" />
              <button type="button" className="btn btn-quiet" onClick={requestClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !online}>
                {busy ? 'Saving…' : submitLabel}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
