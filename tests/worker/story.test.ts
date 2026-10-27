// Our story on the server: photo uploads and reads, moments that list them, the
// clean-up of unlisted photos, and migration 0004 on a filled 0003 database.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { applyMigrations, LOCAL_MEMBERS, startLocalWorker, type LocalWorker } from '../../tools/local-worker.ts';

type Who = 'jeffrey' | 'zul';
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
    del: (p: string, who?: Who) => call('DELETE', p, undefined, who),
  };
}

// The smallest real images of each kind (their first bytes are what the server checks).
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const bin = (b: Uint8Array) => b as unknown as BodyInit;
const upload = (w: LocalWorker, bytes: Uint8Array, type = 'image/jpeg', q = 'w=1600&h=1200', who: Who = 'jeffrey') =>
  w.request(`/api/photos?${q}`, { method: 'POST', as: LOCAL_MEMBERS[who], headers: { 'content-type': type }, body: bin(bytes) });
const moment = (over: Record<string, unknown> = {}) => ({ title: 'The day we met', date: '2023-04-08', place: 'Placeholder Café', story: '', photos: [], ...over });

describe('migration 0004 keeps every existing row and encrypted value exactly', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof api>;
  before(async () => {
    w = await startLocalWorker({ migrateUpTo: '0003_wedding.sql' });
    c = api(w);
  });
  after(() => w.close());

  it('runs on a filled 0003 database without changing anything', async () => {
    await c.post('/api/records', { kind: 'credential', id: 'cred-a', data: { owner: 'jeffrey', type: 'DEA registration', issuer: '' } });
    assert.equal((await c.put('/api/protected/cred-a/number', { value: 'TEST-VALUE-0004' })).status, 200);
    await c.post('/api/records', { kind: 'wedding', id: 'wedding', data: { date: '2027-06-12', venue: 'Placeholder Hall', address: '', schedule: '', notes: '' } });
    await c.post('/api/records', { kind: 'guest', id: 'g-a', data: { name: 'A', side: 'both', party: 2, rsvp: 'yes', table: '', meal: '', notes: '' } });
    await c.post('/api/records', { kind: 'contact', id: 'contact-gone', data: { name: 'Old', role: '', category: 'Other', phone: '', fax: '', email: '', address: '', website: '', note: '', aliases: [] } });
    await c.del('/api/records/contact-gone?version=1');
    assert.equal((await c.post('/api/records', { kind: 'moment', id: 'm-early', data: moment() })).status, 500, 'the old schema refuses moments');

    const snap = async () => ({
      records: (await w.db.prepare('SELECT * FROM records ORDER BY household_id, id').all()).results,
      protectedValues: (await w.db.prepare('SELECT * FROM protected_values ORDER BY record_id, slot').all()).results,
      audit: (await w.db.prepare('SELECT * FROM audit_events ORDER BY at').all()).results,
    });
    const before = await snap();
    assert.deepEqual(await applyMigrations(w.db), ['0004_story.sql']);
    assert.deepEqual(await snap(), before, 'every row identical, protected values included');
    assert.equal((await c.post('/api/protected/cred-a/number/reveal', {})).data.value, 'TEST-VALUE-0004');
    const indexes = (await w.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'records' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);
    assert.deepEqual(indexes, ['records_live', 'records_parent', 'records_trash', 'records_with', 'task_series_due']);
    assert.equal((await c.post('/api/restore', { ids: ['contact-gone'] })).status, 200, 'trash still restores');
    assert.equal((await c.post('/api/records', { kind: 'moment', id: 'm-after', data: moment() })).status, 201, 'moments now accepted');
  });
});

describe('photos and moments', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof api>;
  before(async () => {
    w = await startLocalWorker();
    c = api(w);
  });
  after(() => w.close());

  let photoId = '';
  it('uploads a photo and serves it back, privately cacheable', async () => {
    const res = await upload(w, JPEG);
    assert.equal(res.status, 201);
    const body = (await res.json()) as { id: string; w: number; h: number };
    assert.match(body.id, /^ph-[0-9a-f]{20}$/);
    assert.deepEqual([body.w, body.h], [1600, 1200]);
    photoId = body.id;
    const got = await w.request(`/api/photos/${photoId}`, { as: LOCAL_MEMBERS.zul });
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'image/jpeg');
    assert.equal(got.headers.get('cache-control'), 'private, max-age=31536000, immutable');
    assert.deepEqual(new Uint8Array(await got.arrayBuffer()), JPEG, 'the same bytes');
  });

  it('refuses the wrong type, a mismatched file, a missing size, too many bytes, no sign-in, and another site', async () => {
    assert.equal((await upload(w, JPEG, 'image/gif')).status, 415);
    assert.equal((await upload(w, PNG, 'image/jpeg')).status, 415, 'bytes must match the type');
    assert.equal((await upload(w, PNG, 'image/png')).status, 201, 'a real PNG is fine');
    assert.equal((await upload(w, JPEG, 'image/jpeg', 'w=0&h=10')).status, 400);
    const big = new Uint8Array(1_500_001);
    big.set(JPEG.subarray(0, 3));
    assert.equal((await upload(w, big)).status, 413);
    assert.equal((await w.request('/api/photos?w=1&h=1', { method: 'POST', as: null, headers: { 'content-type': 'image/jpeg' }, body: bin(JPEG) })).status, 401);
    assert.equal((await w.request('/api/photos?w=1&h=1', { method: 'POST', origin: 'https://evil.example', headers: { 'content-type': 'image/jpeg' }, body: bin(JPEG) })).status, 403);
    assert.equal((await w.request('/api/photos/ph-00000000000000000000')).status, 404);
  });

  it('a moment may list only uploaded photos, each once', async () => {
    assert.equal((await c.post('/api/records', { kind: 'moment', id: 'm-1', data: moment({ photos: [{ id: 'ph-11111111111111111111', w: 10, h: 10 }] }) })).status, 400, 'unknown photo');
    assert.equal((await c.post('/api/records', { kind: 'moment', id: 'm-1', data: moment({ photos: [{ id: photoId, w: 1600, h: 1200 }, { id: photoId, w: 1600, h: 1200 }] }) })).status, 400, 'twice');
    assert.equal((await c.post('/api/records', { kind: 'moment', id: 'm-1', data: moment({ date: '' }) })).status, 400, 'a moment needs its day');
    assert.equal((await c.post('/api/records', { kind: 'moment', id: 'm-1', data: moment({ photos: [{ id: photoId, w: 1600, h: 1200 }] }) })).status, 201);
    const upd = await c.put('/api/records/m-1', { version: 1, data: moment({ story: 'Coffee that became dinner.', photos: [{ id: photoId, w: 1600, h: 1200 }] }) }, 'zul');
    assert.equal(upd.status, 200);
  });

  it('the daily clean-up removes photos no moment lists, keeping those in moments (in the trash too)', async () => {
    const orphan = (await (await upload(w, JPEG)).json()) as { id: string };
    const kept = (await (await upload(w, JPEG)).json()) as { id: string };
    await c.post('/api/records', { kind: 'moment', id: 'm-2', data: moment({ title: 'First trip', photos: [{ id: kept.id, w: 1600, h: 1200 }] }) });
    assert.equal((await c.del('/api/records/m-2?version=1')).status, 200, 'the moment goes to the trash');
    // Make every photo look two days old, then let the clean-up run.
    await w.db.prepare("UPDATE photos SET created_at = '2000-01-01T00:00:00.000Z'").run();
    await c.get('/api/trash');
    const left = (await w.db.prepare('SELECT id FROM photos ORDER BY id').all<{ id: string }>()).results.map((r) => r.id);
    assert.ok(!left.includes(orphan.id), 'unlisted photo removed');
    assert.ok(left.includes(kept.id), 'a trashed moment keeps its photo');
    assert.ok(left.includes(photoId), 'a live moment keeps its photo');
  });
});
