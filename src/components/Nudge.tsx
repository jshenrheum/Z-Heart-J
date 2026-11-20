import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MEMBER_IDS, MEMBERS, type MemberId } from '../data/types.ts';
import type { Nudge, NudgeResult } from '../data/backend.ts';
import { useStore } from '../data/store.tsx';
import { useFeedback } from '../lib/feedback.tsx';
import { useOnline } from '../lib/online.ts';
import { newRowId } from '../lib/records.ts';
import { useRoute } from '../lib/router.tsx';
import { Icon } from './Icon.tsx';
import { timeAgo } from './ui.tsx';

/**
 * Nudges: a short note to the other person. It's saved, and sent as a notification
 * to each of their phones that has notifications on. The words after sending say
 * exactly what happened: on their phone, or waiting in the app.
 */

const QUICK = ['On my way', 'Call me when you can', 'Check the grocery list', 'Running a little late', 'Thinking of you ♥'];
const MAX = 200;
const RECENT_DAYS = 3;

const otherOf = (me: MemberId): MemberId => MEMBER_IDS.find((m) => m !== me)!;

/** What a sent nudge did, in plain words, naming the person (no guessing pronouns). */
export function outcomeText(r: NudgeResult, name: string, demo: boolean): string {
  if (demo) return 'Saved in the demo. The demo preview never sends a notification.';
  if (r.delivered > 0) return `Sent to ${name}’s phone.`;
  if (!r.configured) return `Saved. Notifications aren’t set up yet, so it’s waiting for ${name} in the app.`;
  if (r.phones === 0) return `Saved. ${name} hasn’t turned on notifications yet, so it’s waiting in the app.`;
  return `Saved, but ${name}’s phone didn’t take the notification. It’s waiting in the app.`;
}

/** Recent nudges, refreshed while the app is open and on returning to it. */
export function useNudges() {
  const { backend } = useStore();
  const online = useOnline();
  const [nudges, setNudges] = useState<Nudge[] | null>(null);
  const load = useCallback(async () => {
    try {
      setNudges(await backend.nudges());
    } catch {
      /* offline or signed out: keep what's showing */
    }
  }, [backend]);
  useEffect(() => {
    if (!online) return;
    void load();
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), 30_000);
    const v = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', v);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', v);
    };
  }, [online, load]);
  const add = (n: Nudge) => setNudges((l) => [n, ...(l ?? []).filter((x) => x.id !== n.id)]);
  return { nudges, add };
}

export function NudgeSheet({ to, onClose, onSent }: { to: MemberId; onClose: () => void; onSent: (r: NudgeResult) => void }) {
  const { backend } = useStore();
  const { toast } = useFeedback();
  const online = useOnline();
  const uid = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  // One id per note, so a retry after a dropped connection can never send it twice.
  const id = useRef(newRowId('n'));
  const name = MEMBERS[to].name;

  useEffect(() => {
    document.body.classList.add('scroll-lock');
    area.current?.focus();
    const back = opener.current as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('scroll-lock');
      window.removeEventListener('keydown', onKey);
      if (back && document.contains(back)) back.focus();
    };
  }, [onClose, busy]);

  const send = async (words: string) => {
    const clean = words.replace(/\s+/g, ' ').trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await backend.sendNudge(id.current, clean);
      onSent(r);
      toast(outcomeText(r, name, backend.mode === 'demo'));
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'It wasn’t sent. Try again.');
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  return (
    <div className="scrim sheet-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet nudge-sheet" role="dialog" aria-modal="true" aria-labelledby={`${uid}-h`}>
        <header className="sheet-head">
          <h2 id={`${uid}-h`} className="sheet-title">
            Nudge {name}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close without sending" disabled={busy}>
            <Icon name="x" />
          </button>
        </header>
        <form className="sheet-body" onSubmit={submit}>
          {!online && (
            <p className="inline-note inline-note-warn" role="status">
              You’re offline. A nudge can be sent once you reconnect.
            </p>
          )}
          {error && (
            <p className="inline-note inline-note-error" role="alert">
              {error}
            </p>
          )}
          <div className="nudge-quick" role="group" aria-label="Quick nudges">
            {QUICK.map((q) => (
              <button key={q} type="button" className="chip-btn" disabled={busy || !online} onClick={() => void send(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor={`${uid}-t`}>Or write your own</label>
            <textarea
              id={`${uid}-t`}
              ref={area}
              className="input"
              rows={3}
              maxLength={MAX}
              value={text}
              placeholder={`A few words for ${name}…`}
              onChange={(e) => setText(e.target.value)}
              aria-describedby={`${uid}-n`}
            />
            <span id={`${uid}-n`} className="hint nudge-count">
              {text.length}/{MAX}
            </span>
          </div>
          <div className="sheet-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !online || !text.trim()}>
              <Icon name="heart" size={18} /> {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Home: the Nudge button, and the last few days' nudges with Reply. */
export function NudgeCard() {
  const { me, offline } = useStore();
  const online = useOnline();
  const { query } = useRoute();
  const { nudges, add } = useNudges();
  const [open, setOpen] = useState(false);
  const to = otherOf(me);
  const name = MEMBERS[to].name;
  const opened = query.get('nudge');
  const since = Date.now() - RECENT_DAYS * 86_400_000;
  const recent = (nudges ?? []).filter((n) => Date.parse(n.at) >= since || n.id === opened).slice(0, 3);
  if (!online || offline.copy) return null;

  return (
    <section className="nudge-card card" aria-label="Nudges">
      <button type="button" className="nudge-btn" onClick={() => setOpen(true)}>
        <span className="nudge-btn-icon" aria-hidden="true">
          <Icon name="heart" size={18} />
        </span>
        <span className="nudge-btn-text">Nudge {name}</span>
        <Icon name="chevron" size={17} className="row-chev" />
      </button>
      {recent.length > 0 && (
        <ul className="nudge-list">
          {recent.map((n) => {
            const mine = n.from === me;
            return (
              <li key={n.id} className={`nudge-item ${mine ? 'is-mine' : 'is-theirs'} ${n.id === opened ? 'is-opened' : ''}`}>
                <span className="nudge-meta">
                  {mine ? `You · ${timeAgo(n.at)} · ${n.delivered > 0 ? `on ${name}’s phone` : 'waiting in the app'}` : `${MEMBERS[n.from].name} · ${timeAgo(n.at)}`}
                </span>
                <span className="nudge-text">{n.text}</span>
                {!mine && (
                  <button type="button" className="btn btn-quiet btn-sm nudge-reply" onClick={() => setOpen(true)} aria-label={`Reply to ${MEMBERS[n.from].name}`}>
                    Reply
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && <NudgeSheet to={to} onClose={() => setOpen(false)} onSent={(r) => add(r.nudge)} />}
    </section>
  );
}
