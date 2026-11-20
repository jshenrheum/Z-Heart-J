/**
 * Notifications on this phone: whether they can work here, turning them on and off,
 * and (for the one-time setup) making the signing keys on this device.
 *
 * On an iPhone, a web app can show notifications only when opened from its Home
 * Screen icon (iOS 16.4 or later); in a Safari tab there is no PushManager at all.
 */

export type PushSupport = 'ok' | 'not-installed' | 'unsupported';

export function pushSupport(): PushSupport {
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (hasApis) return 'ok';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return ios ? 'not-installed' : 'unsupported';
}

export function permission(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'denied';
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  // The worker is registered on load; wait for it rather than registering a second time.
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const fromB64url = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const toB64url = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export class PushError extends Error {}

/** Asks the phone (it shows its own "Allow notifications?" prompt), then subscribes. */
export async function turnOn(publicKey: string): Promise<PushSubscriptionJSON> {
  const answer = await Notification.requestPermission();
  if (answer !== 'granted') throw new PushError(answer === 'denied' ? 'blocked' : 'dismissed');
  const reg = await registration();
  if (!reg) throw new PushError('no-worker');
  const key = fromB64url(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with different keys can't receive these notifications.
  if (sub && toB64url(new Uint8Array(sub.options.applicationServerKey ?? new ArrayBuffer(0))) !== publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as unknown as BufferSource });
  return sub.toJSON();
}

export async function turnOff(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

/**
 * The one-time setup: a fresh signing key pair, made on this device and shown only
 * here, for the owner to paste into Cloudflare as two secrets. Never sent anywhere.
 */
export async function makeKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: toB64url(raw), privateKey: jwk.d! };
}
