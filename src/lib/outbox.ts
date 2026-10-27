import type { MemberId } from '../data/types.ts';
import type { Row } from './records.ts';

/**
 * Shared lists, offline. Only lists and their items are kept on the phone (never
 * anything else from the household), so a list opens in a shop with no signal.
 * Ticks, put-backs and new items made without a connection wait in an outbox,
 * also kept on the phone, and are sent once the app is back online.
 *
 * Pure functions here; the store does the reading, writing and sending.
 */

export const COPY_KEY = 'zhj:lists-copy:v1';
export const OUTBOX_KEY = 'zhj:lists-outbox:v1';

export interface ListsCopy {
  me: MemberId;
  savedAt: string;
  rows: Row[];
}

export type OutboxEntry =
  /** The item should end up checked (or not); `position` moves a put-back item to the end. */
  | { t: 'toggle'; id: string; checked: boolean; position?: number; at: string }
  /** A new item, sent with this id so a repeat can never make a second one. */
  | { t: 'add'; id: string; listId: string; data: { name: string; qty: string; note: string; checked: boolean; position: number }; at: string };

/** Only what a list needs. */
export const listRows = (rows: Iterable<Row>): Row[] => [...rows].filter((r) => r.kind === 'list' || r.kind === 'item');

/**
 * Adds a tick (or un-tick) to the outbox. One entry per item: a later tap replaces an
 * earlier one, and a tick on an item that was itself added offline just changes
 * what will be added.
 */
export function queueToggle(box: OutboxEntry[], id: string, checked: boolean, position: number | undefined, at: string): OutboxEntry[] {
  const added = box.find((e) => e.t === 'add' && e.id === id);
  if (added && added.t === 'add') {
    return box.map((e) => (e === added ? { ...added, data: { ...added.data, checked, ...(position !== undefined ? { position } : {}) } } : e));
  }
  const rest = box.filter((e) => !(e.t === 'toggle' && e.id === id));
  return [...rest, { t: 'toggle', id, checked, ...(position !== undefined ? { position } : {}), at }];
}

export function queueAdd(box: OutboxEntry[], id: string, listId: string, data: { name: string; qty: string; note: string; position: number }, at: string, me: MemberId): OutboxEntry[] {
  void me;
  return [...box, { t: 'add', id, listId, data: { ...data, checked: false }, at }];
}

/** The rows as they will be once the outbox is sent (what the screen shows meanwhile). */
export function applyOutbox(rows: Record<string, Row>, box: OutboxEntry[], me: MemberId): Record<string, Row> {
  if (box.length === 0) return rows;
  const next = { ...rows };
  for (const e of box) {
    if (e.t === 'add') {
      if (next[e.id] || !next[e.listId]) continue; // already arrived, or its list is gone
      next[e.id] = { id: e.id, kind: 'item', parentId: e.listId, version: 0, data: { ...e.data }, createdBy: me, createdAt: e.at, updatedBy: me, updatedAt: e.at };
    } else {
      const r = next[e.id];
      if (!r) continue;
      next[e.id] = { ...r, data: { ...r.data, checked: e.checked, ...(e.position !== undefined ? { position: e.position } : {}) }, updatedBy: me, updatedAt: e.at };
    }
  }
  return next;
}

/**
 * What a queued tick still needs, given the server's copy now: nothing when the item
 * is gone or already as wanted (the other phone got there too), else the data to save.
 */
export function toggleChange(e: Extract<OutboxEntry, { t: 'toggle' }>, current: Row | undefined): Record<string, unknown> | null {
  if (!current || current.kind !== 'item') return null;
  if (current.data.checked === e.checked) return null;
  return { ...current.data, checked: e.checked, ...(e.position !== undefined ? { position: e.position } : {}) };
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or off: the lists still work online; offline just has less to show.
  }
}

/** Sign-out and a not-a-member answer leave nothing behind. */
export function forgetLists(): void {
  writeJson(COPY_KEY, null);
  writeJson(OUTBOX_KEY, null);
}
