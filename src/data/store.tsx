import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MEMBERS, type Assignee, type Audit, type BudgetItem, type EventRepeat, type Guest, type PhotoRef, type HomeField, type HomeTemplate, type Household, type MemberId, type PinTarget, type Plan, type Profile, type Vendor, type WorkLocation, type Contact, type Credential,
} from './types.ts';
import { ConflictError, SaveError, SessionError, type Backend } from './backend.ts';
import { displayDate, todayIn, type DateStr } from '../lib/dates.ts';
import { useFeedback } from '../lib/feedback.tsx';
import { resolvePin } from '../lib/pins.ts';
import { MAX_PHOTOS, MAX_PINS, newRowId, toHousehold, WEDDING_ID, type Change, type Kind, type Row } from '../lib/records.ts';
import { preparePhoto } from '../lib/photos.ts';
import { applyOutbox, COPY_KEY, forgetLists, listRows as copyRows, OUTBOX_KEY, queueAdd, queueToggle, readJson, toggleChange, writeJson, type ListsCopy, type OutboxEntry } from '../lib/outbox.ts';
import { useOnline } from '../lib/online.ts';
import type { Recurrence } from '../lib/recurrence.ts';

/**
 * The app's data layer, the same for the signed-in app and the demo.
 *
 * `server` is the last version the server confirmed. Every change is an overlay
 * (`ops`) applied on top of it right away; when the server answers, its answer is
 * merged into `server` and the overlay goes. If the save fails, dropping the
 * overlay is the rollback: the screen shows the last saved version again, and an
 * alert offers Retry. Nothing is ever shown as saved before the server says so.
 *
 * Writes to the same record go out one after another and each names the version
 * it starts from, read when it's sent. A 409 means the other phone changed it
 * first: their version is shown and nothing of ours is kept silently.
 *
 * Household data lives only in memory here — never in storage on the device.
 */

export interface Banner {
  message: string;
  retry?: () => void;
}

export type Outcome<T = void> = { ok: true; value: T } | { ok: false; message: string };

export type Session = { kind: 'ok' } | { kind: 'expired' | 'not_member' | 'not_configured'; message: string };

type Rows = Record<string, Row>;
interface Op {
  key: number;
  ids: string[];
  apply?: (rows: Rows) => Rows;
}

export type ContactInput = Omit<Contact, 'id' | 'updatedBy' | 'updatedAt' | 'version' | 'aliases'>;
export type LocationInput = Omit<WorkLocation, 'id' | 'owner' | 'updatedBy' | 'updatedAt' | 'version'>;
export type ProfileInput = Pick<Profile, 'displayName' | 'specialty' | 'organization' | 'npi'>;
export type CredentialInput = Pick<Credential, 'type' | 'issuer' | 'expires' | 'renewalUrl'>;
export interface PlanInput {
  title: string;
  description: string;
  target?: DateStr;
  template: Plan['template'];
  status?: Plan['status'];
}
export interface EventInput {
  title: string;
  whose: Assignee;
  date: DateStr;
  endDate?: DateStr;
  startTime?: string;
  endTime?: string;
  location: string;
  notes: string;
  repeat?: EventRepeat;
}

export interface WeddingInput {
  date?: DateStr;
  time?: string;
  venue: string;
  address: string;
  budget?: number;
  schedule: string;
  notes: string;
}
export type MomentInput = { title: string; date: DateStr; place: string; story: string };
export type VendorInput = Omit<Vendor, 'id' | keyof Audit>;
export type GuestInput = Omit<Guest, 'id' | keyof Audit>;
export type BudgetInput = Omit<BudgetItem, 'id' | keyof Audit>;

export interface NewTask {
  title: string;
  assignee: Assignee;
  due?: DateStr;
  planId?: string;
  recurrence?: Recurrence;
  notes: string;
}

export interface Actions {
  /** Adds an item, or puts back a recently used one of the same name instead of making a second. */
  addItem: (listId: string, name: string, qty?: string, note?: string) => Promise<boolean>;
  toggleItem: (listId: string, itemId: string) => Promise<boolean>;
  editItem: (listId: string, itemId: string, patch: { name: string; qty: string; note: string }) => Promise<Outcome>;
  deleteItem: (listId: string, itemId: string) => Promise<boolean>;
  /** Removes every recently used (checked) item, with Undo. */
  clearChecked: (listId: string) => Promise<boolean>;
  saveList: (id: string | null, title: string, description: string) => Promise<Outcome<string>>;
  addTask: (t: NewTask) => Promise<Outcome<string>>;
  saveTask: (id: string, t: NewTask) => Promise<Outcome>;
  completeTask: (taskId: string) => Promise<boolean>;
  reopenTask: (taskId: string) => Promise<boolean>;
  savePlan: (id: string | null, p: PlanInput) => Promise<Outcome<string>>;
  saveContact: (id: string | null, c: ContactInput) => Promise<Outcome<string>>;
  saveHomeRecord: (id: string, v: { title: string; notes: string; fields: HomeField[] }) => Promise<Outcome>;
  saveLocation: (id: string | null, owner: MemberId, v: LocationInput) => Promise<Outcome<string>>;
  saveProfile: (id: MemberId, v: ProfileInput) => Promise<Outcome>;
  saveCredential: (id: string | null, owner: MemberId, v: CredentialInput) => Promise<Outcome<string>>;
  addInfo: (v: { template: HomeTemplate; title: string; details: string; notes: string }) => Promise<Outcome<string>>;
  saveEvent: (id: string | null, v: EventInput) => Promise<Outcome<string>>;
  saveWedding: (v: WeddingInput) => Promise<Outcome>;
  saveMoment: (id: string | null, v: MomentInput) => Promise<Outcome<string>>;
  /** Shrinks each photo on the device, uploads it, then adds it to the moment. Returns how many were added. */
  addPhotos: (momentId: string, files: File[]) => Promise<number>;
  /** Takes a photo out of a moment, with Undo. */
  removePhoto: (momentId: string, photoId: string) => Promise<boolean>;
  saveVendor: (id: string | null, v: VendorInput) => Promise<Outcome<string>>;
  saveGuest: (id: string | null, v: GuestInput) => Promise<Outcome<string>>;
  /** A one-tap RSVP change, with Undo. */
  setRsvp: (id: string, rsvp: Guest['rsvp']) => Promise<boolean>;
  saveBudgetItem: (id: string | null, v: BudgetInput) => Promise<Outcome<string>>;
  /** Removes one day of a repeating event (Undo puts it back). */
  skipEventDay: (id: string, day: DateStr) => Promise<Outcome>;
  /** Moves a record (and a list's items or a plan's tasks) to the trash, with Undo. */
  trashRecord: (id: string, what: string) => Promise<Outcome>;
  restore: (ids: string[]) => Promise<Outcome>;
  togglePin: (target: PinTarget) => boolean;
  setProtected: (recordId: string, slot: string, value: string) => Promise<Outcome>;
  clearProtected: (recordId: string, slot: string) => Promise<Outcome>;
  reveal: (recordId: string, slot: string) => Promise<Outcome<string>>;
}

interface Store {
  state: Household;
  me: MemberId;
  today: DateStr;
  saving: boolean;
  /** 'loading' until the first copy arrives; 'error' if that first load failed. */
  status: 'loading' | 'ready' | 'error';
  session: Session;
  banner: Banner | null;
  dismissBanner: () => void;
  refresh: () => Promise<void>;
  backend: Backend;
  actions: Actions;
  /**
   * Shared lists without a connection: `copy` is true while what's shown came from
   * the copy kept on this phone rather than the server; `waiting` counts ticks and
   * new items made offline that haven't reached the server yet.
   */
  offline: { copy: boolean; waiting: number };
  /** Demo build only: who you're viewing as, and the simulated failure switch. */
  demo?: { setMe: (m: MemberId) => void; failNext: boolean; setFailNext: (b: boolean) => void };
}

const Ctx = createContext<Store | null>(null);

const POLL_MS = 15_000;
const nowIso = () => new Date().toISOString();
const EMPTY: Household = { profiles: [], locations: [], credentials: [], home: [], contacts: [], lists: [], plans: [], tasks: [], events: [], moments: [], vendors: [], guests: [], budget: [], pins: { jeffrey: [], zul: [] } };

function index(rows: Row[]): Rows {
  const out: Rows = {};
  for (const r of rows) out[r.id] = r;
  return out;
}
const without = (rows: Rows, ids: string[]) => {
  const next = { ...rows };
  for (const id of ids) delete next[id];
  return next;
};
/** Applies an edit optimistically; with `by`, it is also stamped as changed now (the server's own stamp replaces it). */
const patchData = (rows: Rows, id: string, data: Record<string, unknown>, by?: MemberId): Rows =>
  rows[id] ? { ...rows, [id]: { ...rows[id]!, data, ...(by ? { updatedBy: by, updatedAt: nowIso() } : {}) } } : rows;

export function StoreProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const { toast } = useFeedback();
  const [today, setToday] = useState(() => todayIn());
  const [server, setServer] = useState<Rows>({});
  const [ops, setOps] = useState<Op[]>([]);
  const [me, setMeState] = useState<MemberId>('jeffrey');
  const [status, setStatus] = useState<Store['status']>('loading');
  const [session, setSession] = useState<Session>({ kind: 'ok' });
  const [pending, setPending] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [failNext, setFailNextState] = useState(false);
  const live = backend.mode === 'live';
  const online = useOnline();
  // The demo keeps nothing on the device; the signed-in app keeps its lists (only).
  const [outbox, setOutbox] = useState<OutboxEntry[]>(() => (live ? (readJson<OutboxEntry[]>(OUTBOX_KEY) ?? []) : []));
  const [copy, setCopy] = useState(false);
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;
  const copyRef = useRef(copy);
  copyRef.current = copy;

  const serverRef = useRef(server);
  serverRef.current = server;
  const meRef = useRef(me);
  meRef.current = me;
  const seq = useRef(0);
  const chains = useRef(new Map<string, Promise<unknown>>());
  const inflight = useRef(0);
  const writesDone = useRef(0);
  const etag = useRef<string | undefined>(undefined);
  const loading = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  const rows = useMemo(() => ops.reduce((r, op) => (op.apply ? op.apply(r) : r), applyOutbox(server, outbox, me)), [server, ops, outbox, me]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const savingIds = useMemo(() => new Set(ops.flatMap((o) => o.ids)), [ops]);
  const state = useMemo(() => (status === 'ready' ? toHousehold(Object.values(rows), savingIds) : EMPTY), [rows, savingIds, status]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const merge = useCallback((c: Change) => {
    setServer((s) => {
      const next = without(s, c.removed);
      for (const r of c.rows) next[r.id] = r;
      return next;
    });
  }, []);

  // ---------------------------------------------------------------- loading and quiet refresh

  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const doneAtStart = writesDone.current;
    try {
      const r = await backend.load(etag.current);
      if (!r) return; // nothing new
      // A copy fetched while one of our own saves was landing could be older than
      // what we already have; skip it and look again in a moment.
      if (inflight.current > 0 || writesDone.current !== doneAtStart) {
        window.setTimeout(() => void refresh(), 800);
        return;
      }
      etag.current = r.etag;
      setServer(index(r.snapshot.rows));
      setMeState(r.snapshot.me);
      setCopy(false);
      setStatus('ready');
      setSession({ kind: 'ok' });
    } catch (e) {
      if (e instanceof SessionError) {
        setSession({ kind: e.kind, message: e.message });
        if (e.kind === 'not_member') forgetLists();
      } else if (statusRef.current === 'loading') {
        // No connection at start: open the lists from the copy on this phone, if there is one.
        const saved = live ? readJson<ListsCopy>(COPY_KEY) : null;
        if (saved?.rows?.length) {
          setServer(index(saved.rows));
          setMeState(saved.me);
          setCopy(true);
          setStatus('ready');
        } else setStatus('error');
      }
      // Later refresh failures stay quiet: the screen keeps the last saved copy.
    } finally {
      loading.current = false;
    }
  }, [backend]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The household date rolls over while the app is open; the shared copy is
  // refreshed quietly while the app is in view, and as soon as it comes back.
  useEffect(() => {
    const tick = () => setToday(todayIn());
    const visible = () => {
      tick();
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    const clock = window.setInterval(tick, 60_000);
    const poll = backend.mode === 'live' ? window.setInterval(() => document.visibilityState === 'visible' && navigator.onLine && void refresh(), POLL_MS) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
      window.clearInterval(clock);
      if (poll) window.clearInterval(poll);
    };
  }, [backend, refresh]);

  // ---------------------------------------------------------------- lists offline

  // Keep the server's lists (never the screen's unsaved state, never anything else) on this phone.
  useEffect(() => {
    if (!live || copy || status !== 'ready') return;
    writeJson(COPY_KEY, { me, savedAt: nowIso(), rows: copyRows(Object.values(server)) } satisfies ListsCopy);
  }, [live, copy, status, server, me]);
  useEffect(() => {
    if (live) writeJson(OUTBOX_KEY, outbox.length ? outbox : null);
  }, [live, outbox]);

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || outboxRef.current.length === 0) return;
    flushing.current = true;
    let sent = 0;
    let lost = 0;
    try {
      for (const e of [...outboxRef.current]) {
        try {
          const cur = serverRef.current[e.id];
          if (e.t === 'add' && !cur) {
            if (serverRef.current[e.listId]) {
              merge(await backend.create('item', e.id, e.data, e.listId));
              sent += 1;
            } else lost += 1; // its list was removed meanwhile
          } else {
            // A tick, or an offline addition that arrived after all: make the server's copy match.
            const want = e.t === 'add' ? { t: 'toggle' as const, id: e.id, checked: e.data.checked, at: e.at } : e;
            let now = cur;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const data = toggleChange(want, now);
              if (!data || !now) break;
              try {
                merge(await backend.update(e.id, now.version, data));
                sent += 1;
                break;
              } catch (err) {
                if (!(err instanceof ConflictError) || attempt === 1) throw err;
                merge({ rows: [err.current], removed: [] });
                now = err.current;
              }
            }
          }
        } catch (err) {
          if (err instanceof SessionError) {
            setSession({ kind: err.kind, message: err.message });
            return;
          }
          if (!(err instanceof SaveError) || err.status === 0 || err.status >= 500) return; // still no connection: try again later
          lost += 1; // refused (the list or item is gone): let it go
        }
        setOutbox((b) => b.filter((x) => x !== e));
      }
    } finally {
      flushing.current = false;
      if (sent) toast(`Synced ${sent} change${sent === 1 ? '' : 's'} made offline.`);
      if (lost) toast(`${lost} offline change${lost === 1 ? '' : 's'} couldn’t be saved: ${lost === 1 ? 'its' : 'their'} list or item was removed on the other phone.`, { tone: 'error' });
    }
  }, [backend, merge, toast]);

  // Back online, with the server's copy loaded: send what waited. A weak signal can
  // fail without the phone noticing, so while anything waits, try again every so often.
  const canSync = online && !copy && status === 'ready' && session.kind === 'ok' && outbox.length > 0;
  useEffect(() => {
    if (!canSync) return;
    void flush();
    const again = window.setInterval(() => document.visibilityState === 'visible' && navigator.onLine && void flush(), POLL_MS);
    return () => window.clearInterval(again);
  }, [canSync, outbox.length, flush]);
  // Offline from the start, then a connection: load the server's copy, then send.
  useEffect(() => {
    if (online && copy) void refresh();
  }, [online, copy, refresh]);

  // ---------------------------------------------------------------- one change

  const run = useCallback(
    async <T,>(o: {
      label: string;
      ids: string[];
      apply?: (rows: Rows) => Rows;
      send: () => Promise<Change>;
      value?: (c: Change) => T;
      retry?: () => void;
      /** The form that made this change shows the outcome itself (no alert banner). */
      quiet?: boolean;
      /** For a list tick or a new item: if the connection fails, keep it for later instead. */
      offline?: () => void;
    }): Promise<Outcome<T>> => {
      const key = ++seq.current;
      setOps((x) => [...x, { key, ids: o.ids, apply: o.apply }]);
      setPending((n) => n + 1);
      inflight.current += 1;
      const before = o.ids.map((id) => chains.current.get(id) ?? Promise.resolve());
      const p = Promise.all(before).then(() => o.send());
      const settled = p.catch(() => undefined);
      for (const id of o.ids) chains.current.set(id, settled);
      try {
        const c = await p;
        merge(c);
        if (!o.quiet) setBanner(null);
        return { ok: true, value: (o.value ? o.value(c) : undefined) as T };
      } catch (e) {
        if (o.offline && e instanceof SaveError && e.status === 0) {
          o.offline();
          return { ok: true, value: undefined as T };
        }
        return { ok: false, message: failed(e, o) };
      } finally {
        setOps((x) => x.filter((op) => op.key !== key));
        setPending((n) => n - 1);
        inflight.current -= 1;
        writesDone.current += 1;
        for (const id of o.ids) if (chains.current.get(id) === settled) chains.current.delete(id);
        if (backend.mode === 'demo') setFailNextState((backend as unknown as { failNext: boolean }).failNext);
      }
    },
    // `failed` only uses setters, refs and stable callbacks.
    [backend, merge],
  );

  function failed(e: unknown, o: { label: string; retry?: () => void; quiet?: boolean }): string {
    if (e instanceof SessionError) {
      setSession({ kind: e.kind, message: e.message });
      return e.message;
    }
    if (e instanceof ConflictError) {
      merge({ rows: [e.current], removed: [] });
      const who = e.current.updatedBy === meRef.current ? 'You' : MEMBERS[e.current.updatedBy].name;
      const where = e.current.updatedBy === meRef.current ? 'on another device' : 'on the other phone';
      if (!o.quiet) setBanner({ message: `${who} changed this ${where} just now, so ${o.label}. You’re seeing the latest version.` });
      return `${who} saved a newer version ${where} a moment ago. Your edits are still here — save again to replace it, or cancel to keep it.`;
    }
    const err = e instanceof SaveError ? e : new SaveError('Something went wrong.');
    const transient = err.status === 0 || err.status >= 500;
    if (!transient) void refresh(); // the server has a different picture; catch up
    const msg = transient ? `Couldn’t save: ${o.label}. Your last saved version is showing.` : `Couldn’t save: ${o.label}. ${err.message}`;
    if (!o.quiet) setBanner({ message: msg, retry: transient ? o.retry : undefined });
    return transient ? 'Couldn’t save — your changes are still here. Try again.' : err.message;
  }

  // ---------------------------------------------------------------- actions

  const actions = useMemo<Actions>(() => {
    const ver = (id: string) => {
      const v = serverRef.current[id]?.version;
      if (v === undefined) throw new SaveError('It wasn’t saved yet.', 0, 'network');
      return v;
    };
    const row = (id: string) => rowsRef.current[id];
    const draft = (kind: Kind, id: string, data: Record<string, unknown>, parentId?: string): Row => ({
      id, kind, ...(parentId ? { parentId } : {}), version: 0, data, createdBy: meRef.current, createdAt: nowIso(), updatedBy: meRef.current, updatedAt: nowIso(),
    });
    const create = <T,>(label: string, kind: Kind, id: string, data: Record<string, unknown>, opts: { parentId?: string; quiet?: boolean; value?: (c: Change) => T } = {}) => {
      const go = (): Promise<Outcome<T>> =>
        run<T>({
          label,
          ids: [id],
          quiet: opts.quiet,
          apply: (r) => ({ ...r, [id]: draft(kind, id, data, kind === 'task' ? (data.planId as string | undefined) : opts.parentId) }),
          send: () => backend.create(kind, id, data, opts.parentId),
          value: opts.value,
          retry: () => void go(),
        });
      return go();
    };
    const update = (label: string, id: string, data: Record<string, unknown>, quiet = false, offline?: () => void) => {
      const go = (): Promise<Outcome> =>
        run({ label, ids: [id], quiet, offline, apply: (r) => patchData(r, id, data, meRef.current), send: () => backend.update(id, ver(id), data), retry: () => void go() });
      return go();
    };
    /** No connection (or only the copy on this phone): list changes wait in the outbox. */
    const offlineNow = () => !navigator.onLine || copyRef.current;
    const later = (fn: (b: OutboxEntry[]) => OutboxEntry[]) => setOutbox((b) => fn(b));
    const restoreIds = (ids: string[], label: string) => run<void>({ label, ids, send: () => backend.restore(ids) });

    const listRows = (listId: string) => Object.values(rowsRef.current).filter((r) => r.kind === 'item' && r.parentId === listId);
    // A new or put-back item goes to the end of the list.
    const nextPosition = (listId: string) => Math.max(0, ...listRows(listId).map((r) => r.data.position as number)) + 1;

    const a: Actions = {
      async addItem(listId, name, qty = '', note = '') {
        const n = name.trim();
        const key = n.toLowerCase();
        const recent = listRows(listId)
          .filter((r) => r.data.checked === true && (r.data.name as string).trim().toLowerCase() === key)
          .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0];
        const position = nextPosition(listId);
        if (recent) {
          const back = () => later((box) => queueToggle(box, recent.id, false, position, nowIso()));
          if (offlineNow()) {
            back();
            return true;
          }
          return (await update(`“${recent.data.name as string}” wasn’t put back`, recent.id, { ...recent.data, checked: false, position }, false, back)).ok;
        }
        const id = newRowId('i');
        const data = { name: n, qty, note, checked: false, position };
        const keep = () => later((box) => queueAdd(box, id, listId, { name: n, qty, note, position }, nowIso(), meRef.current));
        if (offlineNow()) {
          keep();
          return true;
        }
        const go = (): Promise<Outcome<unknown>> =>
          run({
            label: `“${n}” wasn’t added`,
            ids: [id],
            offline: keep,
            apply: (r) => ({ ...r, [id]: draft('item', id, data, listId) }),
            send: () => backend.create('item', id, data, listId),
            retry: () => void go(),
          });
        return (await go()).ok;
      },

      async toggleItem(listId, itemId) {
        const it = row(itemId);
        if (!it) return false;
        const was = it.data.checked === true;
        const name = it.data.name as string;
        const position = was ? nextPosition(listId) : undefined;
        const data = was ? { ...it.data, checked: false, position } : { ...it.data, checked: true };
        const keep = () => later((box) => queueToggle(box, itemId, !was, position, nowIso()));
        const r = offlineNow() ? (keep(), { ok: true as const, value: undefined }) : await update(`“${name}” wasn’t ${was ? 'put back' : 'checked off'}`, itemId, data, false, keep);
        if (r.ok) toast(was ? `“${name}” put back.` : `Checked off “${name}”.`, { action: { label: 'Undo', onClick: () => void a.toggleItem(listId, itemId) } });
        return r.ok;
      },

      async editItem(_listId, itemId, patch) {
        const it = row(itemId);
        if (!it) return { ok: false, message: 'That item isn’t here any more.' };
        return update(`changes to “${it.data.name as string}”`, itemId, { ...it.data, ...patch }, true);
      },

      async deleteItem(_listId, itemId) {
        const it = row(itemId);
        if (!it) return false;
        const name = it.data.name as string;
        const r = await run({ label: `“${name}” wasn’t removed`, ids: [itemId], apply: (x) => without(x, [itemId]), send: () => backend.remove(itemId, ver(itemId)) });
        if (r.ok) toast(`Removed “${name}”.`, { action: { label: 'Undo', onClick: () => void restoreIds([itemId], `“${name}” wasn’t restored`) } });
        return r.ok;
      },

      async clearChecked(listId) {
        const ids = Object.values(rowsRef.current).filter((r) => r.kind === 'item' && r.parentId === listId && r.data.checked === true).map((r) => r.id);
        if (ids.length === 0) return false;
        const r = await run({
          label: 'checked items weren’t cleared',
          ids,
          apply: (x) => without(x, ids),
          send: () => backend.clearChecked(listId, ids.map((id) => ({ id, version: ver(id) }))),
          value: (c) => c.removed,
          retry: () => void a.clearChecked(listId),
        });
        if (r.ok && r.value.length > 0) {
          const n = r.value.length;
          toast(`Cleared ${n} recently used item${n === 1 ? '' : 's'}.`, { action: { label: 'Undo', onClick: () => void restoreIds(r.value, 'the cleared items weren’t restored') } });
        }
        return r.ok;
      },

      async saveList(id, title, description) {
        const data = { title: title.trim(), description: description.trim() };
        if (id) {
          const r = await update(`the list “${data.title}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('list');
        return create(`the list “${data.title}” wasn’t created`, 'list', nid, data, { quiet: true, value: () => nid });
      },

      async addTask(t) {
        const id = newRowId('t');
        const data = taskData(id, t, { status: 'open' });
        return create(`the task “${t.title.trim()}” wasn’t added`, 'task', id, data, { quiet: true, value: () => id });
      },

      async saveTask(id, t) {
        const cur = row(id);
        if (!cur) return { ok: false, message: 'That task isn’t here any more.' };
        const keep = cur.data as { seriesId: string; status: 'open' | 'done'; completedOn?: string; createdFrom?: string };
        return update(`changes to “${t.title.trim()}”`, id, taskData(keep.seriesId, t, keep), true);
      },

      async completeTask(taskId) {
        const t = row(taskId);
        if (!t || t.data.status === 'done') return false;
        const title = t.data.title as string;
        const r = await run({
          label: `“${title}” wasn’t marked done`,
          ids: [taskId],
          apply: (x) => patchData(x, taskId, { ...x[taskId]!.data, status: 'done', completedOn: todayIn() }),
          send: () => backend.complete(taskId),
          value: (c) => c.rows.find((x) => x.data.createdFrom === taskId && x.id !== taskId),
          retry: () => void a.completeTask(taskId),
        });
        if (r.ok) {
          const due = r.value?.data.due as string | undefined;
          toast(`Done: “${title}”.${due ? ` Next one: ${displayDate(due, todayIn())}.` : ''}`, { action: { label: 'Undo', onClick: () => void a.reopenTask(taskId) } });
        }
        return r.ok;
      },

      async reopenTask(taskId) {
        const t = row(taskId);
        if (!t) return false;
        const successors = Object.values(rowsRef.current).filter((x) => x.kind === 'task' && x.data.createdFrom === taskId && x.version === 1 && x.data.status === 'open').map((x) => x.id);
        const data = { ...t.data, status: 'open' };
        delete (data as { completedOn?: string }).completedOn;
        return (
          await run({
            label: `“${t.data.title as string}” wasn’t reopened`,
            ids: [taskId, ...successors],
            apply: (x) => without(patchData(x, taskId, data), successors),
            send: () => backend.reopen(taskId),
            retry: () => void a.reopenTask(taskId),
          })
        ).ok;
      },

      async savePlan(id, p) {
        const data = { title: p.title.trim(), description: p.description.trim(), template: p.template, status: p.status ?? 'active', ...(p.target ? { target: p.target } : {}) };
        if (id) {
          const r = await update(`the plan “${data.title}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('plan');
        return create(`the plan “${data.title}” wasn’t created`, 'plan', nid, data, { quiet: true, value: () => nid });
      },

      async saveContact(id, c) {
        const existing = id ? row(id) : undefined;
        const data = { ...c, aliases: (existing?.data.aliases as string[] | undefined) ?? [] };
        if (id) {
          const r = await update(`the contact “${c.name}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('contact');
        return create(`the contact “${c.name}” wasn’t saved`, 'contact', nid, data, { quiet: true, value: () => nid });
      },

      async saveHomeRecord(id, v) {
        const cur = row(id);
        if (!cur) return { ok: false, message: 'That card isn’t here any more.' };
        // Protected fields travel as markers only; their values never leave the server.
        const fields = v.fields.map((f) => (f.protected ? { id: f.id, label: f.label, kind: f.kind, protected: true } : { id: f.id, label: f.label, kind: f.kind, value: f.value ?? '' }));
        return update(`“${v.title}” wasn’t saved`, id, { template: cur.data.template, title: v.title, notes: v.notes, fields }, true);
      },

      async saveLocation(id, owner, v) {
        const data = { owner, ...v };
        if (id) {
          const r = await update(`the work location “${v.label}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('loc');
        return create(`the work location “${v.label}” wasn’t saved`, 'location', nid, data, { quiet: true, value: () => nid });
      },

      async saveProfile(id, v) {
        return update('your work details weren’t saved', id, { ...v }, true);
      },

      async saveCredential(id, owner, v) {
        const data = { owner, type: v.type, issuer: v.issuer, ...(v.expires ? { expires: v.expires } : {}), ...(v.renewalUrl ? { renewalUrl: v.renewalUrl } : {}) };
        if (id) {
          const r = await update(`“${v.type}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('cred');
        return create(`“${v.type}” wasn’t saved`, 'credential', nid, data, { quiet: true, value: () => nid });
      },

      async addInfo(v) {
        const fields = v.details.trim() ? [{ id: newRowId('f'), label: 'Details', kind: 'text', value: v.details.trim() }] : [];
        const id = newRowId('home');
        return create(`“${v.title.trim()}” wasn’t saved`, 'home', id, { template: v.template, title: v.title.trim(), fields, notes: v.notes.trim() }, { quiet: true, value: () => id });
      },

      async saveEvent(id, v) {
        const existing = id ? row(id) : undefined;
        const data: Record<string, unknown> = {
          title: v.title.trim(), whose: v.whose, date: v.date, location: v.location.trim(), notes: v.notes.trim(),
          // A changed first day or repeat makes earlier one-off removals meaningless; otherwise keep them.
          skips: existing && existing.data.date === v.date && JSON.stringify(existing.data.repeat ?? null) === JSON.stringify(v.repeat ?? null) ? (existing.data.skips as string[]) ?? [] : [],
        };
        if (v.startTime) {
          data.startTime = v.startTime;
          if (v.endTime) data.endTime = v.endTime;
        } else if (v.endDate) data.endDate = v.endDate;
        if (v.repeat) data.repeat = v.repeat;
        if (id) {
          const r = await update(`“${data.title as string}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('ev');
        return create(`“${data.title as string}” wasn’t saved`, 'event', nid, data, { quiet: true, value: () => nid });
      },

      async saveWedding(v) {
        const data: Record<string, unknown> = { venue: v.venue.trim(), address: v.address.trim(), schedule: v.schedule.trim(), notes: v.notes.trim() };
        if (v.date) data.date = v.date;
        if (v.time) data.time = v.time;
        if (v.budget !== undefined) data.budget = v.budget;
        if (row(WEDDING_ID)) return update('the wedding details weren’t saved', WEDDING_ID, data, true);
        const r = await create('the wedding details weren’t saved', 'wedding', WEDDING_ID, data, { quiet: true });
        return r.ok ? { ok: true, value: undefined } : r;
      },

      async saveMoment(id, v) {
        const existing = id ? row(id) : undefined;
        const data = { title: v.title.trim(), date: v.date, place: v.place.trim(), story: v.story.trim(), photos: (existing?.data.photos as PhotoRef[] | undefined) ?? [] };
        if (id) {
          const r = await update(`“${data.title}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('m');
        return create(`“${data.title}” wasn’t saved`, 'moment', nid, data, { quiet: true, value: () => nid });
      },

      async addPhotos(momentId, files) {
        const added: PhotoRef[] = [];
        const failed: string[] = [];
        for (const file of files) {
          const room = MAX_PHOTOS - ((row(momentId)?.data.photos as PhotoRef[] | undefined)?.length ?? 0) - added.length;
          if (room <= 0) {
            failed.push(`A moment keeps up to ${MAX_PHOTOS} photos.`);
            break;
          }
          try {
            const p = await preparePhoto(file);
            added.push(await backend.uploadPhoto(p.blob, p.w, p.h));
          } catch (e) {
            if (e instanceof SessionError) {
              setSession({ kind: e.kind, message: e.message });
              return 0;
            }
            failed.push(e instanceof Error ? e.message : 'A photo wasn’t saved.');
          }
        }
        let n = 0;
        if (added.length) {
          const cur = row(momentId);
          if (cur) {
            const r = await update('the photos weren’t added', momentId, { ...cur.data, photos: [...((cur.data.photos as PhotoRef[]) ?? []), ...added] });
            if (r.ok) n = added.length;
          }
        }
        if (failed.length) toast(failed[0]!, { tone: 'error' });
        else if (n) toast(n === 1 ? 'Photo added.' : `${n} photos added.`);
        return n;
      },

      async removePhoto(momentId, photoId) {
        const cur = row(momentId);
        if (!cur) return false;
        const before = (cur.data.photos as PhotoRef[]) ?? [];
        const at = before.findIndex((p) => p.id === photoId);
        if (at < 0) return false;
        const r = await update('the photo wasn’t removed', momentId, { ...cur.data, photos: before.filter((p) => p.id !== photoId) });
        if (r.ok) {
          toast('Photo removed.', {
            action: {
              label: 'Undo',
              onClick: () => {
                const now = row(momentId);
                if (!now) return;
                const list = [...((now.data.photos as PhotoRef[]) ?? [])];
                list.splice(Math.min(at, list.length), 0, before[at]!);
                void update('the photo wasn’t put back', momentId, { ...now.data, photos: list });
              },
            },
          });
        }
        return r.ok;
      },

      async saveVendor(id, v) {
        const data: Record<string, unknown> = { ...v, name: v.name.trim(), notes: v.notes.trim() };
        if (v.deposit !== 'due') delete data.depositDue;
        else if (!v.depositDue) delete data.depositDue;
        if (id) {
          const r = await update(`“${v.name}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('vendor');
        return create(`“${v.name}” wasn’t saved`, 'vendor', nid, data, { quiet: true, value: () => nid });
      },

      async saveGuest(id, v) {
        const data = { ...v, name: v.name.trim(), notes: v.notes.trim() };
        if (id) {
          const r = await update(`“${v.name}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('guest');
        return create(`“${v.name}” wasn’t saved`, 'guest', nid, data, { quiet: true, value: () => nid });
      },

      async setRsvp(id, rsvp) {
        const g = row(id);
        if (!g || g.data.rsvp === rsvp) return false;
        const was = g.data.rsvp as Guest['rsvp'];
        const name = g.data.name as string;
        const r = await update(`${name}’s RSVP wasn’t saved`, id, { ...g.data, rsvp });
        if (r.ok) toast(`${name}: ${rsvp === 'yes' ? 'coming' : rsvp === 'no' ? 'not coming' : 'no answer yet'}.`, { action: { label: 'Undo', onClick: () => void a.setRsvp(id, was) } });
        return r.ok;
      },

      async saveBudgetItem(id, v) {
        const data = { ...v, title: v.title.trim(), notes: v.notes.trim() };
        if (id) {
          const r = await update(`“${v.title}” wasn’t saved`, id, data, true);
          return r.ok ? { ok: true, value: id } : r;
        }
        const nid = newRowId('budget');
        return create(`“${v.title}” wasn’t saved`, 'budget', nid, data, { quiet: true, value: () => nid });
      },

      async skipEventDay(id, day) {
        const ev = row(id);
        if (!ev) return { ok: false, message: 'That event isn’t here any more.' };
        const before = (ev.data.skips as string[] | undefined) ?? [];
        const r = await update('that day wasn’t removed', id, { ...ev.data, skips: [...before, day] });
        if (r.ok) {
          toast(`Removed ${displayDate(day, todayIn())} only.`, {
            action: {
              label: 'Undo',
              onClick: () => {
                const now = row(id);
                if (now) void update('that day wasn’t put back', id, { ...now.data, skips: ((now.data.skips as string[]) ?? []).filter((d) => d !== day) });
              },
            },
          });
        }
        return r;
      },

      async trashRecord(id, what) {
        const cur = row(id);
        if (!cur) return { ok: false, message: 'That isn’t here any more.' };
        const along = Object.values(rowsRef.current).filter((x) => x.parentId === id).map((x) => x.id);
        const r = await run<void>({ label: `${what} wasn’t moved to the trash`, ids: [id], apply: (x) => without(x, [id, ...along]), send: () => backend.remove(id, ver(id)), quiet: true });
        if (r.ok) toast(`Moved ${what} to the trash.`, { action: { label: 'Undo', onClick: () => void restoreIds([id], `${what} wasn’t restored`) } });
        return r;
      },

      restore: (ids) => restoreIds(ids, 'that wasn’t restored'),

      togglePin(target) {
        // Pins to things that are gone (deleted, or in the trash) don't count and are dropped.
        const mine = stateRef.current.pins[meRef.current].filter((p) => resolvePin(stateRef.current, p, meRef.current) !== null);
        const has = mine.some((p) => p.kind === target.kind && p.id === target.id);
        if (!has && mine.length >= MAX_PINS) {
          toast('You can pin up to six shortcuts. Unpin one first.', { tone: 'error' });
          return false;
        }
        const targets = has ? mine.filter((p) => !(p.kind === target.kind && p.id === target.id)) : [...mine, target];
        const pinsId = `pins-${meRef.current}`;
        void run({
          label: has ? 'the pin wasn’t removed' : 'the pin wasn’t saved',
          ids: [pinsId],
          apply: (x) => (x[pinsId] ? patchData(x, pinsId, { targets }) : { ...x, [pinsId]: draft('pins', pinsId, { targets }) }),
          send: () => backend.setPins(targets),
        }).then((r) => r.ok && toast(has ? 'Unpinned from Home.' : 'Pinned to Home.'));
        return true;
      },

      async setProtected(recordId, slot, value) {
        if (!backend.setProtected) return { ok: false, message: 'Protected values can’t be saved in the demo.' };
        return run({ label: 'the protected value wasn’t saved', ids: [recordId], send: () => backend.setProtected!(recordId, slot, value), quiet: true });
      },

      async clearProtected(recordId, slot) {
        if (!backend.clearProtected) return { ok: false, message: 'Not available in the demo.' };
        return run({ label: 'the protected value wasn’t removed', ids: [recordId], send: () => backend.clearProtected!(recordId, slot), quiet: true });
      },

      async reveal(recordId, slot) {
        if (!backend.reveal) return { ok: false, message: 'Not available in the demo.' };
        try {
          return { ok: true, value: await backend.reveal(recordId, slot) };
        } catch (e) {
          if (e instanceof SessionError) setSession({ kind: e.kind, message: e.message });
          return { ok: false, message: e instanceof Error ? e.message : 'Couldn’t show it.' };
        }
      },
    };
    return a;
  }, [backend, run, toast]);

  const demo = useMemo<Store['demo']>(() => {
    if (backend.mode !== 'demo') return undefined;
    const b = backend as unknown as { me: MemberId; failNext: boolean };
    return {
      setMe: (m: MemberId) => {
        b.me = m;
        setMeState(m);
        void refresh();
      },
      failNext,
      setFailNext: (v: boolean) => {
        b.failNext = v;
        setFailNextState(v);
      },
    };
  }, [backend, failNext, refresh]);

  const value = useMemo<Store>(
    () => ({ state, me, today, saving: pending > 0, status, session, banner, dismissBanner: () => setBanner(null), refresh, backend, actions, offline: { copy, waiting: outbox.length }, demo }),
    [state, me, today, pending, status, session, banner, refresh, backend, actions, copy, outbox.length, demo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** A task's stored fields from a form's input (status and series are the server's to change). */
function taskData(seriesId: string, t: NewTask, keep: { status: 'open' | 'done'; completedOn?: string; createdFrom?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { seriesId, title: t.title.trim(), assignee: t.assignee, status: keep.status, notes: t.notes.trim() };
  if (t.planId) out.planId = t.planId;
  if (t.due) out.due = t.due;
  if (t.recurrence && !t.planId) out.recurrence = t.recurrence;
  if (keep.completedOn) out.completedOn = keep.completedOn;
  if (keep.createdFrom) out.createdFrom = keep.createdFrom;
  return out;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
