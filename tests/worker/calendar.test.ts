// Calendar on the server, and migration 0002 (which rebuilds the records table to
// allow the 'event' kind) run against a database filled through the real API on
// the 0001 schema: nothing may change, encrypted values included.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Row } from '../../src/lib/records.ts';
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
const contact = (name: string) => ({ name, role: '', category: 'Other', phone: '', fax: '', email: '', address: '', website: '', note: '', aliases: [] });
const event = (over: Record<string, unknown> = {}) => ({ title: 'Dinner', whose: 'both', date: '2026-11-05', startTime: '19:30', endTime: '21:00', location: '1 Placeholder Lane', notes: '', skips: [], ...over });

describe('migration 0002 keeps every existing row and encrypted value exactly', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof api>;
  before(async () => {
    w = await startLocalWorker({ migrateUpTo: '0001_init.sql' });
    c = api(w);
  });
  after(() => w.close());

  it('runs on a filled 0001 database without changing anything', async () => {
    // Fill it the way the app does, on the old schema.
    await c.post('/api/records', { kind: 'credential', id: 'cred-a', data: { owner: 'jeffrey', type: 'DEA registration', issuer: '' } });
    assert.equal((await c.put('/api/protected/cred-a/number', { value: 'TEST-VALUE-0002' })).status, 200);
    await c.post('/api/records', { kind: 'home', id: 'home-a', data: { template: 'vehicle', title: 'Car', notes: '', fields: [{ id: 'f-p', label: 'Plate', kind: 'identifier', protected: true }] } });
    await c.put('/api/protected/home-a/f-p', { value: 'PLATE-0002' }, 'zul');
    await c.post('/api/records', { kind: 'list', id: 'list-a', data: { title: 'Groceries', description: '' } });
    await c.post('/api/records', { kind: 'item', id: 'item-a', parentId: 'list-a', data: { name: 'Milk', qty: '', note: '', checked: false, position: 1 } });
    await c.post('/api/records', { kind: 'task', id: 't-a', data: { seriesId: 't-a', title: 'Filter', assignee: 'both', due: '2026-11-06', status: 'open', notes: '', recurrence: { mode: 'schedule', every: 3, unit: 'month' } } });
    await c.post('/api/records', { kind: 'contact', id: 'contact-gone', data: contact('Old') });
    await c.del('/api/records/contact-gone?version=1');
    assert.equal((await c.post('/api/records', { kind: 'event', id: 'ev-early', data: event() })).status, 500, 'the old schema refuses events');

    const snap = async () => ({
      records: (await w.db.prepare('SELECT * FROM records ORDER BY household_id, id').all()).results,
      protectedValues: (await w.db.prepare('SELECT * FROM protected_values ORDER BY record_id, slot').all()).results,
      audit: (await w.db.prepare('SELECT * FROM audit_events ORDER BY at').all()).results,
      households: (await w.db.prepare('SELECT * FROM households').all()).results,
    });
    const before = await snap();
    assert.equal(before.protectedValues.length, 2);

    assert.deepEqual(await applyMigrations(w.db, '0002_events.sql'), ['0002_events.sql']);
    assert.deepEqual(await snap(), before, 'every row identical, protected values included');

    // Still decrypts (same ciphertext, same place), and the schema still behaves.
    assert.equal((await c.post('/api/protected/cred-a/number/reveal', {})).data.value, 'TEST-VALUE-0002');
    assert.equal((await c.post('/api/protected/home-a/f-p/reveal', {})).data.value, 'PLATE-0002');
    const fk = (await w.db.prepare("SELECT \"table\", on_delete FROM pragma_foreign_key_list('protected_values')").all()).results;
    assert.deepEqual(fk, [{ table: 'records', on_delete: 'CASCADE' }, { table: 'records', on_delete: 'CASCADE' }].slice(0, fk.length));
    const indexes = (await w.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'records' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);
    assert.deepEqual(indexes, ['records_live', 'records_parent', 'records_trash', 'records_with', 'task_series_due']);
    assert.equal(await w.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'protected_values_keep'").first(), null, 'scratch table removed');
    const done = await c.post('/api/tasks/t-a/complete', {});
    assert.equal(done.status, 200, 'task completion still works');
    assert.equal((await c.post('/api/restore', { ids: ['contact-gone'] })).status, 200, 'trash still restores');
    assert.equal((await c.post('/api/records', { kind: 'event', id: 'ev-after', data: event() })).status, 201, 'events now accepted');
  });
});

describe('calendar events', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof api>;
  before(async () => {
    w = await startLocalWorker();
    c = api(w);
  });
  after(() => w.close());

  it('an event saved by one of you is seen by the other, attributed by the server', async () => {
    assert.equal((await c.post('/api/records', { kind: 'event', id: 'ev-1', data: event({ whose: 'zul', repeat: { every: 1, unit: 'week' } }) }, 'zul')).status, 201);
    const rows = (await c.get('/api/state')).data.rows as Row[];
    const ev = rows.find((r) => r.id === 'ev-1')!;
    assert.equal(ev.kind, 'event');
    assert.equal(ev.createdBy, 'zul');
    assert.deepEqual(ev.data.repeat, { every: 1, unit: 'week' });
  });

  it('refuses events whose times or dates don’t make sense', async () => {
    for (const bad of [event({ endTime: '18:00' }), event({ startTime: '25:00' }), event({ date: '2026-02-30' }), event({ whose: 'someone' }), event({ startTime: undefined, endTime: undefined, endDate: '2026-11-01' })]) {
      assert.equal((await c.post('/api/records', { kind: 'event', id: 'ev-bad', data: bad })).status, 400, JSON.stringify(bad));
    }
  });

  it('removing one day of a repeat is a versioned edit; the whole series goes to the trash', async () => {
    const ev = ((await c.get('/api/state')).data.rows as Row[]).find((r) => r.id === 'ev-1')!;
    const r = await c.put('/api/records/ev-1', { version: ev.version, data: { ...ev.data, skips: ['2026-11-12'] } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.rows[0].data.skips, ['2026-11-12']);
    assert.equal((await c.put('/api/records/ev-1', { version: ev.version, data: { ...ev.data, title: 'Stale' } }, 'zul')).status, 409);
    assert.equal((await c.del(`/api/records/ev-1?version=${r.data.rows[0].version}`)).status, 200);
    const trash = (await c.get('/api/trash')).data.entries;
    assert.equal(trash[0].context, 'Calendar event');
  });
});
