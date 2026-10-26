import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeDemoHousehold } from './demo.ts';
import type {
  Assignee, Contact, FieldKind, HomeField, HomeRecord, HomeTemplate, Household, ListItem, MemberId, PinTarget, Plan, SharedList, Task, WorkLocation,
} from './types.ts';
import { displayDate, todayIn, type DateStr } from '../lib/dates.ts';
import { useFeedback } from '../lib/feedback.tsx';
import { newId } from '../lib/id.ts';
import type { Recurrence } from '../lib/recurrence.ts';
import { completeTask as completeTaskPure, reopenTask as reopenTaskPure } from '../lib/tasks.ts';

/**
 * Stage 1 data layer: in-memory demo data behind the same shape the real API will
 * have. Every change is applied optimistically, "saved" through a simulated network
 * call, and rolled back to the last confirmed state (with Retry) if that call fails.
 * Nothing is persisted — closing the app resets the demo. Stage 2 replaces
 * `network()` with authenticated, household-scoped requests and version checks.
 */

export interface Banner {
  message: string;
  retry?: () => void;
}

interface CommitOpts {
  label: string;
  apply: () => void;
  confirm?: () => void;
  rollback: () => void;
  retry: () => void;
}

export interface Actions {
  addItem: (listId: string, name: string, qty?: string, note?: string) => Promise<boolean>;
  toggleItem: (listId: string, itemId: string) => Promise<boolean>;
  editItem: (listId: string, itemId: string, patch: Pick<ListItem, 'name' | 'qty' | 'note'>) => Promise<boolean>;
  deleteItem: (listId: string, itemId: string) => Promise<boolean>;
  moveItem: (listId: string, itemId: string, dir: -1 | 1) => Promise<boolean>;
  clearChecked: (listId: string) => Promise<boolean>;
  newList: (title: string, description: string) => Promise<string | null>;
  addTask: (t: NewTask) => Promise<boolean>;
  completeTask: (taskId: string) => Promise<boolean>;
  reopenTask: (taskId: string) => Promise<boolean>;
  addPlan: (p: { title: string; description: string; target?: DateStr; template: Plan['template'] }) => Promise<string | null>;
  saveContact: (id: string | null, c: ContactInput) => Promise<string | null>;
  saveHomeRecord: (id: string, v: { title: string; notes: string; fields: HomeField[] }) => Promise<boolean>;
  saveLocation: (id: string | null, owner: MemberId, v: Omit<WorkLocation, 'id' | 'owner' | 'updatedBy' | 'updatedAt'>) => Promise<string | null>;
  addInfo: (v: { template: HomeTemplate; title: string; details: string; notes: string }) => Promise<string | null>;
  togglePin: (target: PinTarget) => boolean;
}

export type ContactInput = Omit<Contact, 'id' | 'updatedBy' | 'updatedAt' | 'aliases'>;

export interface NewTask {
  title: string;
  assignee: Assignee;
  due?: DateStr;
  planId?: string;
  recurrence?: Recurrence;
  notes: string;
}

interface Store {
  state: Household;
  me: MemberId;
  setMe: (m: MemberId) => void;
  today: DateStr;
  saving: boolean;
  banner: Banner | null;
  dismissBanner: () => void;
  failNext: boolean;
  setFailNext: (b: boolean) => void;
  actions: Actions;
}

const Ctx = createContext<Store | null>(null);

const nowIso = () => new Date().toISOString();

export function StoreProvider({ children }: { children: ReactNode }) {
  const { toast } = useFeedback();
  const [today, setToday] = useState(() => todayIn());
  const [state, setState] = useState<Household>(() => makeDemoHousehold(todayIn()));
  const [me, setMe] = useState<MemberId>('jeffrey');
  const [pending, setPending] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [failNext, setFailNextState] = useState(false);

  // Latest state/me for actions that need to read "what's confirmed right now".
  const stateRef = useRef(state);
  stateRef.current = state;
  const meRef = useRef(me);
  meRef.current = me;
  const failRef = useRef(false);
  const setFailNext = useCallback((b: boolean) => {
    failRef.current = b;
    setFailNextState(b);
  }, []);

  // The household date rolls over while the app is open.
  useEffect(() => {
    const tick = () => setToday(todayIn());
    document.addEventListener('visibilitychange', tick);
    const id = window.setInterval(tick, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', tick);
      window.clearInterval(id);
    };
  }, []);

  const network = useCallback(async () => {
    await new Promise((r) => window.setTimeout(r, 140));
    if (!navigator.onLine) throw new Error('offline');
    if (failRef.current) {
      failRef.current = false;
      setFailNextState(false);
      throw new Error('simulated failure');
    }
  }, []);

  const commit = useCallback(
    async ({ label, apply, confirm, rollback, retry }: CommitOpts): Promise<boolean> => {
      apply();
      setPending((n) => n + 1);
      try {
        await network();
        confirm?.();
        setBanner(null);
        return true;
      } catch {
        rollback();
        setBanner({ message: `Couldn’t save: ${label}. Your last saved version is showing.`, retry });
        return false;
      } finally {
        setPending((n) => n - 1);
      }
    },
    [network],
  );

  const listPatch = useCallback((listId: string, fn: (l: SharedList) => SharedList) => {
    setState((s) => ({ ...s, lists: s.lists.map((l) => (l.id === listId ? fn(l) : l)) }));
  }, []);
  const itemPatch = useCallback(
    (listId: string, itemId: string, fn: (i: ListItem) => ListItem) => listPatch(listId, (l) => ({ ...l, items: l.items.map((i) => (i.id === itemId ? fn(i) : i)) })),
    [listPatch],
  );
  const findItem = (listId: string, itemId: string) => stateRef.current.lists.find((l) => l.id === listId)?.items.find((i) => i.id === itemId);

  const actions = useMemo<Actions>(() => {
    const a: Actions = {
      async addItem(listId, name, qty = '', note = '') {
        const item: ListItem = { id: newId('i'), name: name.trim(), qty, note, checked: false, updatedBy: meRef.current, sync: 'saving' };
        return commit({
          label: `“${item.name}” wasn’t added`,
          apply: () => listPatch(listId, (l) => ({ ...l, items: [...l.items, item] })),
          confirm: () => itemPatch(listId, item.id, (i) => ({ ...i, sync: undefined })),
          rollback: () => listPatch(listId, (l) => ({ ...l, items: l.items.filter((i) => i.id !== item.id) })),
          retry: () => void a.addItem(listId, name, qty, note),
        });
      },

      async toggleItem(listId, itemId) {
        const it = findItem(listId, itemId);
        if (!it) return false;
        const prev = it.checked;
        const ok = await commit({
          label: `“${it.name}” wasn’t ${prev ? 'unchecked' : 'checked'}`,
          apply: () => itemPatch(listId, itemId, (i) => ({ ...i, checked: !prev, sync: 'saving', updatedBy: meRef.current })),
          confirm: () => itemPatch(listId, itemId, (i) => ({ ...i, sync: undefined })),
          rollback: () => itemPatch(listId, itemId, (i) => ({ ...i, checked: prev, sync: undefined })),
          retry: () => void a.toggleItem(listId, itemId),
        });
        if (ok) toast(prev ? `“${it.name}” put back.` : `Checked “${it.name}”.`, { action: { label: 'Undo', onClick: () => void a.toggleItem(listId, itemId) } });
        return ok;
      },

      async editItem(listId, itemId, patch) {
        const it = findItem(listId, itemId);
        if (!it) return false;
        const prev = { name: it.name, qty: it.qty, note: it.note };
        return commit({
          label: `changes to “${it.name}”`,
          apply: () => itemPatch(listId, itemId, (i) => ({ ...i, ...patch, updatedBy: meRef.current, sync: 'saving' })),
          confirm: () => itemPatch(listId, itemId, (i) => ({ ...i, sync: undefined })),
          rollback: () => itemPatch(listId, itemId, (i) => ({ ...i, ...prev, sync: undefined })),
          retry: () => void a.editItem(listId, itemId, patch),
        });
      },

      async deleteItem(listId, itemId) {
        const list = stateRef.current.lists.find((l) => l.id === listId);
        const idx = list?.items.findIndex((i) => i.id === itemId) ?? -1;
        const it = list?.items[idx];
        if (!list || !it) return false;
        const restore = () => listPatch(listId, (l) => (l.items.some((i) => i.id === it.id) ? l : { ...l, items: [...l.items.slice(0, idx), { ...it, sync: undefined }, ...l.items.slice(idx)] }));
        const ok = await commit({
          label: `“${it.name}” wasn’t removed`,
          apply: () => listPatch(listId, (l) => ({ ...l, items: l.items.filter((i) => i.id !== itemId) })),
          rollback: restore,
          retry: () => void a.deleteItem(listId, itemId),
        });
        if (ok) toast(`Removed “${it.name}”.`, { action: { label: 'Undo', onClick: () => void commit({ label: `“${it.name}” wasn’t restored`, apply: restore, rollback: () => listPatch(listId, (l) => ({ ...l, items: l.items.filter((i) => i.id !== it.id) })), retry: () => undefined }) } });
        return ok;
      },

      async moveItem(listId, itemId, dir) {
        const list = stateRef.current.lists.find((l) => l.id === listId);
        const i = list?.items.findIndex((x) => x.id === itemId) ?? -1;
        if (!list || i < 0) return false;
        const checked = list.items[i]!.checked;
        let j = i + dir;
        while (j >= 0 && j < list.items.length && list.items[j]!.checked !== checked) j += dir;
        if (j < 0 || j >= list.items.length) return false;
        const swap = (arr: ListItem[]) => {
          const next = [...arr];
          const x = next.findIndex((it) => it.id === itemId);
          const y = next.findIndex((it) => it.id === list.items[j]!.id);
          if (x < 0 || y < 0) return arr;
          [next[x], next[y]] = [next[y]!, next[x]!];
          return next;
        };
        return commit({
          label: 'the new order wasn’t saved',
          apply: () => listPatch(listId, (l) => ({ ...l, items: swap(l.items) })),
          rollback: () => listPatch(listId, (l) => ({ ...l, items: swap(l.items) })),
          retry: () => void a.moveItem(listId, itemId, dir),
        });
      },

      async clearChecked(listId) {
        const list = stateRef.current.lists.find((l) => l.id === listId);
        const removed = list?.items.filter((i) => i.checked) ?? [];
        if (!list || removed.length === 0) return false;
        const original = list.items;
        const ok = await commit({
          label: 'checked items weren’t cleared',
          apply: () => listPatch(listId, (l) => ({ ...l, items: l.items.filter((i) => !i.checked) })),
          rollback: () => listPatch(listId, (l) => ({ ...l, items: original })),
          retry: () => void a.clearChecked(listId),
        });
        if (ok) {
          // Undo: put the cleared items back where they were, keeping anything added since.
          const undo = () =>
            listPatch(listId, (l) => {
              const current = new Map(l.items.map((i) => [i.id, i]));
              const merged = original.map((o) => current.get(o.id) ?? { ...o, sync: undefined });
              const extras = l.items.filter((i) => !original.some((o) => o.id === i.id));
              return { ...l, items: [...merged, ...extras] };
            });
          toast(`Cleared ${removed.length} checked item${removed.length === 1 ? '' : 's'}.`, {
            action: {
              label: 'Undo',
              onClick: () =>
                void commit({
                  label: 'the cleared items weren’t restored',
                  apply: undo,
                  rollback: () => listPatch(listId, (l) => ({ ...l, items: l.items.filter((i) => !removed.some((r) => r.id === i.id)) })),
                  retry: () => undefined,
                }),
            },
          });
        }
        return ok;
      },

      async newList(title, description) {
        const list: SharedList = { id: newId('list'), title: title.trim(), description: description.trim(), items: [], updatedBy: meRef.current, updatedAt: nowIso() };
        const ok = await commit({
          label: `the list “${list.title}” wasn’t created`,
          apply: () => setState((s) => ({ ...s, lists: [...s.lists, list] })),
          rollback: () => setState((s) => ({ ...s, lists: s.lists.filter((l) => l.id !== list.id) })),
          retry: () => void a.newList(title, description),
        });
        return ok ? list.id : null;
      },

      async addTask(t) {
        const id = newId('t');
        const task: Task = {
          id, seriesId: id, planId: t.planId, title: t.title.trim(), assignee: t.assignee, due: t.due, status: 'open', notes: t.notes.trim(),
          recurrence: t.recurrence, updatedBy: meRef.current,
        };
        return commit({
          label: `the task “${task.title}” wasn’t added`,
          apply: () => setState((s) => ({ ...s, tasks: [...s.tasks, task] })),
          rollback: () => setState((s) => ({ ...s, tasks: s.tasks.filter((x) => x.id !== id) })),
          retry: () => void a.addTask(t),
        });
      },

      async completeTask(taskId) {
        const before = stateRef.current.tasks;
        const result = completeTaskPure(before, taskId, todayIn(), meRef.current, () => newId('t'));
        if (!result.changed) return false;
        const title = before.find((t) => t.id === taskId)?.title ?? 'Task';
        const ok = await commit({
          label: `“${title}” wasn’t marked done`,
          apply: () => setState((s) => ({ ...s, tasks: completeTaskPure(s.tasks, taskId, todayIn(), meRef.current, () => result.created?.id ?? newId('t')).tasks })),
          rollback: () => setState((s) => ({ ...s, tasks: before })),
          retry: () => void a.completeTask(taskId),
        });
        if (ok) {
          const next = result.created?.due ? ` Next one: ${displayDate(result.created.due, todayIn())}.` : '';
          toast(`Done: “${title}”.${next}`, { action: { label: 'Undo', onClick: () => void a.reopenTask(taskId) } });
        }
        return ok;
      },

      async reopenTask(taskId) {
        const before = stateRef.current.tasks;
        const title = before.find((t) => t.id === taskId)?.title ?? 'Task';
        return commit({
          label: `“${title}” wasn’t reopened`,
          apply: () => setState((s) => ({ ...s, tasks: reopenTaskPure(s.tasks, taskId, meRef.current) })),
          rollback: () => setState((s) => ({ ...s, tasks: before })),
          retry: () => void a.reopenTask(taskId),
        });
      },

      async addPlan(p) {
        const plan: Plan = { id: newId('plan'), title: p.title.trim(), description: p.description.trim(), target: p.target, template: p.template, status: 'active', updatedBy: meRef.current, updatedAt: nowIso() };
        const ok = await commit({
          label: `the plan “${plan.title}” wasn’t created`,
          apply: () => setState((s) => ({ ...s, plans: [...s.plans, plan] })),
          rollback: () => setState((s) => ({ ...s, plans: s.plans.filter((x) => x.id !== plan.id) })),
          retry: () => void a.addPlan(p),
        });
        return ok ? plan.id : null;
      },

      async saveContact(id, c) {
        const before = stateRef.current.contacts;
        const existing = id ? before.find((x) => x.id === id) : undefined;
        const contact: Contact = { ...c, id: existing?.id ?? newId('contact'), aliases: existing?.aliases ?? [], updatedBy: meRef.current, updatedAt: nowIso() };
        const ok = await commit({
          label: `the contact “${contact.name}” wasn’t saved`,
          apply: () => setState((s) => ({ ...s, contacts: existing ? s.contacts.map((x) => (x.id === contact.id ? contact : x)) : [...s.contacts, contact] })),
          rollback: () => setState((s) => ({ ...s, contacts: before })),
          retry: () => void a.saveContact(id, c),
        });
        return ok ? contact.id : null;
      },

      async saveHomeRecord(id, v) {
        const before = stateRef.current.home;
        if (!before.some((r) => r.id === id)) return false;
        return commit({
          label: `“${v.title}” wasn’t saved`,
          apply: () => setState((s) => ({ ...s, home: s.home.map((r) => (r.id === id ? { ...r, title: v.title, notes: v.notes, fields: v.fields, updatedBy: meRef.current, updatedAt: nowIso() } : r)) })),
          rollback: () => setState((s) => ({ ...s, home: before })),
          retry: () => void a.saveHomeRecord(id, v),
        });
      },

      async saveLocation(id, owner, v) {
        const before = stateRef.current.locations;
        const existing = id ? before.find((l) => l.id === id) : undefined;
        const loc: WorkLocation = { ...v, id: existing?.id ?? newId('loc'), owner, updatedBy: meRef.current, updatedAt: nowIso() };
        const ok = await commit({
          label: `the work location “${loc.label}” wasn’t saved`,
          apply: () => setState((s) => ({ ...s, locations: existing ? s.locations.map((l) => (l.id === loc.id ? loc : l)) : [...s.locations, loc] })),
          rollback: () => setState((s) => ({ ...s, locations: before })),
          retry: () => void a.saveLocation(id, owner, v),
        });
        return ok ? loc.id : null;
      },

      async addInfo(v) {
        const fields: HomeField[] = v.details.trim() ? [{ label: 'Details', kind: 'text' as FieldKind, value: v.details.trim() }] : [];
        const rec: HomeRecord = { id: newId('home'), template: v.template, title: v.title.trim(), fields, notes: v.notes.trim(), updatedBy: meRef.current, updatedAt: nowIso() };
        const ok = await commit({
          label: `“${rec.title}” wasn’t saved`,
          apply: () => setState((s) => ({ ...s, home: [...s.home, rec] })),
          rollback: () => setState((s) => ({ ...s, home: s.home.filter((r) => r.id !== rec.id) })),
          retry: () => void a.addInfo(v),
        });
        return ok ? rec.id : null;
      },

      togglePin(target) {
        const mine = stateRef.current.pins[meRef.current];
        const has = mine.some((p) => p.kind === target.kind && p.id === target.id);
        if (!has && mine.length >= 6) {
          toast('You can pin up to six shortcuts. Unpin one first.', { tone: 'error' });
          return false;
        }
        setState((s) => ({
          ...s,
          pins: { ...s.pins, [meRef.current]: has ? s.pins[meRef.current].filter((p) => !(p.kind === target.kind && p.id === target.id)) : [...s.pins[meRef.current], target] },
        }));
        toast(has ? 'Unpinned from Home.' : 'Pinned to Home.');
        return true;
      },
    };
    return a;
  }, [commit, itemPatch, listPatch, toast]);

  const value = useMemo<Store>(
    () => ({ state, me, setMe, today, saving: pending > 0, banner, dismissBanner: () => setBanner(null), failNext, setFailNext, actions }),
    [state, me, today, pending, banner, failNext, setFailNext, actions],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
