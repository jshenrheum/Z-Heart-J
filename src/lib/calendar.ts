import type { Assignee, CalendarEvent, Household, MemberId } from '../data/types.ts';
import { addDays, addMonthsClamped, diffDays, parseDate, type DateStr } from './dates.ts';
import { routes } from './routes.ts';

/**
 * The shared calendar: events, plus everything else in the household that has a
 * date (open tasks' due dates, plans' target dates, credentials' expiry dates), so
 * nothing is entered twice. Pure functions over the household; no network.
 */

export type CalSource = 'event' | 'task' | 'plan' | 'credential';

export interface CalItem {
  /** Unique per occurrence. */
  key: string;
  source: CalSource;
  id: string;
  title: string;
  whose: Assignee;
  /** The day this occurrence starts. */
  date: DateStr;
  /** Last day, for all-day events spanning several days. */
  endDate?: DateStr;
  startTime?: string;
  endTime?: string;
  /** Short context line: a place, a plan, "Expires". */
  sub?: string;
  route: string;
  repeating?: boolean;
}

export type WhoFilter = 'all' | MemberId;

/** Everyone, or one person's: their own plus what's for both. */
export const matchesWho = (whose: Assignee, who: WhoFilter) => who === 'all' || whose === who || whose === 'both';

const MAX_STEPS = 2000;

function nth(ev: CalendarEvent, k: number): DateStr {
  const r = ev.repeat!;
  const n = r.every * k;
  switch (r.unit) {
    case 'day':
      return addDays(ev.date, n);
    case 'week':
      return addDays(ev.date, 7 * n);
    case 'month':
      return addMonthsClamped(ev.date, n, parseDate(ev.date).d);
    case 'year':
      return addMonthsClamped(ev.date, 12 * n, parseDate(ev.date).d);
  }
}

/**
 * Start days of an event's occurrences that touch [from, to] (inclusive). Repeats
 * keep the original day of the month (Jan 31 → Feb 28 → Mar 31), Feb 29 falls on
 * Feb 28 in other years, and skipped days are left out.
 */
export function occurrences(ev: CalendarEvent, from: DateStr, to: DateStr): DateStr[] {
  const span = ev.endDate ? Math.max(0, diffDays(ev.endDate, ev.date)) : 0;
  const touches = (d: DateStr) => diffDays(d, to) <= 0 && diffDays(addDays(d, span), from) >= 0;
  if (!ev.repeat) return touches(ev.date) ? [ev.date] : [];

  const skips = new Set(ev.skips);
  const until = ev.repeat.until;
  // Jump close to `from` instead of walking from the first occurrence.
  let k = 0;
  const behind = diffDays(from, ev.date) - span;
  if (behind > 0) {
    const unitDays = ev.repeat.unit === 'day' ? 1 : ev.repeat.unit === 'week' ? 7 : ev.repeat.unit === 'month' ? 31 : 366;
    k = Math.max(0, Math.floor(behind / (unitDays * ev.repeat.every)) - 1);
  }
  const out: DateStr[] = [];
  for (let steps = 0; steps < MAX_STEPS; steps++, k++) {
    const d = nth(ev, k);
    if (diffDays(d, to) > 0 || (until && diffDays(d, until) > 0)) break;
    if (touches(d) && !skips.has(d)) out.push(d);
  }
  return out;
}

/** The next occurrence on or after `day`, if any (for "next one" lines). */
export function nextOccurrence(ev: CalendarEvent, day: DateStr): DateStr | undefined {
  return occurrences(ev, day, addDays(day, 3 * 366))[0];
}

const timeKey = (i: CalItem) => (i.startTime ? `1${i.startTime}` : '0'); // all-day first, then by time

/** Everything dated in [from, to], in order. Open tasks only; overdue tasks are not included here. */
export function calendarItems(h: Household, from: DateStr, to: DateStr, who: WhoFilter = 'all'): CalItem[] {
  const items: CalItem[] = [];
  for (const ev of h.events) {
    if (!matchesWho(ev.whose, who)) continue;
    for (const d of occurrences(ev, from, to)) {
      items.push({
        key: `event:${ev.id}:${d}`, source: 'event', id: ev.id, title: ev.title, whose: ev.whose, date: d,
        endDate: ev.endDate ? addDays(d, diffDays(ev.endDate, ev.date)) : undefined, startTime: ev.startTime, endTime: ev.endTime,
        sub: ev.location.split('\n')[0] || undefined, route: routes.event(ev.id, ev.repeat ? d : undefined), repeating: !!ev.repeat,
      });
    }
  }
  const inRange = (d?: DateStr) => !!d && diffDays(d, from) >= 0 && diffDays(d, to) <= 0;
  for (const t of h.tasks) {
    if (t.status !== 'open' || !inRange(t.due) || !matchesWho(t.assignee, who)) continue;
    const plan = t.planId ? h.plans.find((p) => p.id === t.planId) : undefined;
    items.push({ key: `task:${t.id}`, source: 'task', id: t.id, title: t.title, whose: t.assignee, date: t.due!, sub: plan ? `Task · ${plan.title}` : 'Task', route: plan ? routes.plan(plan.id) : routes.plans });
  }
  for (const p of h.plans) {
    if (p.status !== 'active' || !inRange(p.target) || !matchesWho('both', who)) continue;
    items.push({ key: `plan:${p.id}`, source: 'plan', id: p.id, title: p.title, whose: 'both', date: p.target!, sub: 'Plan target date', route: routes.plan(p.id) });
  }
  for (const c of h.credentials) {
    if (!inRange(c.expires) || !matchesWho(c.owner, who)) continue;
    items.push({ key: `cred:${c.id}`, source: 'credential', id: c.id, title: `${c.type} expires`, whose: c.owner, date: c.expires!, sub: 'Credential', route: routes.record(c.id) });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || timeKey(a).localeCompare(timeKey(b)) || a.title.localeCompare(b.title));
}

/** Items that fall on `day` (multi-day events included on each of their days). */
export function itemsOn(items: CalItem[], day: DateStr): CalItem[] {
  return items.filter((i) => i.date === day || (i.endDate && diffDays(day, i.date) >= 0 && diffDays(day, i.endDate) <= 0));
}

/** "7:30 PM" from "19:30". */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number) as [number, number];
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "All day", "7:30 PM", "2:00 – 4:00 PM". */
export function timeLabel(i: { startTime?: string; endTime?: string }): string {
  if (!i.startTime) return 'All day';
  if (!i.endTime) return formatTime(i.startTime);
  const a = formatTime(i.startTime);
  const b = formatTime(i.endTime);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

export function repeatLabel(ev: Pick<CalendarEvent, 'repeat'>): string | undefined {
  const r = ev.repeat;
  if (!r) return undefined;
  const unit = r.every === 1 ? r.unit : `${r.every} ${r.unit}s`;
  return `Every ${unit}`;
}

/** The 6×7 grid of days for a month view, weeks starting on Sunday. */
export function monthGrid(month: string): DateStr[] {
  const first = `${month}-01`;
  const { y, m } = parseDate(first);
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const start = addDays(first, -dow);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const monthOf = (d: DateStr) => d.slice(0, 7);
export function shiftMonth(month: string, n: number): string {
  return addMonthsClamped(`${month}-01`, n, 1).slice(0, 7);
}
export function monthTitle(month: string): string {
  const { y, m } = parseDate(`${month}-01`);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
}
