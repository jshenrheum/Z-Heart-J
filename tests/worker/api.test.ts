// Worker tests: the real Worker in workerd (Miniflare) with a real local D1 and
// locally signed Access tokens. See tools/local-worker.ts.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { addDays, todayIn } from '../../src/lib/dates.ts';
import type { Row } from '../../src/lib/records.ts';
import { accessIssuer, LOCAL_MEMBERS, startLocalWorker, type LocalWorker } from '../../tools/local-worker.ts';

type Who = 'jeffrey' | 'zul';
const J = LOCAL_MEMBERS.jeffrey;
const Z = LOCAL_MEMBERS.zul;

function client(w: LocalWorker) {
  const call = async (method: string, path: string, body?: unknown, who: Who = 'jeffrey', headers: Record<string, string> = {}) => {
    const res = await w.request(path, { method, as: LOCAL_MEMBERS[who], headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, headers: res.headers, data, text };
  };
  return {
    get: (path: string, who?: Who, headers?: Record<string, string>) => call('GET', path, undefined, who, headers),
    post: (path: string, body: unknown, who?: Who) => call('POST', path, body, who),
    put: (path: string, body: unknown, who?: Who) => call('PUT', path, body, who),
    del: (path: string, who?: Who) => call('DELETE', path, undefined, who),
    async state(who: Who = 'jeffrey') {
      return (await call('GET', '/api/state', undefined, who)).data as { rev: number; me: Who; rows: Row[] };
    },
    async row(id: string, who: Who = 'jeffrey') {
      return (await this.state(who)).rows.find((r) => r.id === id);
    },
  };
}

const contact = (over: Record<string, unknown> = {}) => ({
  name: 'Test Plumbing', role: '', category: 'Maintenance provider', phone: '(555) 010-0900', fax: '', email: '', address: '', website: '', note: '', aliases: [], ...over,
});
const task = (id: string, over: Record<string, unknown> = {}) => ({ seriesId: id, title: 'Change the filter', assignee: 'both', status: 'open', notes: '', ...over });

// ------------------------------------------------------------------ sign-in

describe('sign-in (Cloudflare Access token, checked on every request)', () => {
  let w: LocalWorker;
  before(async () => {
    w = await startLocalWorker();
  });
  after(() => w.close());

  it('refuses API calls and pages without a token', async () => {
    const api = await w.request('/api/state', { as: null });
    assert.equal(api.status, 401);
    assert.equal((await api.json() as { error: string }).error, 'unauthenticated');
    const page = await w.request('/', { as: null, headers: { accept: 'text/html' } });
    assert.equal(page.status, 401);
    assert.match(await page.text(), /Sign in to continue/);
    const asset = await w.request('/manifest.webmanifest', { as: null });
    assert.equal(asset.status, 401, 'static files also need sign-in');
  });

  it('maps each allowed email to its member and nobody else', async () => {
    const c = client(w);
    assert.equal((await c.state('jeffrey')).me, 'jeffrey');
    assert.equal((await c.state('zul')).me, 'zul');
    const stranger = await w.request('/api/state', { as: 'someone@else.test' });
    assert.equal(stranger.status, 403);
    const upper = await w.request('/api/state', { as: J.toUpperCase() });
    assert.equal(upper.status, 200, 'email comparison ignores case');
  });

  it('rejects forged, mis-addressed, expired and incomplete tokens', async () => {
    const other = await accessIssuer(w.issuer.team, w.issuer.aud); // right claims, wrong signing key
    const now = Math.floor(Date.now() / 1000);
    const cases: Array<[string, string]> = [
      ['signed by another key', await other.sign(J)],
      ['wrong audience', await w.issuer.sign(J, { aud: 'someone-elses-app' })],
      ['wrong issuer', await w.issuer.sign(J, { iss: 'https://evil.cloudflareaccess.com' })],
      ['expired', await w.issuer.sign(J, { exp: now - 3600 })],
      ['not yet valid', await w.issuer.sign(J, { nbf: now + 3600 })],
      ['unknown key id', await w.issuer.sign(J, { kid: 'nope' })],
      ['service token (no email)', await w.issuer.sign(J, { noEmail: true })],
      ['garbage', 'not.a.token'],
      ['alg none', `${Buffer.from('{"alg":"none","kid":"x"}').toString('base64url')}.${Buffer.from(JSON.stringify({ email: J })).toString('base64url')}.`],
    ];
    for (const [name, token] of cases) {
      const res = await w.request('/api/state', { token });
      assert.equal(res.status, 401, name);
    }
  });

  it('ignores identity claims from the browser', async () => {
    const res = await w.request('/api/state', { as: J, headers: { 'x-member': 'zul', 'cf-access-authenticated-user-email': Z } });
    assert.equal((await res.json() as { me: string }).me, 'jeffrey');
    const c = client(w);
    const r = await c.post('/api/records', { kind: 'contact', id: 'contact-ident', data: { ...contact(), updatedBy: 'zul' } });
    assert.equal(r.status, 400, 'audit fields are not accepted from clients');
  });
});

describe('setup that is missing or wrong fails closed', () => {
  const cases: Array<[string, Record<string, string | undefined>, RegExp]> = [
    ['no MEMBER_EMAILS', { MEMBER_EMAILS: undefined }, /MEMBER_EMAILS is not set/],
    ['one member only', { MEMBER_EMAILS: `jeffrey:${J}` }, /one email for each/],
    ['same member twice', { MEMBER_EMAILS: `jeffrey:${J},jeffrey:${Z}` }, /one email for each/],
    ['placeholder team domain', { ACCESS_TEAM_DOMAIN: 'REPLACE_WITH_ACCESS_TEAM_DOMAIN' }, /must be <team>\.cloudflareaccess\.com/],
    ['no audience', { ACCESS_AUD: undefined }, /ACCESS_AUD is not set/],
  ];
  for (const [name, bindings, message] of cases) {
    it(name, async () => {
      const w = await startLocalWorker({ bindings });
      try {
        const res = await w.request('/api/state');
        assert.equal(res.status, 503);
        assert.match((await res.json() as { message: string }).message, message);
      } finally {
        await w.close();
      }
    });
  }
});

// ------------------------------------------------------------------ headers and routing

describe('headers and request hygiene', () => {
  let w: LocalWorker;
  before(async () => {
    w = await startLocalWorker();
  });
  after(() => w.close());

  it('sends the CSP (with frame-ancestors) and security headers on pages, assets and API', async () => {
    for (const path of ['/', '/lists/groceries', '/manifest.webmanifest', '/api/state', '/api/nope']) {
      const res = await w.request(path, { headers: { accept: 'text/html' } });
      const csp = res.headers.get('content-security-policy') ?? '';
      assert.match(csp, /default-src 'self'/, path);
      assert.match(csp, /script-src 'self'(;|$)/, path);
      assert.match(csp, /frame-ancestors 'none'/, path);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    }
    assert.equal((await w.request('/api/state')).headers.get('cache-control'), 'no-store');
    assert.equal((await w.request('/')).headers.get('cache-control'), 'no-cache');
  });

  it('serves the app shell for app routes (SPA fallback)', async () => {
    const res = await w.request('/plans/p/anything', { headers: { accept: 'text/html' } });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<div id="root">/);
  });

  it('refuses cross-site writes, non-JSON bodies, unknown routes and wrong methods', async () => {
    const body = JSON.stringify({ kind: 'list', id: 'list-x', data: { title: 'X', description: '' } });
    assert.equal((await w.request('/api/records', { method: 'POST', body, origin: 'https://evil.example' })).status, 403);
    assert.equal((await w.request('/api/records', { method: 'POST', body, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await w.request('/api/records', { method: 'POST', body, headers: { 'content-type': 'text/plain' } })).status, 415);
    assert.equal((await w.request('/api/nothing-here')).status, 404);
    assert.equal((await w.request('/api/state', { method: 'DELETE' })).status, 405);
    assert.equal((await w.request('/lists', { method: 'POST', body: '{}' })).status, 405);
  });
});

// ------------------------------------------------------------------ records

describe('records: create, validate, versioned update, household scope', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof client>;
  before(async () => {
    w = await startLocalWorker();
    c = client(w);
  });
  after(() => w.close());

  it('creates a record both members see, attributed by the server', async () => {
    const r = await c.post('/api/records', { kind: 'contact', id: 'contact-a', data: contact() });
    assert.equal(r.status, 201);
    const row = (await c.row('contact-a', 'zul'))!;
    assert.equal(row.version, 1);
    assert.equal(row.createdBy, 'jeffrey');
    assert.equal(row.data.name, 'Test Plumbing');
  });

  it('answers a retried create, refuses a different one with the same id', async () => {
    assert.equal((await c.post('/api/records', { kind: 'contact', id: 'contact-a', data: contact() })).status, 200);
    assert.equal((await c.post('/api/records', { kind: 'contact', id: 'contact-a', data: contact({ name: 'Other' }) })).status, 409);
  });

  it('validates every kind on the server (allowlist, formats, protected fields)', async () => {
    const bad: Array<[string, unknown]> = [
      ['unknown field', { kind: 'contact', id: 'contact-b', data: { ...contact(), secret: 'x' } }],
      ['bad phone', { kind: 'contact', id: 'contact-b', data: contact({ phone: 'call me' }) }],
      ['javascript: url', { kind: 'contact', id: 'contact-b', data: contact({ website: 'javascript:alert(1)' }) }],
      ['missing required', { kind: 'list', id: 'list-b', data: { title: '  ', description: '' } }],
      ['protected field carrying a value', { kind: 'home', id: 'home-b', data: { template: 'other', title: 'Bank', notes: '', fields: [{ id: 'f-1', label: 'Account', kind: 'identifier', protected: true, value: '1234' }] } }],
      ['task created already done', { kind: 'task', id: 't-b', data: task('t-b', { status: 'done', completedOn: todayIn() }) }],
      ['task in someone else’s series', { kind: 'task', id: 't-c', data: task('t-other') }],
      ['item without a list', { kind: 'item', id: 'i-b', data: { name: 'Tea', qty: '', note: '', checked: false, position: 1 } }],
      ['profile via create', { kind: 'profile', id: 'zul', data: { displayName: 'Z', specialty: '', organization: '', npi: '' } }],
      ['bad id', { kind: 'list', id: '../etc', data: { title: 'X', description: '' } }],
      ['bad date', { kind: 'credential', id: 'cred-b', data: { owner: 'zul', type: 'License', issuer: '', expires: '2026-02-30' } }],
    ];
    for (const [name, body] of bad) assert.equal((await c.post('/api/records', body)).status, 400, name);
  });

  it('applies an update from the current version and bumps it', async () => {
    const r = await c.put('/api/records/contact-a', { version: 1, data: contact({ note: 'Zul’s note' }) }, 'zul');
    assert.equal(r.status, 200);
    const row = r.data.rows[0] as Row;
    assert.equal(row.version, 2);
    assert.equal(row.updatedBy, 'zul');
    assert.equal(row.createdBy, 'jeffrey');
  });

  it('answers a stale write with 409 and the current record', async () => {
    const r = await c.put('/api/records/contact-a', { version: 1, data: contact({ note: 'Jeffrey’s older edit' }) });
    assert.equal(r.status, 409);
    assert.equal(r.data.error, 'conflict');
    assert.equal(r.data.current.version, 2);
    assert.equal(r.data.current.data.note, 'Zul’s note');
  });

  it('treats a retry of an already-applied update as success, not a conflict', async () => {
    const r = await c.put('/api/records/contact-a', { version: 1, data: contact({ note: 'Zul’s note' }) }, 'zul');
    assert.equal(r.status, 200);
    assert.equal((r.data.rows[0] as Row).version, 2);
  });

  it('keeps a location’s owner and a task’s status out of ordinary edits', async () => {
    await c.post('/api/records', { kind: 'location', id: 'loc-a', data: { owner: 'zul', label: 'Clinic', organization: '', address: '', mainPhone: '', directPhone: '', fax: '', schedulingPhone: '', notes: '' } });
    const loc = await c.put('/api/records/loc-a', { version: 1, data: { owner: 'jeffrey', label: 'Clinic 2', organization: '', address: '', mainPhone: '', directPhone: '', fax: '', schedulingPhone: '', notes: '' } });
    assert.equal(loc.data.rows[0].data.owner, 'zul');
    await c.post('/api/records', { kind: 'task', id: 't-a', data: task('t-a') });
    const t = await c.put('/api/records/t-a', { version: 1, data: task('t-a', { title: 'Renamed', status: 'done', completedOn: todayIn() }) });
    assert.equal(t.status, 200);
    assert.equal(t.data.rows[0].data.status, 'open');
    assert.equal(t.data.rows[0].data.title, 'Renamed');
  });

  it('never shows or touches another household’s rows', async () => {
    const at = new Date().toISOString();
    await w.db.prepare("INSERT INTO households (id, rev, created_at) VALUES ('other', 0, ?)").bind(at).run();
    await w.db
      .prepare("INSERT INTO records (household_id, id, kind, data, created_by, created_at, updated_by, updated_at) VALUES ('other', 'contact-other', 'contact', ?, 'zul', ?, 'zul', ?)")
      .bind(JSON.stringify(contact({ name: 'Elsewhere' })), at, at)
      .run();
    assert.equal(await c.row('contact-other'), undefined);
    assert.equal((await c.put('/api/records/contact-other', { version: 1, data: contact() })).status, 404);
    assert.equal((await c.del('/api/records/contact-other?version=1')).status, 404);
    assert.equal((await c.post('/api/restore', { ids: ['contact-other'] })).status, 404);
  });
});

// ------------------------------------------------------------------ trash

describe('trash: soft delete, cascade, restore, 30-day purge', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof client>;
  before(async () => {
    w = await startLocalWorker();
    c = client(w);
    await c.post('/api/records', { kind: 'list', id: 'list-t', data: { title: 'Hardware', description: '' } });
    for (const [i, name] of ['Nails', 'Glue', 'Tape'].entries()) {
      await c.post('/api/records', { kind: 'item', id: `item-t${i}`, parentId: 'list-t', data: { name, qty: '', note: '', checked: false, position: i } });
    }
  });
  after(() => w.close());

  it('refuses a delete based on a stale version', async () => {
    assert.equal((await c.del('/api/records/list-t?version=7')).status, 409);
  });

  it('moves a list and its items to the trash together', async () => {
    const r = await c.del('/api/records/list-t?version=1');
    assert.equal(r.status, 200);
    assert.deepEqual([...r.data.removed].sort(), ['item-t0', 'item-t1', 'item-t2', 'list-t']);
    const s = await c.state('zul');
    assert.ok(!s.rows.some((x) => x.id.startsWith('item-t') || x.id === 'list-t'));
    const trash = await c.get('/api/trash');
    assert.equal(trash.data.entries.length, 1, 'items that went with their list are not listed separately');
    assert.equal(trash.data.entries[0].context, 'List · with 3 items');
    assert.equal(trash.data.entries[0].deletedBy, 'jeffrey');
  });

  it('a repeated delete (first answer lost) succeeds instead of failing', async () => {
    const r = await c.del('/api/records/list-t?version=1');
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.removed, ['list-t']);
  });

  it('won’t restore an item on its own while its list is in the trash', async () => {
    assert.equal((await c.post('/api/restore', { ids: ['item-t0'] })).status, 409);
  });

  it('restores the list with its items', async () => {
    const r = await c.post('/api/restore', { ids: ['list-t'] });
    assert.equal(r.status, 200);
    assert.equal((r.data.rows as Row[]).length, 4);
    assert.equal((await c.get('/api/trash')).data.entries.length, 0);
  });

  it('purges for good after 30 days, protected values included', async () => {
    await c.post('/api/records', { kind: 'credential', id: 'cred-old', data: { owner: 'jeffrey', type: 'Old license', issuer: '' } });
    assert.equal((await c.put('/api/protected/cred-old/number', { value: 'OLD-123' })).status, 200);
    assert.equal((await c.del('/api/records/cred-old?version=1')).status, 200);
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    await w.db.prepare("UPDATE records SET deleted_at = ? WHERE id = 'cred-old'").bind(days(31)).run();
    await c.get('/api/trash');
    assert.equal(await w.db.prepare("SELECT 1 FROM records WHERE id = 'cred-old'").first(), null);
    assert.equal(await w.db.prepare("SELECT 1 FROM protected_values WHERE record_id = 'cred-old'").first(), null);
  });

  it('the daily schedule purges too', async () => {
    await c.post('/api/records', { kind: 'contact', id: 'contact-old', data: contact() });
    await c.del('/api/records/contact-old?version=1');
    await w.db.prepare("UPDATE records SET deleted_at = ? WHERE id = 'contact-old'").bind(new Date(Date.now() - 40 * 86_400_000).toISOString()).run();
    const worker = await w.mf.getWorker();
    await worker.scheduled({ cron: '17 8 * * *' });
    assert.equal(await w.db.prepare("SELECT 1 FROM records WHERE id = 'contact-old'").first(), null);
  });
});

// ------------------------------------------------------------------ tasks

describe('tasks: idempotent completion, one next occurrence, undo', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof client>;
  const today = todayIn();
  const seriesCount = async (series: string) => (await c.state()).rows.filter((r) => r.kind === 'task' && r.data.seriesId === series).length;
  before(async () => {
    w = await startLocalWorker();
    c = client(w);
  });
  after(() => w.close());

  it('completing creates the next occurrence once, however often it is repeated', async () => {
    await c.post('/api/records', { kind: 'task', id: 't-rec', data: task('t-rec', { due: addDays(today, -1), recurrence: { mode: 'schedule', every: 1, unit: 'month' } }) });
    const first = await c.post('/api/tasks/t-rec/complete', {});
    assert.equal(first.status, 200);
    const rows = first.data.rows as Row[];
    const done = rows.find((r) => r.id === 't-rec')!;
    const next = rows.find((r) => r.id !== 't-rec')!;
    assert.equal(done.data.status, 'done');
    assert.equal(done.data.completedOn, today, 'completion day is the household’s today, decided by the server');
    assert.equal(next.data.createdFrom, 't-rec');
    assert.equal(next.data.seriesId, 't-rec');
    assert.equal(next.version, 1);
    assert.equal((await c.post('/api/tasks/t-rec/complete', {})).status, 200);
    assert.equal((await c.post('/api/tasks/t-rec/complete', {}, 'zul')).status, 200);
    assert.equal(await seriesCount('t-rec'), 2);
  });

  it('two phones completing at the same moment still make exactly one next occurrence', async () => {
    await c.post('/api/records', { kind: 'task', id: 't-race', data: task('t-race', { due: today, recurrence: { mode: 'after_completion', every: 3, unit: 'month' } }) });
    const results = await Promise.all([c.post('/api/tasks/t-race/complete', {}, 'jeffrey'), c.post('/api/tasks/t-race/complete', {}, 'zul'), c.post('/api/tasks/t-race/complete', {})]);
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
    assert.equal(await seriesCount('t-race'), 2);
  });

  it('undo takes back an untouched next occurrence', async () => {
    const r = await c.post('/api/tasks/t-rec/reopen', {});
    assert.equal(r.status, 200);
    assert.equal(r.data.rows[0].data.status, 'open');
    assert.equal(r.data.removed.length, 1);
    assert.equal(await seriesCount('t-rec'), 1);
  });

  it('undo keeps a next occurrence someone has already edited', async () => {
    const done = await c.post('/api/tasks/t-rec/complete', {});
    const next = (done.data.rows as Row[]).find((x) => x.id !== 't-rec')!;
    assert.equal((await c.put(`/api/records/${next.id}`, { version: 1, data: { ...next.data, notes: 'Bought the filter' } }, 'zul')).status, 200);
    const r = await c.post('/api/tasks/t-rec/reopen', {});
    assert.deepEqual(r.data.removed, []);
    assert.equal(await seriesCount('t-rec'), 2);
  });
});

// ------------------------------------------------------------------ lists and pins

describe('lists and pins', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof client>;
  before(async () => {
    w = await startLocalWorker();
    c = client(w);
    await c.post('/api/records', { kind: 'list', id: 'list-g', data: { title: 'Groceries', description: '' } });
    for (const [i, [name, checked]] of ([['Milk', true], ['Eggs', true], ['Tea', false]] as const).entries()) {
      await c.post('/api/records', { kind: 'item', id: `item-g${i}`, parentId: 'list-g', data: { name, qty: '', note: '', checked, position: i } });
    }
  });
  after(() => w.close());

  it('clear checked removes only items still checked and unchanged', async () => {
    const eggs = (await c.row('item-g1'))!;
    await c.put('/api/records/item-g1', { version: 1, data: { ...eggs.data, checked: false } }, 'zul'); // Zul unchecks Eggs meanwhile
    const r = await c.post('/api/lists/list-g/clear-checked', { items: [{ id: 'item-g0', version: 1 }, { id: 'item-g1', version: 1 }, { id: 'item-g2', version: 1 }] });
    assert.deepEqual(r.data.removed, ['item-g0']);
    assert.deepEqual((r.data.rows as Row[]).map((x) => x.id).sort(), ['item-g1', 'item-g2']);
    assert.equal((await c.post('/api/restore', { ids: ['item-g0'] })).status, 200, 'Undo brings it back');
  });

  it('pins belong to whoever set them', async () => {
    const r = await c.put('/api/pins', { targets: [{ kind: 'list', id: 'list-g' }] });
    assert.equal(r.status, 200);
    assert.deepEqual((await c.row('pins-jeffrey'))!.data.targets, [{ kind: 'list', id: 'list-g' }]);
    assert.equal(await c.row('pins-jeffrey', 'zul'), undefined, 'Zul never receives Jeffrey’s pins');
    assert.deepEqual((await c.row('pins-zul', 'zul'))!.data.targets, []);
    const seven = Array.from({ length: 7 }, (_, i) => ({ kind: 'list', id: `list-${i}` }));
    assert.equal((await c.put('/api/pins', { targets: seven })).status, 400);
    assert.equal((await c.put('/api/pins', { targets: [{ kind: 'list', id: 'list-g' }, { kind: 'list', id: 'list-g' }] })).status, 400);
  });

  it('quiet refresh: unchanged state answers 304; a change by the other member doesn’t', async () => {
    const first = await c.get('/api/state');
    const etag = first.headers.get('etag')!;
    assert.equal((await c.get('/api/state', 'jeffrey', { 'if-none-match': etag })).status, 304);
    await c.post('/api/records', { kind: 'item', id: 'item-new', parentId: 'list-g', data: { name: 'Bread', qty: '', note: '', checked: false, position: 9 } }, 'zul');
    const after = await c.get('/api/state', 'jeffrey', { 'if-none-match': etag });
    assert.equal(after.status, 200);
    assert.ok((after.data.rows as Row[]).some((x) => x.id === 'item-new'));
  });
});

// ------------------------------------------------------------------ protected values

describe('protected values: encrypted at rest, revealed only on request', () => {
  let w: LocalWorker;
  let c: ReturnType<typeof client>;
  const SECRET = 'AB1234563';
  before(async () => {
    w = await startLocalWorker();
    c = client(w);
    await c.post('/api/records', { kind: 'credential', id: 'cred-dea', data: { owner: 'jeffrey', type: 'DEA registration', issuer: 'Issuer' } });
    await c.post('/api/records', {
      kind: 'home', id: 'home-car', data: { template: 'vehicle', title: 'Car', notes: '', fields: [{ id: 'f-make', label: 'Make', kind: 'text', value: 'Sedan' }, { id: 'f-plate', label: 'Plate', kind: 'identifier', protected: true }] },
    });
  });
  after(() => w.close());

  it('saves encrypted; the record only says a value exists', async () => {
    const r = await c.put('/api/protected/cred-dea/number', { value: SECRET });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.rows[0].stored, ['number']);
    const raw = await w.db.prepare("SELECT iv, ciphertext, key_id FROM protected_values WHERE record_id = 'cred-dea'").first<{ iv: string; ciphertext: string; key_id: string }>();
    assert.ok(raw && raw.iv && raw.ciphertext && raw.key_id);
    assert.ok(!Buffer.from(raw.ciphertext, 'base64').toString('latin1').includes(SECRET), 'ciphertext is not the value');
  });

  it('the value appears nowhere else: state, export, records, audit', async () => {
    for (const who of ['jeffrey', 'zul'] as const) assert.ok(!JSON.stringify(await c.state(who)).includes(SECRET), `state for ${who}`);
    const exp = await c.get('/api/export');
    assert.equal(exp.status, 200);
    assert.match(exp.headers.get('content-disposition') ?? '', /attachment; filename="z-heart-j-export-\d{4}-\d{2}-\d{2}\.json"/);
    assert.ok(!exp.text.includes(SECRET), 'export');
    assert.equal(exp.data.data.credentials[0].hasValue, true, 'export says one exists');
    const dump = JSON.stringify([
      (await w.db.prepare('SELECT * FROM records').all()).results,
      (await w.db.prepare('SELECT * FROM audit_events').all()).results,
    ]);
    assert.ok(!dump.includes(SECRET), 'records and audit tables');
  });

  it('reveals on an explicit request and records who revealed it', async () => {
    const r = await c.post('/api/protected/cred-dea/number/reveal', {}, 'zul');
    assert.equal(r.status, 200);
    assert.equal(r.data.value, SECRET);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const info = await c.get('/api/protected/cred-dea');
    assert.deepEqual(
      { ...info.data.slots[0], savedAt: undefined, lastRevealedAt: undefined },
      { slot: 'number', hasValue: true, savedBy: 'jeffrey', savedAt: undefined, lastRevealedBy: 'zul', lastRevealedAt: undefined },
    );
  });

  it('refuses slots that aren’t protected, empty and oversized values', async () => {
    assert.equal((await c.put('/api/protected/cred-dea/other', { value: 'x' })).status, 404);
    assert.equal((await c.put('/api/protected/home-car/f-make', { value: 'x' })).status, 404, 'an ordinary field has no protected slot');
    assert.equal((await c.put('/api/protected/cred-dea/number', { value: '  ' })).status, 400);
    assert.equal((await c.put('/api/protected/cred-dea/number', { value: 'x'.repeat(201) })).status, 400);
    assert.equal((await c.post('/api/protected/home-car/f-plate/reveal', {})).status, 404, 'nothing saved yet');
  });

  it('a protected home field works the same, and goes away with its field', async () => {
    assert.equal((await c.put('/api/protected/home-car/f-plate', { value: 'PLATE-9' })).status, 200);
    assert.equal((await c.post('/api/protected/home-car/f-plate/reveal', {})).data.value, 'PLATE-9');
    const car = (await c.row('home-car'))!;
    assert.deepEqual(car.stored, ['f-plate']);
    const without = { ...car.data, fields: (car.data.fields as Array<{ id: string }>).filter((f) => f.id !== 'f-plate') };
    assert.equal((await c.put('/api/records/home-car', { version: car.version, data: without })).status, 200);
    assert.equal(await w.db.prepare("SELECT 1 FROM protected_values WHERE record_id = 'home-car'").first(), null);
  });

  it('a value moved onto another record can’t be decrypted there', async () => {
    await c.post('/api/records', { kind: 'credential', id: 'cred-two', data: { owner: 'zul', type: 'License', issuer: '' } });
    await c.put('/api/protected/cred-two/number', { value: 'ZUL-555' });
    const a = await w.db.prepare("SELECT iv, ciphertext FROM protected_values WHERE record_id = 'cred-dea'").first<{ iv: string; ciphertext: string }>();
    await w.db.prepare("UPDATE protected_values SET iv = ?, ciphertext = ? WHERE record_id = 'cred-two'").bind(a!.iv, a!.ciphertext).run();
    const r = await c.post('/api/protected/cred-two/number/reveal', {});
    assert.equal(r.status, 500);
    assert.ok(!r.text.includes(SECRET));
  });
});

describe('protected values: key problems are reported, never worked around', () => {
  it('without PROTECTED_DATA_KEY nothing is saved', async () => {
    const w = await startLocalWorker({ bindings: { PROTECTED_DATA_KEY: undefined } });
    try {
      const c = client(w);
      await c.post('/api/records', { kind: 'credential', id: 'cred-k', data: { owner: 'jeffrey', type: 'License', issuer: '' } });
      const r = await c.put('/api/protected/cred-k/number', { value: 'SECRET-1' });
      assert.equal(r.status, 503);
      assert.match(r.data.message, /PROTECTED_DATA_KEY is not set/);
      assert.equal(await w.db.prepare('SELECT 1 FROM protected_values').first(), null);
    } finally {
      await w.close();
    }
  });

  it('a different key than the one used to save is reported as a key mismatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zhj-d1-'));
    const key = (n: number) => Buffer.alloc(32, n).toString('base64');
    try {
      const a = await startLocalWorker({ persist: dir, bindings: { PROTECTED_DATA_KEY: key(1) } });
      const ca = client(a);
      await ca.post('/api/records', { kind: 'credential', id: 'cred-m', data: { owner: 'jeffrey', type: 'License', issuer: '' } });
      assert.equal((await ca.put('/api/protected/cred-m/number', { value: 'SECRET-2' })).status, 200);
      await a.close();
      const b = await startLocalWorker({ persist: dir, bindings: { PROTECTED_DATA_KEY: key(2) } });
      try {
        const r = await client(b).post('/api/protected/cred-m/number/reveal', {});
        assert.equal(r.status, 503);
        assert.equal(r.data.error, 'key_mismatch');
      } finally {
        await b.close();
      }
      const bad = await startLocalWorker({ persist: dir, bindings: { PROTECTED_DATA_KEY: 'too-short' } });
      try {
        assert.equal((await client(bad).post('/api/protected/cred-m/number/reveal', {})).status, 503);
      } finally {
        await bad.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
