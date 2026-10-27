import type { BudgetItem, Guest, Household, Vendor } from '../data/types.ts';
import { diffDays, type DateStr } from './dates.ts';

/** Pure helpers for the Wedding tab: the countdown, the budget sums, the guest counts. */

export function countdown(date: DateStr | undefined, today: DateStr): { n?: number; label: string; sub: string } {
  if (!date) return { label: 'Set the date', sub: 'The countdown starts once the day is set.' };
  const n = diffDays(date, today);
  if (n === 0) return { n, label: 'Today', sub: 'It’s the day.' };
  if (n === 1) return { n, label: 'Tomorrow', sub: 'One more sleep.' };
  if (n > 1) return { n, label: `${n} days`, sub: 'to go' };
  return { n, label: `${-n} day${n === -1 ? '' : 's'}`, sub: 'married' };
}

const whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number) => (Number.isInteger(n) ? whole.format(n) : cents.format(n));

/** "1200", "$1,200.50" → a number; blank → 0; anything else → undefined. */
export function parseMoney(raw: string): number | undefined {
  const s = raw.replace(/[$,\s]/g, '');
  if (s === '') return 0;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) return undefined;
  return Number(s);
}

export function budgetTotals(items: BudgetItem[], overall?: number) {
  const planned = Math.round(items.reduce((s, i) => s + i.planned, 0) * 100) / 100;
  const paid = Math.round(items.reduce((s, i) => s + i.paid, 0) * 100) / 100;
  const cap = overall ?? planned;
  return { planned, paid, overall, remaining: overall === undefined ? undefined : Math.round((overall - planned) * 100) / 100, paidShare: cap > 0 ? Math.min(1, paid / cap) : 0, plannedShare: cap > 0 ? Math.min(1, planned / cap) : 0 };
}

export function guestCounts(guests: Guest[]) {
  const by = (r: Guest['rsvp']) => guests.filter((g) => g.rsvp === r);
  const people = (gs: Guest[]) => gs.reduce((s, g) => s + g.party, 0);
  return { parties: guests.length, people: people(guests), yes: people(by('yes')), no: people(by('no')), pending: people(by('pending')) };
}

export function vendorCounts(vendors: Vendor[]) {
  return { booked: vendors.filter((v) => v.status === 'booked').length, depositsDue: vendors.filter((v) => v.deposit === 'due').length, total: vendors.length };
}

export const byName = <T extends { name: string }>(xs: T[]) => [...xs].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

/** The schedule as [time, what] lines; a line without a time keeps its whole text as "what". */
export function scheduleLines(schedule: string): Array<{ time: string; what: string }> {
  return schedule
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)\s*[-–—:]?\s+(.+)$/i.exec(l);
      return m ? { time: m[1]!.trim(), what: m[2]!.trim() } : { time: '', what: l };
    });
}

/** The wedding checklist is the active plan of the wedding template (the first one, if several). */
export function weddingPlan(h: Household) {
  return h.plans.find((p) => p.template === 'wedding' && p.status === 'active') ?? h.plans.find((p) => p.template === 'wedding');
}

export const VENDOR_CATEGORIES = ['Venue', 'Photographer', 'Videographer', 'Caterer', 'Cake', 'Florist', 'Music', 'Officiant', 'Attire', 'Hair & makeup', 'Rentals', 'Stationery', 'Transport', 'Planner', 'Other'];
export const BUDGET_CATEGORIES = ['Venue', 'Food & drink', 'Photo & video', 'Attire', 'Flowers & decor', 'Music', 'Stationery', 'Rings', 'Honeymoon', 'Other'];
