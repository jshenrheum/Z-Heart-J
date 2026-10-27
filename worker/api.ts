import type { MemberId, Task } from '../src/data/types.ts';
import { HOUSEHOLD_TZ, todayIn } from '../src/lib/dates.ts';
import {
  canonical, CREATABLE, CREDENTIAL_SLOT, DELETABLE, ID_RE, InvalidData, newRowId, PROTECTED_MAX, rowTitle, toHousehold, TRASH_DAYS, validateData, WEDDING_ID,
  type Change, type Kind, type Row, type TrashEntry,
} from '../src/lib/records.ts';
import { completeTask } from '../src/lib/tasks.ts';
import { checkKey, decryptValue, encryptValue, KeyError } from './crypto.ts';
import {
  auditEvent, bumpRev, countDeletedWith, ensureHousehold, getProtected, getRev, getRow, lastEvents, liveRows, liveTasksInSeries, nowIso, purgeTrash,
  rowsById, toRow, trashRows, type DbRow,
} from './db.ts';
import type { Env } from './env.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

interface Ctx {
  env: Env;
  db: D1Database;
  hh: string;
  me: MemberId;
  req: Request;
  url: URL;
}

const UPDATABLE: Kind[] = ['profile', ...CREATABLE];
const MAX_BODY = 64_000;
// Control characters other than tab and newline.
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('application/json')) throw new ApiError(415, 'unsupported_media_type', 'Requests must be JSON.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new ApiError(413, 'too_large', 'That’s more than can be saved at once.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'bad_json', 'Couldn’t read that request.');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new ApiError(400, 'bad_json', 'Couldn’t read that request.');
  return body as Record<string, unknown>;
}

function validate(kind: Kind, data: unknown): Record<string, unknown> {
  try {
    return validateData(kind, data);
  } catch (e) {
    if (e instanceof InvalidData) throw new ApiError(400, 'invalid', e.message, { field: e.field });
    throw e;
  }
}

function versionOf(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw new ApiError(400, 'version_required', 'This change needs the version it was based on.');
  return n;
}

const isUnique = (e: unknown) => /UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e));

async function live(ctx: Ctx, id: string): Promise<DbRow> {
  const row = await getRow(ctx.db, ctx.hh, id);
  if (!row || row.deleted_at) throw new ApiError(404, 'not_found', 'That isn’t here any more.');
  return row;
}

function conflict(row: DbRow, stored?: string[]): ApiError {
  return new ApiError(409, 'conflict', 'This was changed on the other phone.', { current: toRow(row, stored) });
}

async function requireLiveParent(ctx: Ctx, id: string | undefined, kind: Kind, what: string) {
  if (!id) return;
  const p = await getRow(ctx.db, ctx.hh, id);
  if (!p || p.kind !== kind) throw new ApiError(400, 'invalid', `That ${what} doesn’t exist.`, { field: kind === 'list' ? 'parentId' : 'planId' });
  if (p.deleted_at) throw new ApiError(409, 'parent_deleted', `That ${what} is in the trash. Restore it first.`);
}

const change = (rows: Row[], removed: string[] = []): Change => ({ rows, removed });

/** The fields of a Task that are stored as its data (never audit fields). */
function taskData(t: Task): Record<string, unknown> {
  const { seriesId, planId, title, assignee, due, status, completedOn, recurrence, createdFrom, notes } = t;
  return { seriesId, planId, title, assignee, due, status, completedOn, recurrence, createdFrom, notes };
}

function asTask(r: DbRow): Task {
  return { ...(JSON.parse(r.data) as Omit<Task, 'id'>), id: r.id, updatedBy: r.updated_by, updatedAt: r.updated_at, version: r.version };
}

function protectedSlots(row: DbRow): string[] {
  if (row.kind === 'credential') return [CREDENTIAL_SLOT];
  if (row.kind === 'home') {
    const fields = (JSON.parse(row.data) as { fields?: Array<{ id: string; protected?: boolean }> }).fields ?? [];
    return fields.filter((f) => f.protected).map((f) => f.id);
  }
  return [];
}

// ------------------------------------------------------------------ reads

async function getState(ctx: Ctx): Promise<Response> {
  const rev = await getRev(ctx.db, ctx.hh);
  const etag = `"r${rev}-${ctx.me}"`;
  if (ctx.req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag, 'cache-control': 'no-store' } });
  const rows = await liveRows(ctx.db, ctx.hh, ctx.me);
  return json(200, { rev, me: ctx.me, rows }, { etag });
}

async function getTrash(ctx: Ctx): Promise<Response> {
  await purgeTrash(ctx.db, ctx.hh);
  const rows = await trashRows(ctx.db, ctx.hh);
  const counts = await countDeletedWith(ctx.db, ctx.hh, rows.map((r) => r.id));
  const entries: TrashEntry[] = rows.map((r) => {
    const { title, context } = rowTitle(toRow(r));
    const n = counts.get(r.id) ?? 0;
    const along = n === 0 ? '' : r.kind === 'list' ? ` · with ${n} item${n === 1 ? '' : 's'}` : ` · with ${n} task${n === 1 ? '' : 's'}`;
    return {
      id: r.id,
      kind: r.kind,
      title,
      context: context + along,
      deletedAt: r.deleted_at!,
      deletedBy: r.deleted_by!,
      purgeAfter: todayIn(HOUSEHOLD_TZ, new Date(Date.parse(r.deleted_at!) + TRASH_DAYS * 86_400_000)),
    };
  });
  return json(200, { entries });
}

async function exportData(ctx: Ctx): Promise<Response> {
  const rows = (await liveRows(ctx.db, ctx.hh, ctx.me)).filter((r) => r.kind !== 'pins');
  const { pins: _pins, ...data } = toHousehold(rows);
  void _pins;
  const at = nowIso();
  await auditEvent(ctx.db, ctx.hh, ctx.me, 'export').run();
  const body = {
    format: 'z-heart-j-export',
    formatVersion: 1,
    exportedAt: at,
    exportedBy: ctx.me,
    note: 'Ordinary household data only. Protected values (credential numbers and protected fields) are never exported; "hasValue" only says whether one is saved. Items in the trash are not included.',
    data,
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="z-heart-j-export-${todayIn()}.json"`,
      'cache-control': 'no-store',
    },
  });
}

// ------------------------------------------------------------------ record writes

async function create(ctx: Ctx): Promise<Response> {
  const body = await readJson(ctx.req);
  const kind = body.kind as Kind;
  const id = body.id;
  if (!CREATABLE.includes(kind)) throw new ApiError(400, 'invalid', 'That kind of record can’t be created here.', { field: 'kind' });
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new ApiError(400, 'invalid', 'Not a valid id.', { field: 'id' });
  const data = validate(kind, body.data);
  if (kind === 'wedding' && id !== WEDDING_ID) throw new ApiError(400, 'invalid', 'There is one wedding record, and its id is “wedding”.', { field: 'id' });

  let parent: string | undefined;
  if (kind === 'item') {
    parent = typeof body.parentId === 'string' ? body.parentId : undefined;
    if (!parent) throw new ApiError(400, 'invalid', 'An item needs its list.', { field: 'parentId' });
    await requireLiveParent(ctx, parent, 'list', 'list');
  }
  if (kind === 'task') {
    // A new task starts its own series, open; only completion creates the next occurrence.
    if (data.seriesId !== id || data.status !== 'open' || data.createdFrom !== undefined) throw new ApiError(400, 'invalid', 'A new task starts open and in its own series.', { field: 'seriesId' });
    parent = data.planId as string | undefined;
    await requireLiveParent(ctx, parent, 'plan', 'plan');
  }

  const existing = await getRow(ctx.db, ctx.hh, id);
  if (existing) {
    // A retried create (the first one landed but its answer was lost) is answered, not refused.
    if (!existing.deleted_at && existing.kind === kind && (existing.parent_id ?? undefined) === parent && canonical(JSON.parse(existing.data)) === canonical(data)) {
      return json(200, change(await rowsById(ctx.db, ctx.hh, [id])));
    }
    throw new ApiError(409, 'exists', 'Something with that id already exists.');
  }

  const at = nowIso();
  try {
    await ctx.db.batch([
      ctx.db
        .prepare(`INSERT INTO records (household_id, id, kind, parent_id, data, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(ctx.hh, id, kind, parent ?? null, JSON.stringify(data), ctx.me, at, ctx.me, at),
      bumpRev(ctx.db, ctx.hh),
    ]);
  } catch (e) {
    if (isUnique(e)) throw new ApiError(409, 'duplicate', 'Another task in this series is already due that day.');
    throw e;
  }
  return json(201, change(await rowsById(ctx.db, ctx.hh, [id])));
}

async function update(ctx: Ctx, id: string): Promise<Response> {
  const body = await readJson(ctx.req);
  const row = await live(ctx, id);
  if (!UPDATABLE.includes(row.kind)) throw new ApiError(400, 'invalid', 'That record can’t be changed here.');
  const version = versionOf(body.version);
  const prev = JSON.parse(row.data) as Record<string, unknown>;
  let data = validate(row.kind, body.data);

  if (row.kind === 'task') {
    // Status, completion and series membership change only through complete/reopen.
    data = validate('task', { ...data, seriesId: prev.seriesId, status: prev.status, completedOn: prev.completedOn, createdFrom: prev.createdFrom });
    await requireLiveParent(ctx, data.planId as string | undefined, 'plan', 'plan');
  }
  if (row.kind === 'location' || row.kind === 'credential') data.owner = prev.owner;

  if (row.version !== version) {
    // Already applied (a retry after a lost answer)? Then it isn't a conflict.
    if (canonical(prev) === canonical(data)) return json(200, change(await rowsById(ctx.db, ctx.hh, [id])));
    throw conflict(row, (await rowsById(ctx.db, ctx.hh, [id]))[0]?.stored);
  }

  const parent = row.kind === 'task' ? ((data.planId as string | undefined) ?? null) : row.parent_id;
  const op = newRowId('op');
  const at = nowIso();
  const stmts: D1PreparedStatement[] = [
    ctx.db
      .prepare('UPDATE records SET data = ?, parent_id = ?, version = version + 1, updated_by = ?, updated_at = ?, last_op = ? WHERE household_id = ? AND id = ? AND version = ? AND deleted_at IS NULL')
      .bind(JSON.stringify(data), parent, ctx.me, at, op, ctx.hh, id, version),
  ];
  if (row.kind === 'home') {
    // A field that stopped being protected (or was removed) takes its stored value with it.
    const before = protectedSlots(row);
    const after = new Set(((data.fields as Array<{ id: string; protected?: boolean }>) ?? []).filter((f) => f.protected).map((f) => f.id));
    const gone = before.filter((s) => !after.has(s));
    if (gone.length) {
      stmts.push(
        ctx.db
          .prepare(
            'DELETE FROM protected_values WHERE household_id = ? AND record_id = ? AND slot IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM records WHERE household_id = ? AND id = ? AND last_op = ?)',
          )
          .bind(ctx.hh, id, JSON.stringify(gone), ctx.hh, id, op),
      );
    }
  }
  stmts.push(bumpRev(ctx.db, ctx.hh));

  let results: D1Result[];
  try {
    results = await ctx.db.batch(stmts);
  } catch (e) {
    if (isUnique(e)) throw new ApiError(409, 'duplicate', 'Another task in this series is already due that day.');
    throw e;
  }
  if ((results[0]?.meta.changes ?? 0) === 0) {
    const now = await getRow(ctx.db, ctx.hh, id);
    if (!now || now.deleted_at) throw new ApiError(404, 'not_found', 'That isn’t here any more.');
    throw conflict(now, (await rowsById(ctx.db, ctx.hh, [id]))[0]?.stored);
  }
  return json(200, change(await rowsById(ctx.db, ctx.hh, [id])));
}

async function remove(ctx: Ctx, id: string): Promise<Response> {
  const existing = await getRow(ctx.db, ctx.hh, id);
  if (!existing) throw new ApiError(404, 'not_found', 'That isn’t here any more.');
  // Already in the trash (a retry whose first attempt landed): same outcome.
  if (existing.deleted_at) return json(200, change([], [id]));
  const row = existing;
  if (!DELETABLE.includes(row.kind)) throw new ApiError(400, 'invalid', 'That record can’t be deleted.');
  const version = versionOf(ctx.url.searchParams.get('version'));
  if (row.version !== version) throw conflict(row, (await rowsById(ctx.db, ctx.hh, [id]))[0]?.stored);
  const op = newRowId('op');
  const at = nowIso();
  const results = await ctx.db.batch([
    ctx.db
      .prepare('UPDATE records SET deleted_at = ?, deleted_by = ?, last_op = ? WHERE household_id = ? AND id = ? AND version = ? AND deleted_at IS NULL')
      .bind(at, ctx.me, op, ctx.hh, id, version),
    // A list takes its items along; a plan its tasks. They come back with it.
    ctx.db
      .prepare(
        'UPDATE records SET deleted_at = ?, deleted_by = ?, deleted_with = ? WHERE household_id = ? AND parent_id = ? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM records WHERE household_id = ? AND id = ? AND last_op = ?) RETURNING id',
      )
      .bind(at, ctx.me, id, ctx.hh, id, ctx.hh, id, op),
    bumpRev(ctx.db, ctx.hh),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) {
    const now = await getRow(ctx.db, ctx.hh, id);
    if (!now || now.deleted_at) return json(200, change([], [id]));
    throw conflict(now);
  }
  const along = ((results[1]?.results ?? []) as Array<{ id: string }>).map((r) => r.id);
  return json(200, change([], [id, ...along]));
}

async function restore(ctx: Ctx): Promise<Response> {
  const body = await readJson(ctx.req);
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((x) => typeof x === 'string' && ID_RE.test(x))) throw new ApiError(400, 'invalid', 'Nothing to restore.', { field: 'ids' });
  const stmts: D1PreparedStatement[] = [];
  const restoring = new Set(ids as string[]);
  for (const id of restoring) {
    const row = await getRow(ctx.db, ctx.hh, id);
    if (!row) throw new ApiError(404, 'not_found', 'That’s no longer in the trash — items are kept for 30 days.');
    if (!row.deleted_at) continue; // already back
    if (row.deleted_with && !restoring.has(row.deleted_with)) throw new ApiError(409, 'parent_deleted', 'Restore the list or plan it belongs to first.');
    if (row.parent_id && !restoring.has(row.parent_id)) {
      const parent = await getRow(ctx.db, ctx.hh, row.parent_id);
      if (parent?.deleted_at) throw new ApiError(409, 'parent_deleted', `Restore the ${parent.kind === 'list' ? 'list' : 'plan'} it belongs to first.`);
    }
    stmts.push(
      ctx.db.prepare('UPDATE records SET deleted_at = NULL, deleted_by = NULL, deleted_with = NULL, version = version + 1 WHERE household_id = ? AND id = ? AND deleted_at IS NOT NULL').bind(ctx.hh, id),
      ctx.db
        .prepare('UPDATE records SET deleted_at = NULL, deleted_by = NULL, deleted_with = NULL, version = version + 1 WHERE household_id = ? AND deleted_with = ? RETURNING id')
        .bind(ctx.hh, id),
    );
  }
  if (stmts.length === 0) return json(200, change(await rowsById(ctx.db, ctx.hh, [...restoring])));
  stmts.push(bumpRev(ctx.db, ctx.hh));
  let results: D1Result[];
  try {
    results = await ctx.db.batch(stmts);
  } catch (e) {
    if (isUnique(e)) throw new ApiError(409, 'duplicate', 'A task in the same series is already due that day, so this one can’t come back as it was.');
    throw e;
  }
  const along = results.flatMap((r) => ((r.results ?? []) as Array<{ id?: string }>).map((x) => x.id).filter((x): x is string => !!x));
  return json(200, change(await rowsById(ctx.db, ctx.hh, [...restoring, ...along])));
}

// ------------------------------------------------------------------ tasks

async function complete(ctx: Ctx, id: string): Promise<Response> {
  const row = await live(ctx, id);
  if (row.kind !== 'task') throw new ApiError(404, 'not_found', 'That task isn’t here any more.');
  const prev = asTask(row);
  if (prev.status === 'done') return json(200, change(await rowsById(ctx.db, ctx.hh, [id]))); // idempotent

  const series = (await liveTasksInSeries(ctx.db, ctx.hh, prev.seriesId)).map(asTask);
  // "Today" is the household's calendar day, computed here, not on the phone.
  const result = completeTask(series, id, todayIn(), ctx.me, () => newRowId('t'));
  const done = result.tasks.find((t) => t.id === id)!;
  const op = newRowId('op');
  const at = nowIso();
  const stmts: D1PreparedStatement[] = [
    ctx.db
      .prepare(
        `UPDATE records SET data = ?, version = version + 1, updated_by = ?, updated_at = ?, last_op = ? WHERE household_id = ? AND id = ? AND deleted_at IS NULL AND json_extract(data, '$.status') = 'open'`,
      )
      .bind(JSON.stringify(validate('task', taskData(done))), ctx.me, at, op, ctx.hh, id),
  ];
  const next = result.created;
  if (next) {
    // Inserted only if this exact completion happened (two phones completing at once
    // produce one completion and one next occurrence); the unique index backs this up.
    stmts.push(
      ctx.db
        .prepare(
          `INSERT INTO records (household_id, id, kind, parent_id, data, created_by, created_at, updated_by, updated_at)
           SELECT ?, ?, 'task', ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM records WHERE household_id = ? AND id = ? AND last_op = ?)`,
        )
        .bind(ctx.hh, next.id, row.parent_id, JSON.stringify(validate('task', taskData(next))), ctx.me, at, ctx.me, at, ctx.hh, id, op),
    );
  }
  stmts.push(bumpRev(ctx.db, ctx.hh));
  try {
    await ctx.db.batch(stmts);
  } catch (e) {
    if (!isUnique(e)) throw e;
    // The next occurrence already exists: complete without creating another.
    await ctx.db.batch([stmts[0]!, bumpRev(ctx.db, ctx.hh)]);
  }
  const ids = next ? [id, next.id] : [id];
  return json(200, change(await rowsById(ctx.db, ctx.hh, ids)));
}

async function reopen(ctx: Ctx, id: string): Promise<Response> {
  const row = await live(ctx, id);
  if (row.kind !== 'task') throw new ApiError(404, 'not_found', 'That task isn’t here any more.');
  const prev = asTask(row);
  if (prev.status !== 'done') return json(200, change(await rowsById(ctx.db, ctx.hh, [id])));
  const reopened = validate('task', { ...taskData(prev), status: 'open', completedOn: undefined });
  const op = newRowId('op');
  const at = nowIso();
  const results = await ctx.db.batch([
    ctx.db
      .prepare(
        `UPDATE records SET data = ?, version = version + 1, updated_by = ?, updated_at = ?, last_op = ? WHERE household_id = ? AND id = ? AND deleted_at IS NULL AND json_extract(data, '$.status') = 'done'`,
      )
      .bind(JSON.stringify(reopened), ctx.me, at, op, ctx.hh, id),
    // Take back the next occurrence it generated — only if nobody has touched it since
    // (still version 1 and open). An edited or finished one is kept.
    ctx.db
      .prepare(
        `DELETE FROM records WHERE household_id = ? AND kind = 'task' AND deleted_at IS NULL AND version = 1 AND json_extract(data, '$.createdFrom') = ? AND json_extract(data, '$.status') = 'open'
         AND EXISTS (SELECT 1 FROM records WHERE household_id = ? AND id = ? AND last_op = ?) RETURNING id`,
      )
      .bind(ctx.hh, id, ctx.hh, id, op),
    bumpRev(ctx.db, ctx.hh),
  ]);
  const removed = ((results[1]?.results ?? []) as Array<{ id: string }>).map((r) => r.id);
  return json(200, change(await rowsById(ctx.db, ctx.hh, [id]), removed));
}

// ------------------------------------------------------------------ lists and pins

async function clearChecked(ctx: Ctx, listId: string): Promise<Response> {
  const list = await live(ctx, listId);
  if (list.kind !== 'list') throw new ApiError(404, 'not_found', 'That list isn’t here any more.');
  const body = await readJson(ctx.req);
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) throw new ApiError(400, 'invalid', 'Nothing to clear.', { field: 'items' });
  const at = nowIso();
  const stmts = items.map((it: unknown) => {
    const { id, version } = (it ?? {}) as { id?: unknown; version?: unknown };
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new ApiError(400, 'invalid', 'Not a valid item.', { field: 'items' });
    // Only items still checked and unchanged since this phone saw them.
    return ctx.db
      .prepare(
        `UPDATE records SET deleted_at = ?, deleted_by = ? WHERE household_id = ? AND id = ? AND kind = 'item' AND parent_id = ? AND version = ? AND deleted_at IS NULL AND json_extract(data, '$.checked') = 1 RETURNING id`,
      )
      .bind(at, ctx.me, ctx.hh, id, listId, versionOf(version));
  });
  const results = await ctx.db.batch([...stmts, bumpRev(ctx.db, ctx.hh)]);
  const removed = results.slice(0, stmts.length).flatMap((r) => ((r.results ?? []) as Array<{ id: string }>).map((x) => x.id));
  const kept = (items as Array<{ id: string }>).map((i) => i.id).filter((i) => !removed.includes(i));
  return json(200, change(await rowsById(ctx.db, ctx.hh, kept), removed));
}

async function setPins(ctx: Ctx): Promise<Response> {
  const body = await readJson(ctx.req);
  const data = validate('pins', { targets: body.targets });
  const id = `pins-${ctx.me}`;
  const at = nowIso();
  // Each member's pins are theirs alone, so the latest write wins.
  await ctx.db.batch([
    ctx.db
      .prepare(
        `INSERT INTO records (household_id, id, kind, data, created_by, created_at, updated_by, updated_at) VALUES (?, ?, 'pins', ?, ?, ?, ?, ?)
         ON CONFLICT (household_id, id) DO UPDATE SET data = excluded.data, version = records.version + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(ctx.hh, id, JSON.stringify(data), ctx.me, at, ctx.me, at),
    bumpRev(ctx.db, ctx.hh),
  ]);
  return json(200, change(await rowsById(ctx.db, ctx.hh, [id])));
}

// ------------------------------------------------------------------ protected values

async function protectedTarget(ctx: Ctx, recordId: string, slot: string): Promise<DbRow> {
  const row = await live(ctx, recordId);
  if (!protectedSlots(row).includes(slot)) throw new ApiError(404, 'not_found', 'That protected field isn’t here any more.');
  return row;
}

function keyFailure(e: unknown): never {
  if (e instanceof KeyError) throw new ApiError(503, e.code, e.message);
  throw e;
}

async function protectedInfo(ctx: Ctx, recordId: string): Promise<Response> {
  const row = await live(ctx, recordId);
  const slots = protectedSlots(row);
  const { results } = await ctx.db
    .prepare('SELECT slot, updated_by AS updatedBy, updated_at AS updatedAt FROM protected_values WHERE household_id = ? AND record_id = ?')
    .bind(ctx.hh, recordId)
    .all<{ slot: string; updatedBy: MemberId; updatedAt: string }>();
  const events = await lastEvents(ctx.db, ctx.hh, recordId);
  return json(200, {
    slots: slots.map((slot) => {
      const saved = results.find((r) => r.slot === slot);
      const revealed = events.find((e) => e.slot === slot && e.action === 'protected.reveal');
      return { slot, hasValue: !!saved, savedBy: saved?.updatedBy, savedAt: saved?.updatedAt, lastRevealedBy: revealed?.member, lastRevealedAt: revealed?.at };
    }),
  });
}

async function setProtected(ctx: Ctx, recordId: string, slot: string): Promise<Response> {
  const body = await readJson(ctx.req);
  await protectedTarget(ctx, recordId, slot);
  const value = typeof body.value === 'string' ? body.value.trim() : '';
  if (!value) throw new ApiError(400, 'invalid', 'Enter the value to save.', { field: 'value' });
  if (value.length > PROTECTED_MAX) throw new ApiError(400, 'invalid', `Keep this under ${PROTECTED_MAX} characters.`, { field: 'value' });
  if (CONTROL_RE.test(value) || /[\r\n]/.test(value)) throw new ApiError(400, 'invalid', 'Contains characters that aren’t allowed.', { field: 'value' });
  const sealed = await encryptValue(ctx.env, ctx.hh, recordId, slot, value).catch(keyFailure);
  const at = nowIso();
  await ctx.db.batch([
    ctx.db
      .prepare(
        `INSERT INTO protected_values (household_id, record_id, slot, key_id, iv, ciphertext, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (household_id, record_id, slot) DO UPDATE SET key_id = excluded.key_id, iv = excluded.iv, ciphertext = excluded.ciphertext, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(ctx.hh, recordId, slot, sealed.keyId, sealed.iv, sealed.ciphertext, ctx.me, at),
    auditEvent(ctx.db, ctx.hh, ctx.me, 'protected.set', recordId, slot),
    bumpRev(ctx.db, ctx.hh),
  ]);
  return json(200, change(await rowsById(ctx.db, ctx.hh, [recordId])));
}

async function clearProtected(ctx: Ctx, recordId: string, slot: string): Promise<Response> {
  await protectedTarget(ctx, recordId, slot);
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM protected_values WHERE household_id = ? AND record_id = ? AND slot = ?').bind(ctx.hh, recordId, slot),
    auditEvent(ctx.db, ctx.hh, ctx.me, 'protected.clear', recordId, slot),
    bumpRev(ctx.db, ctx.hh),
  ]);
  return json(200, change(await rowsById(ctx.db, ctx.hh, [recordId])));
}

async function reveal(ctx: Ctx, recordId: string, slot: string): Promise<Response> {
  await protectedTarget(ctx, recordId, slot);
  const stored = await getProtected(ctx.db, ctx.hh, recordId, slot);
  if (!stored) throw new ApiError(404, 'not_found', 'Nothing is saved there yet.');
  let value: string;
  try {
    value = await decryptValue(ctx.env, ctx.hh, recordId, slot, stored);
  } catch (e) {
    if (e instanceof KeyError) keyFailure(e);
    throw new ApiError(500, 'cannot_decrypt', 'This value couldn’t be decrypted.');
  }
  await auditEvent(ctx.db, ctx.hh, ctx.me, 'protected.reveal', recordId, slot).run();
  return json(200, { value });
}

// ------------------------------------------------------------------ routing

type Handler = (ctx: Ctx, ...params: string[]) => Promise<Response>;
const ROUTES: Array<[string, RegExp, Handler]> = [
  ['GET', /^\/api\/state$/, getState],
  ['POST', /^\/api\/records$/, create],
  ['PUT', /^\/api\/records\/([^/]+)$/, update],
  ['DELETE', /^\/api\/records\/([^/]+)$/, remove],
  ['POST', /^\/api\/restore$/, restore],
  ['POST', /^\/api\/tasks\/([^/]+)\/complete$/, complete],
  ['POST', /^\/api\/tasks\/([^/]+)\/reopen$/, reopen],
  ['POST', /^\/api\/lists\/([^/]+)\/clear-checked$/, clearChecked],
  ['PUT', /^\/api\/pins$/, setPins],
  ['GET', /^\/api\/protected\/([^/]+)$/, protectedInfo],
  ['PUT', /^\/api\/protected\/([^/]+)\/([^/]+)$/, setProtected],
  ['DELETE', /^\/api\/protected\/([^/]+)\/([^/]+)$/, clearProtected],
  ['POST', /^\/api\/protected\/([^/]+)\/([^/]+)\/reveal$/, reveal],
  ['GET', /^\/api\/trash$/, getTrash],
  ['GET', /^\/api\/export$/, exportData],
];

export async function routeApi(req: Request, env: Env, url: URL, me: MemberId): Promise<Response> {
  const hh = (env.HOUSEHOLD_ID ?? '').trim() || 'zj';
  if (!ID_RE.test(hh)) throw new ApiError(503, 'not_configured', 'Server setup incomplete: HOUSEHOLD_ID is not valid.');
  let pathMatched = false;
  for (const [method, re, handler] of ROUTES) {
    const m = re.exec(url.pathname);
    if (!m) continue;
    pathMatched = true;
    if (method !== req.method) continue;
    const params = m.slice(1).map((p) => {
      const v = decodeURIComponent(p);
      if (!ID_RE.test(v)) throw new ApiError(400, 'invalid', 'Not a valid id.');
      return v;
    });
    // The household (and both profiles) exist from the first signed-in request on.
    await ensureHousehold(env.DB, hh);
    return handler({ env, db: env.DB, hh, me, req, url }, ...params);
  }
  throw pathMatched ? new ApiError(405, 'method_not_allowed', 'Not allowed.') : new ApiError(404, 'not_found', 'No such API route.');
}
