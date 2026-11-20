import { useCallback, useEffect, useState } from 'react';
import type { PushStatus } from '../data/backend.ts';
import { useStore } from '../data/store.tsx';
import { useFeedback } from '../lib/feedback.tsx';
import { currentSubscription, makeKeys, permission, pushSupport, PushError, turnOff, turnOn } from '../lib/push.ts';
import { Icon } from './Icon.tsx';
import { Section } from './ui.tsx';

/**
 * Settings → Notifications. Says plainly what state this phone is in, and turns
 * notifications on or off for it. Until the server has its signing keys, it shows the
 * one-time setup, with a button that makes the keys on this device (never sent).
 */
export function NotificationsSettings() {
  const { backend } = useStore();
  const { copy } = useFeedback();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const support = pushSupport();
  const demo = backend.mode === 'demo';

  const refresh = useCallback(async () => {
    try {
      const [s, sub] = await Promise.all([backend.pushStatus(), support === 'ok' ? currentSubscription() : Promise.resolve(null)]);
      setStatus(s);
      setSubscribed(sub !== null && s.myPhones > 0);
    } catch {
      setStatus(null);
    }
  }, [backend, support]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const on = async () => {
    if (!status?.publicKey) return;
    setBusy(true);
    setNote(null);
    try {
      await backend.subscribePush(await turnOn(status.publicKey));
      setNote('Notifications are on for this phone.');
    } catch (e) {
      if (e instanceof PushError && e.message === 'blocked') setNote('Notifications are blocked for Z Heart J. Turn them on in the iPhone’s Settings → Notifications → Z Heart J, then try again.');
      else if (e instanceof PushError && e.message === 'dismissed') setNote('Notifications weren’t allowed, so nothing changed.');
      else setNote(e instanceof Error && e.message && !(e instanceof PushError) ? e.message : 'Notifications couldn’t be turned on. Try again.');
    }
    setBusy(false);
    void refresh();
  };
  const off = async () => {
    setBusy(true);
    setNote(null);
    try {
      const endpoint = await turnOff();
      if (endpoint) await backend.unsubscribePush(endpoint);
      setNote('Notifications are off for this phone.');
    } catch {
      setNote('Notifications couldn’t be turned off. Try again.');
    }
    setBusy(false);
    void refresh();
  };

  const other = status?.other;
  const otherLine = other && (other.phones > 0 ? `${other.name} has notifications on.` : `${other.name} hasn’t turned on notifications yet.`);

  return (
    <Section title="Notifications" id="notifications">
      <div className="card notify-card">
        {demo ? (
          <p className="muted">The demo preview never sends notifications. In the signed-in app, each of you can turn them on here to get nudges on your phone.</p>
        ) : status === null ? (
          <p className="muted">Checking…</p>
        ) : !status.configured ? (
          <>
            <p>Notifications aren’t set up yet. Nudges are still saved and show in the app.</p>
            <details className="notify-setup">
              <summary>Set up notifications (once)</summary>
              <ol className="notify-steps">
                <li>Tap <strong>Make keys</strong>. Two keys appear below, made on this device. They aren’t sent anywhere.</li>
                <li>
                  In Cloudflare: Workers &amp; Pages → <strong>z-heart-j</strong> → Settings → Variables and Secrets → Add, type <strong>Secret</strong>:
                  <br />
                  <code>VAPID_PUBLIC_KEY</code> = the public key, and <code>VAPID_PRIVATE_KEY</code> = the private key. Deploy if Cloudflare asks.
                </li>
                <li>Save the private key in your password manager as “Z ♥ J — VAPID_PRIVATE_KEY”. Don’t put it in a chat, an email, a note or a screenshot.</li>
                <li>Come back here and turn notifications on, each of you on your own phone.</li>
              </ol>
              {keys ? (
                <div className="notify-keys">
                  <div className="notify-key">
                    <span className="value-label">Public key</span>
                    <code className="notify-key-value">{keys.publicKey}</code>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copy('Public key', keys.publicKey)}>
                      <Icon name="copy" size={16} /> Copy
                    </button>
                  </div>
                  <div className="notify-key">
                    <span className="value-label">Private key</span>
                    <code className="notify-key-value">{keys.privateKey}</code>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copy('Private key', keys.privateKey)}>
                      <Icon name="copy" size={16} /> Copy
                    </button>
                  </div>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setKeys(null)}>
                    Hide the keys
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void makeKeys().then(setKeys)}>
                  Make keys
                </button>
              )}
            </details>
          </>
        ) : support === 'not-installed' ? (
          <p>To get nudges on this iPhone, open Z Heart J from its Home Screen icon (iOS 16.4 or later), then turn notifications on here.</p>
        ) : support === 'unsupported' ? (
          <p className="muted">This browser can’t show notifications from a web app.</p>
        ) : subscribed ? (
          <>
            <p>
              <Icon name="check" size={18} /> On for this phone. Nudges arrive as notifications.
            </p>
            <button type="button" className="btn btn-quiet" onClick={() => void off()} disabled={busy}>
              Turn off for this phone
            </button>
          </>
        ) : permission() === 'denied' ? (
          <p>Notifications are blocked for Z Heart J. Turn them on in the iPhone’s Settings → Notifications → Z Heart J, then come back here.</p>
        ) : (
          <>
            <p>Get nudges as notifications on this phone, even when the app is closed.</p>
            <button type="button" className="btn btn-primary" onClick={() => void on()} disabled={busy}>
              <Icon name="heart" size={18} /> {busy ? 'Turning on…' : 'Turn on notifications'}
            </button>
          </>
        )}
        {note && (
          <p className="inline-note" role="status">
            {note}
          </p>
        )}
        {!demo && status?.configured && otherLine && <p className="hint">{otherLine}</p>}
      </div>
    </Section>
  );
}
