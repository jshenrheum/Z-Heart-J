// Nudges on the server: subscribing a phone, sending a real Web Push that a phone
// could read (the test decrypts it and checks the VAPID signature, as a phone's
// notification service would), retries that never send twice, phones that have
// gone, validation, the 30-day clean-up, and migration 0005.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { applyMigrations, LOCAL_MEMBERS, startLocalWorker, type LocalWorker } from '../../tools/local-worker.ts';

type Who = 'jeffrey' | 'zul';
const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');
const unb64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));
const enc = new TextEncoder();

function api(w: LocalWorker) {
  const call = async (method: string, path: string, body?: unknown, who: Who = 'jeffrey') => {
    const res = await w.request(path, { method, as: LOCAL_MEMBERS[who], ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
  };
  return {
    get: (p: string, who?: Who) => call('GET', p, undefined, who),
    post: (p: string, b: unknown, who?: Who) => call('POST', p, b, who),
    put: (p: string, b: unknown, who?: Who) => call('PUT', p, b, who),
  };
}

/** A VAPID pair made fresh for this run only (local scaffolding, like the Access key). */
async function vapidPair() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return { publicKey: b64u(raw), privateKey: jwk.d!, verifyKey: pair.publicKey };
}

/** A phone: its ECDH keys and auth secret, as a browser makes them for a push subscription. */
async function phone(endpoint: string) {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { endpoint, keys: { p256dh: b64u(pub), auth: b64u(auth) }, priv: pair.privateKey, pub, auth };
}

const bs = (b: Uint8Array) => b as unknown as BufferSource;
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) {
  const k = await crypto.subtle.importKey('raw', bs(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: bs(salt), info: bs(info) }, k, n * 8));
}

/** What the phone does with a push it receives (RFC 8291, aes128gcm). */
async function decrypt(body: Uint8Array, p: Awaited<ReturnType<typeof phone>>) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20]!;
  const asPub = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);
  const asKey = await crypto.subtle.importKey('raw', bs(asPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, p.priv, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...p.pub, ...asPub]);
  const ikm = await hkdf(p.auth, ecdh, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', bs(cek), 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(nonce) }, key, bs(sealed)));
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
  return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
}

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

describe('nudges with notifications set up', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof api>;
  let keys: Awaited<ReturnType<typeof vapidPair>>;
  const pushes: Captured[] = [];
  const answer = new Map<string, number>(); // endpoint → status the stand-in service replies with
  let zulPhone: Awaited<ReturnType<typeof phone>>;

  before(async () => {
    keys = await vapidPair();
    w = await startLocalWorker({
      bindings: { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, PUSH_EXTRA_HOSTS: 'push.local.test' },
      outbound: async (req) => {
        if (new URL(req.url).host !== 'push.local.test') return null;
        pushes.push({ url: req.url, headers: Object.fromEntries(req.headers), body: new Uint8Array(await req.arrayBuffer()) });
        return new Response(null, { status: answer.get(req.url) ?? 201 });
      },
    });
    c = api(w);
    zulPhone = await phone('https://push.local.test/zul-phone');
  });
  after(() => w.close());

  it('says notifications are set up and gives the public key; nobody has a phone on yet', async () => {
    const r = await c.get('/api/push');
    assert.deepEqual(r.data, { configured: true, publicKey: keys.publicKey, myPhones: 0, other: { id: 'zul', name: 'Zul', phones: 0 } });
  });

  it('refuses a notification address that isn’t a real notification service, and bad keys', async () => {
    assert.equal((await c.put('/api/push/subscription', { endpoint: 'https://evil.example/x', keys: zulPhone.keys }, 'zul')).status, 400);
    assert.equal((await c.put('/api/push/subscription', { endpoint: 'http://web.push.apple.com/x', keys: zulPhone.keys }, 'zul')).status, 400, 'https only');
    assert.equal((await c.put('/api/push/subscription', { endpoint: zulPhone.endpoint, keys: { p256dh: 'abc', auth: zulPhone.keys.auth } }, 'zul')).status, 400);
  });

  it('a phone turning notifications on is saved under whoever is signed in', async () => {
    const r = await c.put('/api/push/subscription', { endpoint: zulPhone.endpoint, keys: zulPhone.keys }, 'zul');
    assert.equal(r.status, 200);
    assert.equal(r.data.myPhones, 1);
    assert.equal((await c.get('/api/push')).data.other.phones, 1, 'Jeffrey sees Zul has a phone on');
    assert.equal((await c.put('/api/push/subscription', { endpoint: zulPhone.endpoint, keys: zulPhone.keys }, 'zul')).data.myPhones, 1, 'again is no second phone');
  });

  it('a nudge reaches Zul’s phone, encrypted so only her phone can read it, signed by the app', async () => {
    const r = await c.post('/api/nudges', { id: 'n-1', text: '  Can you grab milk   on the way home? ' });
    assert.equal(r.status, 201);
    assert.equal(r.data.delivered, 1);
    assert.equal(r.data.nudge.text, 'Can you grab milk on the way home?', 'spaces tidied');
    assert.equal(r.data.nudge.to, 'zul');
    assert.equal(pushes.length, 1);
    const p = pushes[0]!;
    assert.equal(p.url, zulPhone.endpoint);
    assert.equal(p.headers['content-encoding'], 'aes128gcm');
    assert.equal(p.headers.ttl, '86400');
    assert.ok(!new TextDecoder().decode(p.body).includes('milk'), 'the words are not readable in transit');
    assert.deepEqual(await decrypt(p.body, zulPhone), { title: 'Jeffrey', body: 'Can you grab milk on the way home?', tag: 'nudge-n-1', url: '/?nudge=n-1' });

    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(p.headers.authorization!);
    assert.ok(m, p.headers.authorization);
    assert.equal(m![4], keys.publicKey);
    const claims = JSON.parse(Buffer.from(m![2]!, 'base64url').toString());
    assert.equal(claims.aud, 'https://push.local.test');
    assert.match(claims.sub, /^https:\/\//);
    assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.verifyKey, bs(unb64u(m![3]!)), bs(enc.encode(`${m![1]}.${m![2]}`)));
    assert.ok(ok, 'signature checks out with the public key');
  });

  it('a retry of the same nudge never sends it twice', async () => {
    const r = await c.post('/api/nudges', { id: 'n-1', text: 'Can you grab milk on the way home?' });
    assert.equal(r.status, 200);
    assert.equal(pushes.length, 1);
  });

  it('both of you see recent nudges, newest first', async () => {
    await c.post('/api/nudges', { id: 'n-2', text: 'On my way' }, 'zul');
    const r = await c.get('/api/nudges', 'zul');
    assert.deepEqual(r.data.nudges.map((n: { id: string; from: string }) => [n.id, n.from]), [['n-2', 'zul'], ['n-1', 'jeffrey']]);
    assert.equal(r.data.nudges[1].delivered, 1);
  });

  it('a nudge to someone without notifications on is saved, delivered to no phone, and says so', async () => {
    const r = await c.post('/api/nudges', { id: 'n-3', text: 'Call me when you can' }, 'zul');
    assert.equal(r.status, 201);
    assert.deepEqual([r.data.delivered, r.data.phones, r.data.configured], [0, 0, true]);
  });

  it('a phone that has turned notifications off is forgotten when its service says it’s gone', async () => {
    answer.set(zulPhone.endpoint, 410);
    const r = await c.post('/api/nudges', { id: 'n-4', text: 'Dinner at 7?' });
    assert.equal(r.data.delivered, 0);
    assert.equal((await c.get('/api/push', 'zul')).data.myPhones, 0);
  });

  it('turning notifications off removes only your own phone', async () => {
    answer.delete(zulPhone.endpoint);
    await c.put('/api/push/subscription', { endpoint: zulPhone.endpoint, keys: zulPhone.keys }, 'zul');
    await c.post('/api/push/unsubscribe', { endpoint: zulPhone.endpoint }, 'jeffrey');
    assert.equal((await c.get('/api/push', 'zul')).data.myPhones, 1, 'Jeffrey can’t remove Zul’s phone');
    await c.post('/api/push/unsubscribe', { endpoint: zulPhone.endpoint }, 'zul');
    assert.equal((await c.get('/api/push', 'zul')).data.myPhones, 0);
  });

  it('checks what is sent', async () => {
    assert.equal((await c.post('/api/nudges', { id: 'n-5', text: '   ' })).status, 400);
    assert.equal((await c.post('/api/nudges', { id: 'n-5', text: 'x'.repeat(201) })).status, 400);
    assert.equal((await c.post('/api/nudges', { id: 'bad id!', text: 'Hi' })).status, 400);
    assert.equal((await c.post('/api/nudges', { id: 'n-6', text: 'x'.repeat(200) })).status, 201);
  });

  it('nudges older than 30 days are removed by the daily clean-up', async () => {
    await w.db.prepare("INSERT INTO nudges (household_id, id, from_member, to_member, text, created_at) VALUES ('zj', 'n-old', 'jeffrey', 'zul', 'Old', '2020-01-01T00:00:00.000Z')").run();
    await (await w.mf.getWorker()).scheduled({ cron: '17 8 * * *' });
    const ids = (await c.get('/api/nudges')).data.nudges.map((n: { id: string }) => n.id);
    assert.ok(!ids.includes('n-old') && ids.includes('n-1'));
  });
});

describe('nudges before notifications are set up', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof api>;
  before(async () => {
    w = await startLocalWorker({ migrateUpTo: '0004_story.sql' });
    c = api(w);
  });
  after(() => w.close());

  it('migration 0005 adds its two tables and changes nothing else', async () => {
    await c.post('/api/records', { kind: 'contact', id: 'contact-a', data: { name: 'A', role: '', category: 'Other', phone: '', fax: '', email: '', address: '', website: '', note: '', aliases: [] } });
    const before = (await w.db.prepare('SELECT * FROM records ORDER BY id').all()).results;
    assert.deepEqual(await applyMigrations(w.db), ['0005_nudges.sql']);
    assert.deepEqual((await w.db.prepare('SELECT * FROM records ORDER BY id').all()).results, before);
  });

  it('says notifications aren’t set up; a phone can’t subscribe; a nudge is still saved for the app', async () => {
    assert.deepEqual((await c.get('/api/push')).data, { configured: false, publicKey: null, myPhones: 0, other: { id: 'zul', name: 'Zul', phones: 0 } });
    const p = await phone('https://web.push.apple.com/abc');
    assert.equal((await c.put('/api/push/subscription', { endpoint: p.endpoint, keys: p.keys }, 'zul')).status, 503);
    const r = await c.post('/api/nudges', { id: 'n-a', text: 'Hello' });
    assert.equal(r.status, 201);
    assert.deepEqual([r.data.delivered, r.data.configured], [0, false]);
    assert.equal((await c.get('/api/nudges', 'zul')).data.nudges[0].text, 'Hello');
  });
});
