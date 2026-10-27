import { HOME_TEMPLATE_LABEL, MEMBERS, MEMBER_IDS, type FieldKind, type Household, type MemberId } from '../data/types.ts';
import { nextOccurrence, timeLabel } from './calendar.ts';
import { displayDate, type DateStr } from './dates.ts';
import { routes } from './routes.ts';

/**
 * Deterministic, local search. Restricted values are excluded *by construction*:
 * the index is built from an explicit list of ordinary fields, credentials only
 * contribute their title/type/issuer, and protected home fields contribute only
 * their label. There is no search history and no network call.
 */

export type DocKind = 'profile' | 'location' | 'field' | 'credential' | 'home' | 'contact' | 'list' | 'item' | 'plan' | 'task' | 'event' | 'vendor' | 'guest' | 'budget';

export interface SearchDoc {
  id: string;
  kind: DocKind;
  title: string;
  /** Whom or what this belongs to: person, location, or parent plan. */
  context: string;
  route: string;
  owner?: MemberId;
  aliases: string[];
  /** Ordinary searchable text (lower-cased at query time). */
  text: string;
  /** Ordinary display value for field results — never a protected value. */
  value?: string;
  fieldKind?: FieldKind;
  /** Shown instead of a value for protected fields. */
  protectedNote?: string;
  pinKey?: string;
  order: number;
}

export interface SearchResult {
  doc: SearchDoc;
  score: number;
}

export interface SearchOutcome {
  results: SearchResult[];
  /** Plain-language reading of the query, e.g. "Zul’s records". */
  scope?: string;
  terms: string[];
}

const PROTECTED_NOTE = 'Protected — not searchable';

export function buildIndex(h: Household, today: DateStr): SearchDoc[] {
  const docs: SearchDoc[] = [];
  let order = 0;
  const add = (d: Omit<SearchDoc, 'order'>) => docs.push({ ...d, order: order++ });

  for (const p of h.profiles) {
    const name = MEMBERS[p.id].name;
    add({
      id: `p-${p.id}`, kind: 'profile', title: `${name} · Work details`, context: 'Professional profile', owner: p.id,
      route: routes.profile(p.id), aliases: ['work details', 'professional', 'profile', 'work'], pinKey: `profile:${p.id}`,
      text: `${p.displayName} ${p.specialty} ${p.organization}`,
    });
    if (p.npi) {
      add({
        id: `p-${p.id}-npi`, kind: 'field', title: 'NPI', context: `${name} · Professional profile`, owner: p.id, route: routes.profile(p.id),
        aliases: ['npi', 'national provider identifier', 'provider id'], text: p.npi, value: p.npi, fieldKind: 'identifier',
      });
    }
  }

  for (const l of h.locations) {
    const name = MEMBERS[l.owner].name;
    const ctx = `${name} · ${l.label}`;
    add({
      id: l.id, kind: 'location', title: l.label, context: `${name} · Work location`, owner: l.owner, route: routes.record(l.id),
      aliases: ['work', 'office', 'clinic', 'location', 'work location'], text: `${l.organization} ${l.address} ${l.notes}`,
    });
    const fields: Array<[string, string, string[], FieldKind]> = [
      ['Address', l.address, ['address', 'office address', 'work address', 'directions', 'map', 'where'], 'address'],
      ['Main phone', l.mainPhone, ['phone', 'work number', 'work phone', 'main phone', 'number', 'call'], 'phone'],
      ['Direct phone', l.directPhone, ['direct', 'direct line', 'phone', 'work number', 'number', 'call'], 'phone'],
      ['Fax', l.fax, ['fax', 'work fax'], 'fax'],
      ['Scheduling phone', l.schedulingPhone, ['scheduling', 'appointments', 'phone', 'work number', 'number', 'call'], 'phone'],
    ];
    for (const [label, value, aliases, kind] of fields) {
      if (!value) continue;
      add({ id: `${l.id}-${label}`, kind: 'field', title: label, context: ctx, owner: l.owner, route: routes.record(l.id), aliases, text: value, value, fieldKind: kind });
    }
  }

  for (const c of h.credentials) {
    // Title, type, and issuer only. There is no number on the client to leak.
    const name = MEMBERS[c.owner].name;
    const aliases = ['credential', 'license', 'licence', 'registration', ...(c.expires ? ['renewal', 'renew', 'expiration', 'expires'] : [])];
    if (/\bdea\b/i.test(c.type)) aliases.push('dea');
    add({
      id: c.id, kind: 'credential', title: c.type, context: `${name} · Credential${c.expires ? ` · expires ${displayDate(c.expires, today)}` : ''}`,
      owner: c.owner, route: routes.record(c.id), aliases, text: `${c.type} ${c.issuer}`, protectedNote: PROTECTED_NOTE,
    });
  }

  for (const r of h.home) {
    const ctx = `Home · ${HOME_TEMPLATE_LABEL[r.template]}`;
    const ordinary = r.fields.filter((f) => !f.protected && f.value);
    add({
      id: r.id, kind: 'home', title: r.title, context: ctx, route: routes.record(r.id),
      aliases: [HOME_TEMPLATE_LABEL[r.template].toLowerCase(), 'home', ...homeAliases(r.template)], pinKey: `record:${r.id}`,
      text: `${r.notes} ${ordinary.map((f) => `${f.label} ${f.value}`).join(' ')}`,
    });
    for (const f of r.fields) {
      if (f.protected) {
        add({ id: `${r.id}-${f.id}`, kind: 'field', title: f.label, context: `${r.title} · Home`, route: routes.record(r.id), aliases: [], text: '', protectedNote: PROTECTED_NOTE, fieldKind: f.kind });
      } else if (f.value) {
        add({ id: `${r.id}-${f.id}`, kind: 'field', title: f.label, context: `${r.title} · Home`, route: routes.record(r.id), aliases: fieldAliases(f.label), text: f.value, value: f.value, fieldKind: f.kind });
      }
    }
  }

  for (const c of h.contacts) {
    add({
      id: c.id, kind: 'contact', title: c.name, context: `${c.category} · Contact`, route: routes.record(c.id),
      aliases: [...c.aliases, c.category.toLowerCase(), c.role.toLowerCase(), 'contact'], pinKey: `contact:${c.id}`,
      text: `${c.role} ${c.note} ${c.email} ${c.address} ${c.phone}`, value: c.phone || undefined, fieldKind: c.phone ? 'phone' : undefined,
    });
    if (c.fax) {
      add({ id: `${c.id}-fax`, kind: 'field', title: `${c.name} fax`, context: `${c.category} · Contact`, route: routes.record(c.id), aliases: ['fax'], text: c.fax, value: c.fax, fieldKind: 'fax' });
    }
  }

  for (const l of h.lists) {
    const open = l.items.filter((i) => !i.checked).length;
    add({
      id: l.id, kind: 'list', title: l.title, context: `List · ${open} to get`, route: routes.list(l.id), pinKey: `list:${l.id}`,
      aliases: ['list', ...(/grocer/i.test(l.title) ? ['groceries', 'grocery', 'shopping'] : [])], text: l.description,
    });
    for (const i of l.items) {
      add({ id: `${l.id}-${i.id}`, kind: 'item', title: i.name, context: `${l.title} list${i.checked ? ' · checked' : ''}`, route: routes.list(l.id), aliases: [], text: `${i.qty} ${i.note}` });
    }
  }

  for (const p of h.plans) {
    add({ id: p.id, kind: 'plan', title: p.title, context: `Plan${p.target ? ` · target ${displayDate(p.target, today)}` : ''}`, route: routes.plan(p.id), pinKey: `plan:${p.id}`, aliases: ['plan', 'project', p.template], text: p.description });
  }
  for (const e of h.events) {
    const when = e.repeat ? nextOccurrence(e, today) : e.date;
    const whose = e.whose === 'both' ? 'Both' : MEMBERS[e.whose].name;
    add({
      id: e.id, kind: 'event', title: e.title, context: `Event · ${whose}${when ? ` · ${displayDate(when, today)}, ${timeLabel(e)}` : ''}`,
      owner: e.whose === 'both' ? undefined : e.whose, route: routes.event(e.id, e.repeat ? when : undefined),
      aliases: ['event', 'calendar', 'appointment'], text: `${e.location} ${e.notes}`,
      value: e.location || undefined, fieldKind: e.location ? 'address' : undefined,
    });
  }
  for (const v of h.vendors) {
    add({
      id: v.id, kind: 'vendor', title: v.name, context: `${v.category} · Wedding vendor · ${v.status === 'booked' ? 'Booked' : 'Considering'}`, route: routes.weddingTab('vendors'),
      aliases: ['vendor', 'wedding', v.category.toLowerCase()], text: `${v.contact} ${v.email} ${v.notes}`, value: v.phone || undefined, fieldKind: v.phone ? 'phone' : undefined,
    });
  }
  for (const g of h.guests) {
    add({ id: g.id, kind: 'guest', title: g.name, context: `Wedding guest · ${g.rsvp === 'yes' ? 'Coming' : g.rsvp === 'no' ? 'Not coming' : 'No answer yet'}${g.table ? ` · Table ${g.table}` : ''}`, route: routes.weddingTab('guests'), aliases: ['guest', 'wedding', 'rsvp'], text: `${g.meal} ${g.notes}` });
  }
  for (const b of h.budget) {
    add({ id: b.id, kind: 'budget', title: b.title, context: `Wedding budget${b.category ? ` · ${b.category}` : ''}`, route: routes.weddingTab('budget'), aliases: ['budget', 'wedding', 'cost'], text: `${b.category} ${b.notes}` });
  }
  for (const t of h.tasks) {
    const plan = h.plans.find((p) => p.id === t.planId);
    add({
      id: t.id, kind: 'task', title: t.title, context: `${plan ? plan.title : 'Household task'}${t.due ? ` · due ${displayDate(t.due, today)}` : ''}${t.status === 'done' ? ' · done' : ''}`,
      route: plan ? routes.plan(plan.id) : routes.plans, aliases: ['task', ...(/renew/i.test(t.title) ? ['renewal'] : [])], text: t.notes,
    });
  }
  return docs;
}

function homeAliases(template: string): string[] {
  switch (template) {
    case 'maintenance': return ['filter', 'appliance', 'maintenance'];
    case 'pet': return ['vet', 'pet'];
    case 'internet': return ['wifi', 'wi-fi', 'router', 'network'];
    case 'utility': return ['utility', 'bill', 'electric', 'water', 'gas'];
    case 'vehicle': return ['car', 'vehicle'];
    default: return [];
  }
}

function fieldAliases(label: string): string[] {
  const l = label.toLowerCase();
  const out: string[] = [];
  if (l.includes('filter')) out.push('filter');
  if (l.includes('vet')) out.push('vet');
  if (l.includes('network')) out.push('wifi', 'wi-fi');
  return out;
}

// ---------------------------------------------------------------- query side

const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'what', 'whats', 'is', 'are', 'find', 'show', 'get', 'please', 'and', 'in']);
const SELF = new Set(['my', 'mine', 'me', 'our']);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9/+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

export function search(index: SearchDoc[], query: string, opts: { me: MemberId; pinned?: Set<string>; limit?: number }): SearchOutcome {
  const tokens = normalize(query).split(' ').filter(Boolean);
  let owner: MemberId | undefined;
  let scope: string | undefined;
  const terms: string[] = [];

  for (const tok of tokens) {
    if (SELF.has(tok)) {
      owner = opts.me;
    } else if ((MEMBER_IDS as string[]).includes(tok)) {
      owner = tok as MemberId;
    } else if (!STOP.has(tok)) {
      terms.push(tok);
    }
  }
  if (owner) scope = owner === opts.me && tokens.some((t) => SELF.has(t)) ? `${MEMBERS[owner].name}’s records (you)` : `${MEMBERS[owner].name}’s records`;

  if (terms.length === 0) {
    if (!owner) return { results: [], terms };
    const own = index.filter((d) => d.owner === owner && (d.kind === 'profile' || d.kind === 'location' || d.kind === 'credential'));
    return { results: own.map((doc) => ({ doc, score: 100 - doc.order * 0.001 })), scope, terms };
  }

  const phrase = terms.join(' ');
  const results: SearchResult[] = [];
  for (const doc of index) {
    if (owner && doc.owner !== owner) continue;
    const title = normalize(doc.title);
    const titleWords = title.split(' ');
    const aliases = doc.aliases.map(normalize);
    const aliasWords = aliases.flatMap((a) => a.split(' '));
    const text = normalize(`${doc.text} ${doc.value ?? ''}`);
    const digits = digitsOf(`${doc.text} ${doc.value ?? ''}`);

    let score = 0;
    let ok = true;
    for (const term of terms) {
      let best = 0;
      if (titleWords.includes(term)) best = Math.max(best, 30);
      else if (titleWords.some((w) => w.startsWith(term))) best = Math.max(best, 22);
      if (aliasWords.includes(term)) best = Math.max(best, 26);
      else if (aliasWords.some((w) => w.startsWith(term))) best = Math.max(best, 18);
      if (best < 14 && title.includes(term)) best = Math.max(best, 14);
      if (best < 10 && aliases.some((a) => a.includes(term))) best = Math.max(best, 10);
      if (best < 6 && text.includes(term)) best = 6;
      if (best < 6 && /^\d{3,}$/.test(term) && digits.includes(term)) best = 6;
      if (best === 0) {
        ok = false;
        break;
      }
      score += best;
    }
    if (!ok) continue;

    if (title === phrase) score += 40;
    else if (aliases.includes(phrase)) score += 30;
    if (doc.pinKey && opts.pinned?.has(doc.pinKey)) score += 3; // modest tie-breaker
    results.push({ doc, score: score - doc.order * 0.001 });
  }

  results.sort((a, b) => b.score - a.score);
  return { results: results.slice(0, opts.limit ?? 25), scope, terms };
}
