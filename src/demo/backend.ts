import { HOUSEHOLD_TZ, todayIn } from '../lib/dates.ts';
import { canonical, CREATABLE, DELETABLE, InvalidData, newRowId, rowTitle, TRASH_DAYS, validateData, type Change, type Kind, type Row, type TrashEntry } from '../lib/records.ts';
import { completeTask, reopenTask } from '../lib/tasks.ts';
import type { MemberId, Task } from '../data/types.ts';
import { ConflictError, SaveError, type Backend } from '../data/backend.ts';
import { makeDemoRows } from './data.ts';

/**
 * DEMO ONLY. An in-memory stand-in for the Worker, following the same rules
 * (validation, versions and 409s, trash, one next occurrence per completion) so the
 * preview behaves like the real app. Nothing is persisted: reloading resets it.
 * It never makes a network request, so demo content can't reach real data.
 */

export interface DemoBackend extends Backend {
  me: MemberId;
  /** Makes the next save fail, so the rollback and Retry can be seen. */
  failNext: boolean;
}

interface Entry {
  row: Row;
  deletedAt?: string;
  deletedBy?: MemberId;
  deletedWith?: string;
}

const LATENCY_MS = 140;

export function createDemoBackend(): DemoBackend {
  const store = new Map<string, Entry>(makeDemoRows(todayIn()).map((row) => [row.id, { row }]));
  let rev = 1;

  const self: DemoBackend = {
    mode: 'demo',
    me: 'jeffrey',
    failNext: false,

    async load() {
      await pause(false);
      const rows = [...store.values()].filter((e) => !e.deletedAt && (e.row.kind !== 'pins' || e.row.id === `pins-${self.me}`)).map((e) => e.row);
      return { snapshot: { rev, me: self.me, rows } };
    },

    async create(kind, id, data, parentId) {
      await pause();
      if (!CREATABLE.includes(kind)) throw new SaveError('That can’t be created here.', 400);
      const clean = validate(kind, data);
      const prev = store.get(id);
      if (prev) {
        if (!prev.deletedAt && canonical(prev.row.data) === canonical(clean)) return change([prev.row]);
        throw new SaveError('Something with that id already exists.', 409);
      }
      if (kind === 'item' && !live(parentId)) throw new SaveError('That list isn’t here any more.', 409);
      const parent = kind === 'task' ? (clean.planId as string | undefined) : parentId;
      return change([put(stamp({ id, kind, ...(parent ? { parentId: parent } : {}), version: 1, data: clean, createdBy: self.me, createdAt: now(), updatedBy: self.me, updatedAt: now() }))]);
    },

    async update(id, version, data) {
      await pause();
      const e = liveEntry(id);
      let clean = validate(e.row.kind, data);
      const prev = e.row.data;
      if (e.row.kind === 'task') clean = validate('task', { ...clean, seriesId: prev.seriesId, status: prev.status, completedOn: prev.completedOn, createdFrom: prev.createdFrom });
      if (e.row.kind === 'location' || e.row.kind === 'credential') clean.owner = prev.owner;
      if (e.row.version !== version) {
        if (canonical(prev) === canonical(clean)) return change([e.row]);
        throw new ConflictError(e.row);
      }
      const parentId = e.row.kind === 'task' ? (clean.planId as string | undefined) : e.row.parentId;
      const { parentId: _old, ...rest } = e.row;
      void _old;
      return change([put({ ...rest, ...(parentId ? { parentId } : {}), data: clean, version: e.row.version + 1, updatedBy: self.me, updatedAt: now() })]);
    },

    async remove(id, version) {
      await pause();
      if (store.get(id)?.deletedAt) return { rows: [], removed: [id] };
      const e = liveEntry(id);
      if (!DELETABLE.includes(e.row.kind)) throw new SaveError('That can’t be deleted.', 400);
      if (e.row.version !== version) throw new ConflictError(e.row);
      const at = now();
      Object.assign(e, { deletedAt: at, deletedBy: self.me });
      const along = [...store.values()].filter((x) => !x.deletedAt && x.row.parentId === id);
      for (const x of along) Object.assign(x, { deletedAt: at, deletedBy: self.me, deletedWith: id });
      rev++;
      return { rows: [], removed: [id, ...along.map((x) => x.row.id)] };
    },

    async restore(ids) {
      await pause();
      const back: Row[] = [];
      for (const id of ids) {
        const e = store.get(id);
        if (!e) throw new SaveError('That’s no longer in the trash.', 404);
        if (!e.deletedAt) continue;
        if (e.deletedWith && !ids.includes(e.deletedWith)) throw new SaveError('Restore the list or plan it belongs to first.', 409);
        for (const x of [e, ...[...store.values()].filter((y) => y.deletedWith === id)]) {
          x.deletedAt = x.deletedBy = x.deletedWith = undefined;
          x.row = { ...x.row, version: x.row.version + 1 };
          back.push(x.row);
        }
      }
      rev++;
      return change(back);
    },

    async complete(taskId) {
      await pause();
      const e = liveEntry(taskId);
      if (e.row.data.status === 'done') return change([e.row]);
      const series = [...store.values()].filter((x) => !x.deletedAt && x.row.kind === 'task' && x.row.data.seriesId === e.row.data.seriesId).map((x) => asTask(x.row));
      const result = completeTask(series, taskId, todayIn(), self.me, () => newRowId('t'));
      const done = result.tasks.find((t) => t.id === taskId)!;
      const rows = [put({ ...e.row, data: taskData(done), version: e.row.version + 1, updatedBy: self.me, updatedAt: now() })];
      if (result.created) {
        const n = result.created;
        rows.push(put(stamp({ id: n.id, kind: 'task', ...(e.row.parentId ? { parentId: e.row.parentId } : {}), version: 1, data: taskData(n), createdBy: self.me, createdAt: now(), updatedBy: self.me, updatedAt: now() })));
      }
      return change(rows);
    },

    async reopen(taskId) {
      await pause();
      const e = liveEntry(taskId);
      if (e.row.data.status !== 'done') return change([e.row]);
      // The pure rule from Stage 1, plus the server's "untouched = still version 1".
      const tasks = [...store.values()].filter((x) => !x.deletedAt && x.row.kind === 'task').map((x) => asTask(x.row));
      const kept = new Set(reopenTask(tasks, taskId, self.me).map((t) => t.id));
      const removed = tasks.filter((t) => !kept.has(t.id) && t.version === 1).map((t) => t.id);
      for (const id of removed) store.delete(id);
      const data = { ...e.row.data, status: 'open' };
      delete (data as { completedOn?: string }).completedOn;
      return { rows: [put({ ...e.row, data, version: e.row.version + 1, updatedBy: self.me, updatedAt: now() })], removed };
    },

    async clearChecked(listId, items) {
      await pause();
      liveEntry(listId);
      const at = now();
      const removed: string[] = [];
      const kept: Row[] = [];
      for (const { id, version } of items) {
        const e = store.get(id);
        if (!e || e.deletedAt) continue;
        if (e.row.parentId === listId && e.row.version === version && e.row.data.checked === true) {
          Object.assign(e, { deletedAt: at, deletedBy: self.me });
          removed.push(id);
        } else kept.push(e.row);
      }
      rev++;
      return { rows: kept, removed };
    },

    async setPins(targets) {
      await pause();
      const id = `pins-${self.me}`;
      const e = store.get(id);
      const data = validate('pins', { targets });
      const row: Row = e
        ? { ...e.row, data, version: e.row.version + 1, updatedAt: now(), updatedBy: self.me }
        : stamp({ id, kind: 'pins', version: 1, data, createdBy: self.me, createdAt: now(), updatedBy: self.me, updatedAt: now() });
      return change([put(row)]);
    },

    async trash() {
      await pause(false);
      const cutoff = Date.now() - TRASH_DAYS * 86_400_000;
      for (const [id, e] of store) if (e.deletedAt && Date.parse(e.deletedAt) < cutoff) store.delete(id);
      return [...store.values()]
        .filter((e) => e.deletedAt && !e.deletedWith)
        .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!))
        .map((e): TrashEntry => {
          const n = [...store.values()].filter((x) => x.deletedWith === e.row.id).length;
          const { title, context } = rowTitle(e.row);
          const along = n === 0 ? '' : e.row.kind === 'list' ? ` · with ${n} item${n === 1 ? '' : 's'}` : ` · with ${n} task${n === 1 ? '' : 's'}`;
          return { id: e.row.id, kind: e.row.kind, title, context: context + along, deletedAt: e.deletedAt!, deletedBy: e.deletedBy!, purgeAfter: todayIn(HOUSEHOLD_TZ, new Date(Date.parse(e.deletedAt!) + TRASH_DAYS * 86_400_000)) };
        });
    },
  };

  async function pause(canFail = true) {
    await new Promise((r) => window.setTimeout(r, LATENCY_MS));
    if (!navigator.onLine) throw new SaveError('You’re offline.', 0, 'offline');
    if (canFail && self.failNext) {
      self.failNext = false;
      throw new SaveError('Simulated failure (demo).', 0, 'network');
    }
  }
  function live(id?: string) {
    const e = id ? store.get(id) : undefined;
    return e && !e.deletedAt ? e : undefined;
  }
  function liveEntry(id: string): Entry {
    const e = live(id);
    if (!e) throw new SaveError('That isn’t here any more.', 404);
    return e;
  }
  function put(row: Row): Row {
    const e = store.get(row.id);
    if (e) e.row = row;
    else store.set(row.id, { row });
    rev++;
    return row;
  }
  return self;
}

let lastStamp = 0;
/** Creation times strictly increase, so new cards always sort after older ones. */
const stamp = (row: Row): Row => {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return { ...row, createdAt: new Date(lastStamp).toISOString() };
};
const now = () => new Date().toISOString();
const change = (rows: Row[], removed: string[] = []): Change => ({ rows, removed });

function validate(kind: Kind, data: unknown) {
  try {
    return validateData(kind, data);
  } catch (e) {
    if (e instanceof InvalidData) throw new SaveError(e.message, 400, 'invalid');
    throw e;
  }
}
function asTask(r: Row): Task {
  return { ...(r.data as unknown as Omit<Task, 'id'>), id: r.id, updatedBy: r.updatedBy, updatedAt: r.updatedAt, version: r.version };
}
function taskData(t: Task): Record<string, unknown> {
  const { seriesId, planId, title, assignee, due, status, completedOn, recurrence, createdFrom, notes } = t;
  return validate('task', { seriesId, planId, title, assignee, due, status, completedOn, recurrence, createdFrom, notes });
}
