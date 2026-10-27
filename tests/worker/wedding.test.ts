// The wedding on the server, and migration 0003 (which rebuilds the records table
// to allow the wedding kinds) run against a database filled through the real API
// on the 0002 schema: nothing may change, encrypted values included.
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
const vendor = (over: Record<string, unknown> = {}) => ({ name: 'Demo Florals', category: 'Florist', contact: '', phone: '', email: '', website: '', status: 'considering', deposit: 'none', notes: '', ...over });
const guest = (over: Record<string, unknown> = {}) => ({ name: 'Placeholder Guest', side: 'both', party: 1, rsvp: 'pending', table: '', meal: '', notes: '', ...over });
const wedding = (over: Record<string, unknown> = {}) => ({ date: '2027-06-12', time: '16:00', venue: 'Placeholder Hall', address: '', budget: 20000, schedule: '4:00 PM Ceremony', notes: '', ...over });

describe('migration 0003 keeps every existing row and encrypted value exactly', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof api>;
  before(async () => {
    w = await startLocalWorker({ migrateUpTo: '0002_events.sql' });
    c = api(w);
  });
  after(() => w.close());

  it('runs on a filled 0002 database without changing anything', async () => {
    await c.post('/api/records', { kind: 'credential', id: 'cred-a', data: { owner: 'jeffrey', type: 'DEA registration', issuer: '' } });
    assert.equal((await c.put('/api/protected/cred-a/number', { value: 'TEST-VALUE-0003' })).status, 200);
    await c.post('/api/records', { kind: 'home', id: 'home-a', data: { template: 'vehicle', title: 'Car', notes: '', fields: [{ id: 'f-p', label: 'Plate', kind: 'identifier', protected: true }] } });
    await c.put('/api/protected/home-a/f-p', { value: 'PLATE-0003' }, 'zul');
    await c.post('/api/records', { kind: 'event', id: 'ev-a', data: { title: 'Dinner', whose: 'both', date: '2026-11-05', location: '', notes: '', skips: [] } });
    await c.post('/api/records', { kind: 'task', id: 't-a', data: { seriesId: 't-a', title: 'Filter', assignee: 'both', due: '2026-11-06', status: 'open', notes: '', recurrence: { mode: 'schedule', every: 3, unit: 'month' } } });
    await c.post('/api/records', { kind: 'contact', id: 'contact-gone', data: { name: 'Old', role: '', category: 'Other', phone: '', fax: '', email: '', address: '', website: '', note: '', aliases: [] } });
    await c.del('/api/records/contact-gone?version=1');
    assert.equal((await c.post('/api/records', { kind: 'vendor', id: 'v-early', data: vendor() })).status, 500, 'the old schema refuses vendors');

    const snap = async () => ({
      records: (await w.db.prepare('SELECT * FROM records ORDER BY household_id, id').all()).results,
      protectedValues: (await w.db.prepare('SELECT * FROM protected_values ORDER BY record_id, slot').all()).results,
      audit: (await w.db.prepare('SELECT * FROM audit_events ORDER BY at').all()).results,
      households: (await w.db.prepare('SELECT * FROM households').all()).results,
    });
    const before = await snap();
    assert.equal(before.protectedValues.length, 2);

    assert.deepEqual(await applyMigrations(w.db, '0003_wedding.sql'), ['0003_wedding.sql']);
    assert.deepEqual(await snap(), before, 'every row identical, protected values included');

    assert.equal((await c.post('/api/protected/cred-a/number/reveal', {})).data.value, 'TEST-VALUE-0003');
    assert.equal((await c.post('/api/protected/home-a/f-p/reveal', {})).data.value, 'PLATE-0003');
    const fk = (await w.db.prepare("SELECT \"table\", on_delete FROM pragma_foreign_key_list('protected_values')").all()).results;
    assert.deepEqual(fk, [{ table: 'records', on_delete: 'CASCADE' }, { table: 'records', on_delete: 'CASCADE' }].slice(0, fk.length));
    const indexes = (await w.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'records' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);
    assert.deepEqual(indexes, ['records_live', 'records_parent', 'records_trash', 'records_with', 'task_series_due']);
    assert.equal(await w.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'protected_values_keep'").first(), null, 'scratch table removed');
    assert.equal((await c.post('/api/tasks/t-a/complete', {})).status, 200, 'task completion still works');
    assert.equal((await c.post('/api/restore', { ids: ['contact-gone'] })).status, 200, 'trash still restores');
    assert.equal((await c.post('/api/records', { kind: 'vendor', id: 'v-after', data: vendor() })).status, 201, 'vendors now accepted');
    assert.equal((await c.post('/api/records', { kind: 'wedding', id: 'wedding', data: wedding() })).status, 201, 'the wedding record too');
  });
});

describe('wedding records', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof api>;
  before(async () => {
    w = await startLocalWorker();
    c = api(w);
  });
  after(() => w.close());

  it('keeps one wedding record, with the fixed id', async () => {
    assert.equal((await c.post('/api/records', { kind: 'wedding', id: 'wedding-2', data: wedding() })).status, 400, 'any other id is refused');
    assert.equal((await c.post('/api/records', { kind: 'wedding', id: 'wedding', data: wedding() })).status, 201);
    assert.equal((await c.post('/api/records', { kind: 'wedding', id: 'wedding', data: wedding({ venue: 'Elsewhere' }) })).status, 409, 'a second one conflicts');
    assert.equal((await c.del('/api/records/wedding?version=1')).status, 400, 'and it cannot be trashed');
    const upd = await c.put('/api/records/wedding', { version: 1, data: wedding({ budget: 22000.456 }) }, 'zul');
    assert.equal(upd.status, 200);
    assert.equal(upd.data.rows[0].data.budget, 22000.46, 'amounts kept to cents');
    assert.equal((await c.put('/api/records/wedding', { version: 1, data: wedding() })).status, 409, 'a stale write is refused');
  });

  it('validates vendors, guests and budget lines, and drops a deposit date that no longer applies', async () => {
    assert.equal((await c.post('/api/records', { kind: 'vendor', id: 'v-1', data: vendor({ status: 'maybe' }) })).status, 400);
    assert.equal((await c.post('/api/records', { kind: 'vendor', id: 'v-1', data: vendor({ deposit: 'due', depositDue: '2027-05-01', status: 'booked' }) })).status, 201);
    const paid = await c.put('/api/records/v-1', { version: 1, data: vendor({ deposit: 'paid', depositDue: '2027-05-01', status: 'booked' }) });
    assert.equal(paid.status, 200);
    assert.equal(paid.data.rows[0].data.depositDue, undefined);
    assert.equal((await c.post('/api/records', { kind: 'guest', id: 'g-1', data: guest({ party: 0 }) })).status, 400);
    assert.equal((await c.post('/api/records', { kind: 'guest', id: 'g-1', data: guest({ party: 2, rsvp: 'yes' }) })).status, 201);
    assert.equal((await c.post('/api/records', { kind: 'budget', id: 'b-1', data: { title: 'Venue', category: '', planned: '8000', paid: 0, notes: '' } })).status, 400, 'amounts are numbers');
    assert.equal((await c.post('/api/records', { kind: 'budget', id: 'b-1', data: { title: 'Venue', category: '', planned: 8000, paid: 2000, notes: '' } })).status, 201);
  });

  it('a guest goes to the trash and comes back, like any record', async () => {
    assert.equal((await c.del('/api/records/g-1?version=1', 'zul')).status, 200);
    const trash = (await c.get('/api/trash')).data;
    assert.ok(trash.entries.some((e: { id: string; context: string }) => e.id === 'g-1' && e.context === 'Wedding guest'));
    assert.equal((await c.post('/api/restore', { ids: ['g-1'] })).status, 200);
    const state = (await c.get('/api/state')).data;
    assert.ok(state.rows.some((r: { id: string }) => r.id === 'g-1'));
  });
});
