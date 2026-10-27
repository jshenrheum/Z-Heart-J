import {
  MEMBER_IDS, type BudgetItem, type CalendarEvent, type Contact, type Credential, type FieldKind, type Guest, type HomeField, type HomeRecord, type HomeTemplate, type Household,
  type ListItem, type MemberId, type PinTarget, type Plan, type Profile, type SharedList, type Task, type Vendor, type WeddingDetails, type WorkLocation,
} from '../data/types.ts';
import { isDateStr } from './dates.ts';
import { safeUrl } from './summary.ts';

/**
 * The one record format shared by the Worker, the API client and the demo backend.
 *
 * A row holds only ordinary data. Protected values (credential numbers, protected
 * home fields) live encrypted in a separate table on the server; a row only lists
 * which protected slots have a value (`stored`), never the value itself.
 *
 * `validateData` is the server's authority on what may be saved: it builds a new
 * object from an explicit allowlist per kind, so unknown keys are refused and a
 * protected field can never carry a value inside ordinary data.
 */

export type Kind = 'profile' | 'location' | 'credential' | 'home' | 'contact' | 'list' | 'item' | 'plan' | 'task' | 'event' | 'wedding' | 'vendor' | 'guest' | 'budget' | 'pins';
export const KINDS: Kind[] = ['profile', 'location', 'credential', 'home', 'contact', 'list', 'item', 'plan', 'task', 'event', 'wedding', 'vendor', 'guest', 'budget', 'pins'];
/** Kinds a client may create with the generic create call ("wedding" only ever as the one record with id "wedding"). */
export const CREATABLE: Kind[] = ['location', 'credential', 'home', 'contact', 'list', 'item', 'plan', 'task', 'event', 'wedding', 'vendor', 'guest', 'budget'];
/** Kinds that can be moved to the trash. */
export const DELETABLE: Kind[] = ['location', 'credential', 'home', 'contact', 'list', 'item', 'plan', 'task', 'event', 'vendor', 'guest', 'budget'];
/** The one wedding record's id. */
export const WEDDING_ID = 'wedding';

export interface Row {
  id: string;
  kind: Kind;
  /** The list an item belongs to, or the plan a task belongs to. */
  parentId?: string;
  version: number;
  data: Record<string, unknown>;
  createdBy: MemberId;
  createdAt: string;
  updatedBy: MemberId;
  updatedAt: string;
  /** Protected slots that hold an encrypted value (credential: "number"; home: field ids). */
  stored?: string[];
}

/** What every write returns: rows to upsert and ids that left the live set. */
export interface Change {
  rows: Row[];
  removed: string[];
}

export interface Snapshot {
  rev: number;
  me: MemberId;
  rows: Row[];
}

export interface TrashEntry {
  id: string;
  kind: Kind;
  title: string;
  context: string;
  deletedAt: string;
  deletedBy: MemberId;
  /** The calendar day after which it is gone for good. */
  purgeAfter: string;
}

export const TRASH_DAYS = 30;
export const MAX_PINS = 6;
export const CREDENTIAL_SLOT = 'number';
export const PROTECTED_MAX = 200;

// ------------------------------------------------------------------ validation

export class InvalidData extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

type Rule = (v: unknown, field: string) => unknown;

const PHONE_RE = /^[0-9\s().+\-x#,]{3,30}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Control characters other than tab and newline never belong in household text.
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/;
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function text(max: number, opts: { required?: boolean; multiline?: boolean } = {}): Rule {
  return (v, f) => {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') throw new InvalidData(f, 'Must be text');
    const s = v.trim();
    if (opts.required && !s) throw new InvalidData(f, 'Required');
    if (s.length > max) throw new InvalidData(f, `Keep this under ${max} characters`);
    if (CONTROL_RE.test(s) || (!opts.multiline && /[\r\n]/.test(s))) throw new InvalidData(f, 'Contains characters that aren’t allowed');
    return s;
  };
}
const phone: Rule = (v, f) => {
  const s = text(30)(v, f) as string;
  if (s && !PHONE_RE.test(s)) throw new InvalidData(f, 'Use digits and ( ) + - only');
  return s;
};
const email: Rule = (v, f) => {
  const s = text(200)(v, f) as string;
  if (s && !EMAIL_RE.test(s)) throw new InvalidData(f, 'Enter a valid email address');
  return s;
};
const url: Rule = (v, f) => {
  const s = text(500)(v, f) as string;
  if (!s) return '';
  const u = safeUrl(s);
  if (!u) throw new InvalidData(f, 'Enter a web address starting with http:// or https://');
  return u;
};
const date: Rule = (v, f) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (!isDateStr(v)) throw new InvalidData(f, 'Enter a real date');
  return v;
};
const bool: Rule = (v, f) => {
  if (typeof v !== 'boolean') throw new InvalidData(f, 'Must be true or false');
  return v;
};
const oneOf =
  <T extends string>(values: readonly T[]): Rule =>
  (v, f) => {
    if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) throw new InvalidData(f, 'Not one of the allowed choices');
    return v;
  };
const int =
  (min: number, max: number): Rule =>
  (v, f) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new InvalidData(f, `Enter a whole number from ${min} to ${max}`);
    return v;
  };
const finite: Rule = (v, f) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new InvalidData(f, 'Must be a number');
  return v;
};
const id: Rule = (v, f) => {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw new InvalidData(f, 'Not a valid id');
  return v;
};
const requiredDate: Rule = (v, f) => {
  if (!isDateStr(v)) throw new InvalidData(f, v ? 'Enter a real date' : 'Required');
  return v;
};
const time: Rule = (v, f) => {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new InvalidData(f, 'Enter a time like 19:30');
  return v;
};
const optional =
  (rule: Rule): Rule =>
  (v, f) =>
    v === undefined || v === null || v === '' ? undefined : rule(v, f);
const member = oneOf(MEMBER_IDS);

function object(spec: Record<string, Rule>): Rule {
  return (v, f) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new InvalidData(f, 'Must be an object');
    for (const k of Object.keys(v)) if (!(k in spec)) throw new InvalidData(f ? `${f}.${k}` : k, 'Unknown field');
    const out: Record<string, unknown> = {};
    for (const [k, rule] of Object.entries(spec)) {
      const value = rule((v as Record<string, unknown>)[k], f ? `${f}.${k}` : k);
      if (value !== undefined) out[k] = value;
    }
    return out;
  };
}
const array =
  (rule: Rule, max: number): Rule =>
  (v, f) => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new InvalidData(f, 'Must be a list');
    if (v.length > max) throw new InvalidData(f, `At most ${max}`);
    return v.map((x, i) => rule(x, `${f}[${i}]`));
  };

export const FIELD_KINDS: FieldKind[] = ['text', 'phone', 'fax', 'address', 'email', 'url', 'identifier', 'date'];
const HOME_TEMPLATES: HomeTemplate[] = ['address', 'utility', 'internet', 'maintenance', 'vehicle', 'pet', 'emergency', 'other'];

/** An ordinary home-field value, checked by its kind. */
function fieldValue(kind: FieldKind, v: unknown, f: string): string {
  switch (kind) {
    case 'phone':
    case 'fax':
      return phone(v, f) as string;
    case 'email':
      return email(v, f) as string;
    case 'url':
      return url(v, f) as string;
    case 'date': {
      const d = date(v, f);
      return (d as string | undefined) ?? '';
    }
    default:
      return text(300)(v, f) as string;
  }
}

const homeField: Rule = (v, f) => {
  const base = object({ id, label: text(60, { required: true }), kind: oneOf(FIELD_KINDS), value: (x) => x, protected: optional(bool) })(v, f) as Record<string, unknown>;
  const kind = base.kind as FieldKind;
  if (base.protected === true) {
    // A protected field never carries its value in ordinary data.
    if (base.value !== undefined && base.value !== '') throw new InvalidData(`${f}.value`, 'Protected values are saved separately, never with the record');
    return { id: base.id, label: base.label, kind, protected: true };
  }
  const value = fieldValue(kind, base.value, `${f}.value`);
  return { id: base.id, label: base.label, kind, value };
};

const recurrence = object({
  mode: oneOf(['schedule', 'after_completion'] as const),
  every: int(1, 99),
  unit: oneOf(['day', 'week', 'month', 'year'] as const),
  anchorDay: optional(int(1, 31)),
});

/** An amount in dollars: 0 to 10,000,000, kept to cents. */
const money: Rule = (v, f) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10_000_000) throw new InvalidData(f, 'Must be an amount from 0 to 10,000,000');
  return Math.round(v * 100) / 100;
};

const SPECS: Record<Kind, Rule> = {
  profile: object({ displayName: text(80), specialty: text(120), organization: text(120), npi: (v, f) => {
    const s = text(10)(v, f) as string;
    if (s && !/^\d{10}$/.test(s)) throw new InvalidData(f, 'An NPI is 10 digits');
    return s;
  } }),
  location: object({
    owner: member, label: text(80, { required: true }), organization: text(120), address: text(300, { multiline: true }),
    mainPhone: phone, directPhone: phone, fax: phone, schedulingPhone: phone, notes: text(1000, { multiline: true }),
  }),
  credential: object({ owner: member, type: text(80, { required: true }), issuer: text(120), expires: date, renewalUrl: optional(url) }),
  home: (v, f) => {
    const out = object({ template: oneOf(HOME_TEMPLATES), title: text(100, { required: true }), fields: array(homeField, 30), notes: text(1000, { multiline: true }) })(v, f) as { fields: Array<{ id: string }> };
    const ids = new Set<string>();
    for (const fl of out.fields) {
      if (ids.has(fl.id)) throw new InvalidData('fields', 'Two fields share an id');
      ids.add(fl.id);
    }
    return out;
  },
  contact: object({
    name: text(100, { required: true }), role: text(100), category: text(60, { required: true }), phone, fax: phone, email, address: text(200, { multiline: true }),
    website: url, note: text(1000, { multiline: true }), aliases: array(text(40), 20),
  }),
  list: object({ title: text(80, { required: true }), description: text(200) }),
  item: object({ name: text(100, { required: true }), qty: text(40), note: text(2000, { multiline: true }), checked: bool, position: finite }),
  plan: object({
    title: text(100, { required: true }), description: text(1000, { multiline: true }), target: date,
    template: oneOf(['travel', 'wedding', 'home', 'custom'] as const), status: oneOf(['active', 'done'] as const),
  }),
  task: object({
    seriesId: id, planId: optional(id), title: text(120, { required: true }), assignee: oneOf([...MEMBER_IDS, 'both'] as const), due: date,
    status: oneOf(['open', 'done'] as const), completedOn: date, recurrence: optional(recurrence), createdFrom: optional(id), notes: text(1000, { multiline: true }),
  }),
  event: (v, f) => {
    const e = object({
      title: text(120, { required: true }), whose: oneOf([...MEMBER_IDS, 'both'] as const), date: requiredDate, endDate: date,
      startTime: optional(time), endTime: optional(time), location: text(200, { multiline: true }), notes: text(1000, { multiline: true }),
      repeat: optional(object({ every: int(1, 99), unit: oneOf(['day', 'week', 'month', 'year'] as const), until: date })),
      skips: array(requiredDate, 400),
    })(v, f) as { date: string; endDate?: string; startTime?: string; endTime?: string; repeat?: { until?: string }; skips: string[] };
    if (e.endTime && !e.startTime) throw new InvalidData('endTime', 'Add a start time first');
    if (e.startTime && e.endTime && e.endTime <= e.startTime) throw new InvalidData('endTime', 'Ends before it starts');
    if (e.endDate && e.startTime) throw new InvalidData('endDate', 'Only all-day events span several days');
    if (e.endDate && e.endDate < e.date) throw new InvalidData('endDate', 'Ends before it starts');
    if (e.endDate === e.date) delete e.endDate;
    if (e.repeat?.until && e.repeat.until < e.date) throw new InvalidData('repeat.until', 'The repeat ends before the first day');
    e.skips = [...new Set(e.skips)].sort();
    return e;
  },
  wedding: object({
    date, time: optional(time), venue: text(120), address: text(300, { multiline: true }), budget: optional(money),
    schedule: text(2000, { multiline: true }), notes: text(2000, { multiline: true }),
  }),
  vendor: (v, f) => {
    const out = object({
      name: text(100, { required: true }), category: text(60, { required: true }), contact: text(100), phone, email, website: url,
      status: oneOf(['considering', 'booked'] as const), deposit: oneOf(['none', 'due', 'paid'] as const), depositDue: date, notes: text(1000, { multiline: true }),
    })(v, f) as { deposit: string; depositDue?: string };
    if (out.deposit !== 'due') delete out.depositDue;
    return out;
  },
  guest: object({
    name: text(100, { required: true }), side: oneOf([...MEMBER_IDS, 'both'] as const), party: int(1, 20), rsvp: oneOf(['pending', 'yes', 'no'] as const),
    table: text(20), meal: text(60), notes: text(500, { multiline: true }),
  }),
  budget: object({ title: text(100, { required: true }), category: text(60), planned: money, paid: money, notes: text(500, { multiline: true }) }),
  pins: object({
    targets: (v, f) => {
      const list = array(object({ kind: oneOf(['profile', 'record', 'list', 'plan', 'contact'] as const), id }), MAX_PINS)(v, f) as PinTarget[];
      const keys = new Set(list.map((p) => `${p.kind}:${p.id}`));
      if (keys.size !== list.length) throw new InvalidData(f, 'A shortcut is pinned twice');
      return list;
    },
  }),
};

/** Returns a clean copy built from the kind's allowlist, or throws InvalidData. */
export function validateData(kind: Kind, data: unknown): Record<string, unknown> {
  const out = SPECS[kind](data, '') as Record<string, unknown>;
  if (kind === 'task') {
    const t = out as { status: string; completedOn?: string; recurrence?: unknown; planId?: string; due?: string };
    if (t.status === 'done' && !t.completedOn) throw new InvalidData('completedOn', 'A finished task needs its completion day');
    if (t.status === 'open') delete t.completedOn;
    if (t.recurrence && t.planId) throw new InvalidData('recurrence', 'Plan steps don’t repeat');
    if (t.recurrence && (t.recurrence as { mode: string }).mode === 'schedule' && !t.due) throw new InvalidData('due', 'Add a due date to repeat on a schedule');
  }
  return out;
}

/** The parent a row must be attached to (items to lists, tasks to their plan). */
export function parentOf(kind: Kind, data: Record<string, unknown>): string | undefined {
  if (kind === 'task') return (data.planId as string | undefined) ?? undefined;
  return undefined;
}

/** Canonical JSON (sorted keys), so a retried write can be recognised as already applied. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export function newRowId(prefix: string): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** A short, human title for trash and audit views. Ordinary data only. */
export function rowTitle(row: Row): { title: string; context: string } {
  const d = row.data as Record<string, string>;
  switch (row.kind) {
    case 'location': return { title: d.label ?? 'Work location', context: 'Work location' };
    case 'credential': return { title: d.type ?? 'Credential', context: 'Credential' };
    case 'home': return { title: d.title ?? 'Home card', context: 'Home' };
    case 'contact': return { title: d.name ?? 'Contact', context: 'Contact' };
    case 'list': return { title: d.title ?? 'List', context: 'List' };
    case 'item': return { title: d.name ?? 'Item', context: 'List item' };
    case 'plan': return { title: d.title ?? 'Plan', context: 'Plan' };
    case 'task': return { title: d.title ?? 'Task', context: 'Task' };
    case 'event': return { title: d.title ?? 'Event', context: 'Calendar event' };
    case 'wedding': return { title: 'Wedding details', context: 'Wedding' };
    case 'vendor': return { title: d.name ?? 'Vendor', context: 'Wedding vendor' };
    case 'guest': return { title: d.name ?? 'Guest', context: 'Wedding guest' };
    case 'budget': return { title: d.title ?? 'Budget line', context: 'Wedding budget' };
    default: return { title: row.id, context: row.kind };
  }
}

// ------------------------------------------------------------------ rows → app shape

const audit = (r: Row) => ({ updatedBy: r.updatedBy, updatedAt: r.updatedAt, version: r.version });

/**
 * Builds the app's Household from live rows. `saving` marks list items with a
 * change still in flight. Only rows of the known kinds are used.
 */
export function toHousehold(rows: Iterable<Row>, saving: ReadonlySet<string> = new Set()): Household {
  const h: Household = { profiles: [], locations: [], credentials: [], home: [], contacts: [], lists: [], plans: [], tasks: [], events: [], vendors: [], guests: [], budget: [], pins: { jeffrey: [], zul: [] } };
  const items = new Map<string, ListItem[]>();
  // Creation order, so cards keep their places as they're edited.
  const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const r of ordered) {
    const d = r.data as never;
    switch (r.kind) {
      case 'profile':
        if ((MEMBER_IDS as string[]).includes(r.id)) h.profiles.push({ ...(d as Omit<Profile, 'id'>), id: r.id as MemberId, ...audit(r) });
        break;
      case 'location':
        h.locations.push({ ...(d as Omit<WorkLocation, 'id'>), id: r.id, ...audit(r) });
        break;
      case 'credential':
        h.credentials.push({ ...(d as Omit<Credential, 'id' | 'hasValue'>), id: r.id, hasValue: !!r.stored?.includes(CREDENTIAL_SLOT), ...audit(r) });
        break;
      case 'home': {
        const rec = d as Omit<HomeRecord, 'id'>;
        const fields: HomeField[] = (rec.fields ?? []).map((f) => (f.protected ? { ...f, hasValue: !!r.stored?.includes(f.id) } : f));
        h.home.push({ ...rec, fields, id: r.id, ...audit(r) });
        break;
      }
      case 'contact':
        h.contacts.push({ ...(d as Omit<Contact, 'id'>), id: r.id, ...audit(r) });
        break;
      case 'list':
        h.lists.push({ ...(d as Omit<SharedList, 'id' | 'items'>), id: r.id, items: [], ...audit(r) });
        break;
      case 'item': {
        if (!r.parentId) break;
        const item: ListItem = { ...(d as Omit<ListItem, 'id'>), id: r.id, ...audit(r), ...(saving.has(r.id) ? { sync: 'saving' as const } : {}) };
        const arr = items.get(r.parentId) ?? [];
        arr.push(item);
        items.set(r.parentId, arr);
        break;
      }
      case 'plan':
        h.plans.push({ ...(d as Omit<Plan, 'id'>), id: r.id, ...audit(r) });
        break;
      case 'task':
        h.tasks.push({ ...(d as Omit<Task, 'id'>), id: r.id, ...audit(r) });
        break;
      case 'event':
        h.events.push({ ...(d as Omit<CalendarEvent, 'id'>), skips: (d as { skips?: string[] }).skips ?? [], id: r.id, ...audit(r) });
        break;
      case 'wedding':
        if (r.id === WEDDING_ID) h.wedding = { ...(d as Omit<WeddingDetails, 'id'>), id: WEDDING_ID, ...audit(r) };
        break;
      case 'vendor':
        h.vendors.push({ ...(d as Omit<Vendor, 'id'>), id: r.id, ...audit(r) });
        break;
      case 'guest':
        h.guests.push({ ...(d as Omit<Guest, 'id'>), id: r.id, ...audit(r) });
        break;
      case 'budget':
        h.budget.push({ ...(d as Omit<BudgetItem, 'id'>), id: r.id, ...audit(r) });
        break;
      case 'pins': {
        const owner = r.id.replace(/^pins-/, '');
        if ((MEMBER_IDS as string[]).includes(owner)) h.pins[owner as MemberId] = ((d as { targets?: PinTarget[] }).targets ?? []).slice();
        break;
      }
    }
  }
  for (const l of h.lists) l.items = (items.get(l.id) ?? []).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  h.profiles.sort((a, b) => MEMBER_IDS.indexOf(a.id) - MEMBER_IDS.indexOf(b.id));
  return h;
}
