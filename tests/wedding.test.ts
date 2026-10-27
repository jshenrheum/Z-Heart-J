import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BudgetItem, Guest, Household } from '../src/data/types.ts';
import { calendarItems } from '../src/lib/calendar.ts';
import { InvalidData, validateData } from '../src/lib/records.ts';
import { budgetTotals, countdown, guestCounts, money, parseMoney, scheduleLines } from '../src/lib/wedding.ts';

const audit = { updatedBy: 'jeffrey' as const, updatedAt: '2026-10-25T12:00:00.000Z', version: 1 };

test('the countdown counts days, and reads naturally at the ends', () => {
  assert.deepEqual(countdown(undefined, '2026-10-25').label, 'Set the date');
  assert.equal(countdown('2027-05-01', '2026-10-25').label, '188 days');
  assert.equal(countdown('2026-10-26', '2026-10-25').label, 'Tomorrow');
  assert.equal(countdown('2026-10-25', '2026-10-25').label, 'Today');
  assert.deepEqual(countdown('2026-10-20', '2026-10-25'), { n: -5, label: '5 days', sub: 'married' });
});

test('money parses what people type and formats cleanly', () => {
  assert.equal(parseMoney('1200'), 1200);
  assert.equal(parseMoney('$1,200.50'), 1200.5);
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('12.345'), undefined);
  assert.equal(parseMoney('abc'), undefined);
  assert.equal(money(1200), '$1,200');
  assert.equal(money(1200.5), '$1,200.50');
});

test('budget totals: planned, paid, remaining and the bar shares', () => {
  const items: BudgetItem[] = [
    { id: 'a', title: 'Venue', category: '', planned: 4000, paid: 1000, notes: '', ...audit },
    { id: 'b', title: 'Flowers', category: '', planned: 800.5, paid: 800.5, notes: '', ...audit },
  ];
  const t = budgetTotals(items, 10000);
  assert.equal(t.planned, 4800.5);
  assert.equal(t.paid, 1800.5);
  assert.equal(t.remaining, 5199.5);
  assert.equal(t.paidShare, 0.18005);
  assert.equal(t.plannedShare, 0.48005);
  const open = budgetTotals(items);
  assert.equal(open.remaining, undefined);
  assert.equal(open.plannedShare, 1);
});

test('guest counts are people, not lines', () => {
  const gs: Guest[] = [
    { id: '1', name: 'A', side: 'both', party: 2, rsvp: 'yes', table: '', meal: '', notes: '', ...audit },
    { id: '2', name: 'B', side: 'zul', party: 1, rsvp: 'pending', table: '', meal: '', notes: '', ...audit },
    { id: '3', name: 'C', side: 'jeffrey', party: 4, rsvp: 'no', table: '', meal: '', notes: '', ...audit },
  ];
  assert.deepEqual(guestCounts(gs), { parties: 3, people: 7, yes: 2, no: 4, pending: 1 });
});

test('the schedule splits a time from each line', () => {
  assert.deepEqual(scheduleLines('4:00 PM Ceremony\n5 pm - Cocktails\nPhotos after\n\n'), [
    { time: '4:00 PM', what: 'Ceremony' },
    { time: '5 pm', what: 'Cocktails' },
    { time: '', what: 'Photos after' },
  ]);
});

test('validation: amounts are kept to cents and bounded; a deposit date only while a deposit is due', () => {
  const b = validateData('budget', { title: 'Cake', category: '', planned: 300.005, paid: 0, notes: '' });
  assert.equal(b.planned, 300.01);
  assert.throws(() => validateData('budget', { title: 'Cake', category: '', planned: -1, paid: 0, notes: '' }), InvalidData);
  assert.throws(() => validateData('budget', { title: 'Cake', category: '', planned: '300', paid: 0, notes: '' }), InvalidData);
  const v = validateData('vendor', { name: 'Florist', category: 'Florist', contact: '', phone: '', email: '', website: '', status: 'booked', deposit: 'paid', depositDue: '2026-12-01', notes: '' });
  assert.equal(v.depositDue, undefined);
  assert.throws(() => validateData('guest', { name: 'A', side: 'both', party: 0, rsvp: 'yes', table: '', meal: '', notes: '' }), InvalidData);
  assert.throws(() => validateData('wedding', { venue: '', address: '', schedule: '', notes: '', date: 'May 1' }), InvalidData);
});

test('the wedding day and deposits due show on the calendar', () => {
  const h: Household = {
    profiles: [], locations: [], credentials: [], home: [], contacts: [], lists: [], plans: [], tasks: [], events: [], guests: [], budget: [], pins: { jeffrey: [], zul: [] },
    wedding: { id: 'wedding', date: '2027-05-01', time: '16:00', venue: 'Placeholder Hall\nSecond line', address: '', schedule: '', notes: '', ...audit },
    vendors: [{ id: 'v1', name: 'Caterer Co', category: 'Caterer', contact: '', phone: '', email: '', website: '', status: 'booked', deposit: 'due', depositDue: '2027-04-20', notes: '', ...audit }],
  };
  const items = calendarItems(h, '2027-04-01', '2027-05-31');
  assert.deepEqual(items.map((i) => [i.source, i.date, i.title, i.sub]), [
    ['deposit', '2027-04-20', 'Deposit due · Caterer Co', 'Wedding vendor'],
    ['wedding', '2027-05-01', 'Wedding day', 'Placeholder Hall'],
  ]);
  assert.equal(items[1]!.startTime, '16:00');
  assert.equal(calendarItems(h, '2027-04-01', '2027-05-31', 'zul').length, 2, 'the day and its deposits are both of yours, so either person’s view has them');
});
