import { MEMBER_IDS, MEMBERS, type MemberId } from '../src/data/types.ts';
import { TRASH_DAYS, type Kind, type Row } from '../src/lib/records.ts';

/**
 * Low-level D1 access. Every statement filters on household_id; nothing here
 * reads or returns protected values except `getProtected`, which only the reveal
 * handler calls.
 */

export interface DbRow {
  id: string;
  kind: Kind;
  parent_id: string | null;
  data: string;
  version: number;
  created_by: MemberId;
  created_at: string;
  updated_by: MemberId;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: MemberId | null;
  deleted_with: string | null;
}

const COLS = 'id, kind, parent_id, data, version, created_by, created_at, updated_by, updated_at, deleted_at, deleted_by, deleted_with';

export const nowIso = () => new Date().toISOString();

export function toRow(r: DbRow, stored?: string[]): Row {
  return {
    id: r.id,
    kind: r.kind,
    ...(r.parent_id ? { parentId: r.parent_id } : {}),
    version: r.version,
    data: JSON.parse(r.data) as Record<string, unknown>,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
    ...(stored && stored.length ? { stored } : {}),
  };
}

/** Creates the household, both profiles and both pin sets the first time anyone signs in. */
export async function ensureHousehold(db: D1Database, hh: string): Promise<void> {
  const exists = await db.prepare('SELECT 1 AS ok FROM households WHERE id = ?').bind(hh).first();
  if (exists) return;
  const at = nowIso();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO records (household_id, id, kind, data, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO households (id, rev, created_at) VALUES (?, 0, ?)').bind(hh, at),
    ...MEMBER_IDS.flatMap((m) => [
      insert.bind(hh, m, 'profile', JSON.stringify({ displayName: MEMBERS[m].name, specialty: '', organization: '', npi: '' }), m, at, m, at),
      insert.bind(hh, `pins-${m}`, 'pins', JSON.stringify({ targets: [] }), m, at, m, at),
    ]),
  ]);
}

export async function getRev(db: D1Database, hh: string): Promise<number> {
  const r = await db.prepare('SELECT rev FROM households WHERE id = ?').bind(hh).first<{ rev: number }>();
  return r?.rev ?? 0;
}

export const bumpRev = (db: D1Database, hh: string) => db.prepare('UPDATE households SET rev = rev + 1 WHERE id = ?').bind(hh);

export async function storedSlots(db: D1Database, hh: string, ids?: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const q = ids
    ? db.prepare(`SELECT record_id, slot FROM protected_values WHERE household_id = ? AND record_id IN (SELECT value FROM json_each(?))`).bind(hh, JSON.stringify(ids))
    : db.prepare('SELECT record_id, slot FROM protected_values WHERE household_id = ?').bind(hh);
  const { results } = await q.all<{ record_id: string; slot: string }>();
  for (const r of results) out.set(r.record_id, [...(out.get(r.record_id) ?? []), r.slot]);
  return out;
}

/** Everything live the member may see: all shared records, and only their own pins. */
export async function liveRows(db: D1Database, hh: string, me: MemberId): Promise<Row[]> {
  const { results } = await db
    .prepare(`SELECT ${COLS} FROM records WHERE household_id = ? AND deleted_at IS NULL AND (kind != 'pins' OR id = ?) ORDER BY created_at, id`)
    .bind(hh, `pins-${me}`)
    .all<DbRow>();
  const stored = await storedSlots(db, hh);
  return results.map((r) => toRow(r, stored.get(r.id)));
}

export async function getRow(db: D1Database, hh: string, id: string): Promise<DbRow | null> {
  return db.prepare(`SELECT ${COLS} FROM records WHERE household_id = ? AND id = ?`).bind(hh, id).first<DbRow>();
}

export async function rowsById(db: D1Database, hh: string, ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(`SELECT ${COLS} FROM records WHERE household_id = ? AND deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))`)
    .bind(hh, JSON.stringify(ids))
    .all<DbRow>();
  const stored = await storedSlots(db, hh, ids);
  return results.map((r) => toRow(r, stored.get(r.id)));
}

export async function liveTasksInSeries(db: D1Database, hh: string, seriesId: string): Promise<DbRow[]> {
  const { results } = await db
    .prepare(`SELECT ${COLS} FROM records WHERE household_id = ? AND kind = 'task' AND deleted_at IS NULL AND json_extract(data, '$.seriesId') = ?`)
    .bind(hh, seriesId)
    .all<DbRow>();
  return results;
}

export async function trashRows(db: D1Database, hh: string): Promise<DbRow[]> {
  const { results } = await db
    .prepare(`SELECT ${COLS} FROM records WHERE household_id = ? AND deleted_at IS NOT NULL AND deleted_with IS NULL ORDER BY deleted_at DESC`)
    .bind(hh)
    .all<DbRow>();
  return results;
}

export async function countDeletedWith(db: D1Database, hh: string, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { results } = await db
    .prepare(`SELECT deleted_with AS id, COUNT(*) AS n FROM records WHERE household_id = ? AND deleted_with IN (SELECT value FROM json_each(?)) GROUP BY deleted_with`)
    .bind(hh, JSON.stringify(ids))
    .all<{ id: string; n: number }>();
  for (const r of results) out.set(r.id, r.n);
  return out;
}

export function purgeCutoff(now = Date.now()): string {
  return new Date(now - TRASH_DAYS * 86_400_000).toISOString();
}

/** Permanently removes rows that have been in the trash for more than 30 days (and their protected values). */
export async function purgeTrash(db: D1Database, hh: string, now = Date.now()): Promise<number> {
  const cutoff = purgeCutoff(now);
  const [, res] = await db.batch([
    // Explicit, in addition to the foreign-key cascade.
    db
      .prepare(
        `DELETE FROM protected_values WHERE household_id = ? AND record_id IN (SELECT id FROM records WHERE household_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?)`,
      )
      .bind(hh, hh, cutoff),
    db.prepare('DELETE FROM records WHERE household_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?').bind(hh, cutoff),
  ]);
  return res?.meta.changes ?? 0;
}

export async function householdIds(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare('SELECT id FROM households').all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function getProtected(db: D1Database, hh: string, recordId: string, slot: string) {
  return db
    .prepare('SELECT key_id AS keyId, iv, ciphertext, updated_by AS updatedBy, updated_at AS updatedAt FROM protected_values WHERE household_id = ? AND record_id = ? AND slot = ?')
    .bind(hh, recordId, slot)
    .first<{ keyId: string; iv: string; ciphertext: string; updatedBy: MemberId; updatedAt: string }>();
}

export const auditEvent = (db: D1Database, hh: string, member: MemberId, action: string, recordId?: string, slot?: string) =>
  db.prepare('INSERT INTO audit_events (household_id, at, member, action, record_id, slot) VALUES (?, ?, ?, ?, ?, ?)').bind(hh, nowIso(), member, action, recordId ?? null, slot ?? null);

export async function lastEvents(db: D1Database, hh: string, recordId: string): Promise<Array<{ at: string; member: MemberId; action: string; slot: string | null }>> {
  const { results } = await db
    .prepare('SELECT at, member, action, slot FROM audit_events WHERE household_id = ? AND record_id = ? ORDER BY at DESC LIMIT 20')
    .bind(hh, recordId)
    .all<{ at: string; member: MemberId; action: string; slot: string | null }>();
  return results;
}
