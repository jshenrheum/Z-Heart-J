import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MEMBERS } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import type { ProtectedSlotInfo } from '../data/backend.ts';
import { useFeedback } from '../lib/feedback.tsx';
import { PROTECTED_MAX } from '../lib/records.ts';
import { Icon } from './Icon.tsx';
import { ConfirmDialog, timeAgo } from './ui.tsx';

/**
 * One protected value (a credential number, a protected home field).
 *
 * The value exists on this device only while it's revealed, only in this
 * component's state — never in the shared household data, search, summaries or
 * exports — and it's hidden again after 30 seconds, when the app goes to the
 * background, or when you leave the page.
 */

const REVEAL_MS = 30_000;

export function ProtectedValue({ recordId, slot, label, hasValue, onRemoveField }: { recordId: string; slot: string; label: string; hasValue: boolean; onRemoveField?: () => void }) {
  const { backend, actions } = useStore();
  const { copy } = useFeedback();
  const uid = useId();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ProtectedSlotInfo | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const live = backend.mode === 'live';

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setRevealed(null);
  }, []);

  const loadInfo = useCallback(async () => {
    if (!backend.protectedInfo) return;
    try {
      const r = await backend.protectedInfo(recordId);
      setInfo(r.slots.find((s) => s.slot === slot) ?? null);
    } catch {
      setInfo(null);
    }
  }, [backend, recordId, slot]);

  useEffect(() => {
    if (live) void loadInfo();
  }, [live, loadInfo, hasValue]);

  useEffect(() => {
    const away = () => document.visibilityState === 'hidden' && hide();
    document.addEventListener('visibilitychange', away);
    return () => {
      document.removeEventListener('visibilitychange', away);
      window.clearTimeout(timer.current);
    };
  }, [hide]);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  if (!live) {
    return (
      <div className="value-row protected-row">
        <div className="value-main">
          <span className="value-label">{label}</span>
          <span className="value protected">
            <Icon name="lock" size={16} /> Protected
          </span>
          <span className="hint">The demo preview doesn’t store protected values. In the signed-in app this is saved encrypted and shown only when someone taps Reveal.</span>
        </div>
      </div>
    );
  }

  const reveal = async () => {
    setBusy(true);
    setError(null);
    const r = await actions.reveal(recordId, slot);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setRevealed(r.value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(hide, REVEAL_MS);
    void loadInfo();
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return setError('Enter the value to save.');
    if (v.length > PROTECTED_MAX) return setError(`Keep this under ${PROTECTED_MAX} characters.`);
    setBusy(true);
    setError(null);
    const r = await actions.setProtected(recordId, slot, v);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setDraft('');
    setEditing(false);
    hide();
    void loadInfo();
  };

  const meta = [
    info?.savedBy && info.savedAt ? `Saved by ${MEMBERS[info.savedBy].name} · ${timeAgo(info.savedAt)}` : '',
    info?.lastRevealedBy && info.lastRevealedAt ? `Last revealed by ${MEMBERS[info.lastRevealedBy].name} · ${timeAgo(info.lastRevealedAt)}` : '',
  ].filter(Boolean);

  return (
    <div className="value-row protected-row">
      <div className="value-main">
        <span className="value-label" id={`${uid}-label`}>
          {label}
        </span>
        {revealed !== null ? (
          <span className="value tnum revealed" aria-live="polite">
            {revealed}
          </span>
        ) : (
          <span className="value protected">
            <Icon name="lock" size={16} /> {hasValue ? 'Protected — saved' : 'Protected — nothing saved yet'}
          </span>
        )}
        {revealed !== null && <span className="hint">Hidden again in 30 seconds, or when you leave.</span>}
        {meta.length > 0 && <span className="hint">{meta.join('. ')}.</span>}
      </div>

      {editing ? (
        <form className="protected-form" onSubmit={save} noValidate>
          <label htmlFor={`${uid}-input`}>{hasValue ? `New ${label.toLowerCase()}` : label}</label>
          <input
            ref={input}
            id={`${uid}-input`}
            className="input mono"
            value={draft}
            maxLength={PROTECTED_MAX}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            aria-describedby={`${uid}-note`}
          />
          <p className="hint" id={`${uid}-note`}>
            Saved encrypted on the server. Never searchable, never in summaries or exports.
          </p>
          <div className="value-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? 'Saving…' : 'Save encrypted'}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setEditing(false);
                setDraft('');
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="value-actions">
          {hasValue && revealed === null && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void reveal()} disabled={busy} aria-label={`Reveal ${label.toLowerCase()}`}>
              <Icon name="eye" size={17} /> {busy ? 'Revealing…' : 'Reveal'}
            </button>
          )}
          {revealed !== null && (
            <>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copy(label, revealed)} aria-label={`Copy ${label.toLowerCase()}`}>
                <Icon name="copy" size={17} /> Copy
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={hide}>
                Hide
              </button>
            </>
          )}
          <button type="button" className={`btn btn-sm ${hasValue ? 'btn-quiet' : 'btn-primary'}`} onClick={() => setEditing(true)}>
            <Icon name="edit" size={17} /> {hasValue ? 'Replace' : `Add ${label.toLowerCase()}`}
          </button>
          {hasValue && (
            <button type="button" className="btn btn-quiet btn-sm btn-danger-text" onClick={() => setConfirmClear(true)}>
              <Icon name="trash" size={17} /> Remove value
            </button>
          )}
          {onRemoveField && !hasValue && (
            <button type="button" className="btn btn-quiet btn-sm btn-danger-text" onClick={onRemoveField}>
              <Icon name="trash" size={17} /> Remove field
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="inline-note inline-note-error" role="alert">
          {error}
        </p>
      )}

      {confirmClear && (
        <ConfirmDialog
          title={`Remove the saved ${label.toLowerCase()}?`}
          body="It’s deleted from the server right away. Protected values don’t go to the trash, so this can’t be undone."
          confirmLabel="Remove value"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={async () => {
            setConfirmClear(false);
            hide();
            const r = await actions.clearProtected(recordId, slot);
            if (!r.ok) setError(r.message);
            void loadInfo();
          }}
        />
      )}
    </div>
  );
}
