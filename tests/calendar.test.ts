import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CalendarEvent, Household } from '../src/data/types.ts';
import { calendarItems, itemsOn, matchesWho, monthGrid, nextOccurrence, occurrences, shiftMonth, timeLabel } from '../src/lib/calendar.ts';
import { InvalidData, validateData } from '../src/lib/records.ts';

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1', title: 'X', whose: 'both', date: '2026-01-31', location: '', notes: '', skips: [], updatedBy: 'jeffrey', updatedAt: '2026-01-01T00:00:00Z', version: 1, ...over,
});
const empty = (): Household => ({ profiles: [], locations: [], credentials: [], home: [], contacts: [], lists: [], plans: [], tasks: [], events: [], moments: [], vendors: [], guests: [], budget: [], pins: { jeffrey: [], zul: [] } });

test('a one-off event appears only on its day', () => {
  assert.deepEqual(occurrences(ev({ date: '2026-11-05' }), '2026-11-01', '2026-11-30'), ['2026-11-05']);
  assert.deepEqual(occurrences(ev({ date: '2026-11-05' }), '2026-11-06', '2026-11-30'), []);
});

test('monthly repeats keep the 31st without drifting (Jan 31 → Feb 28 → Mar 31)', () => {
  const e = ev({ date: '2026-01-31', repeat: { every: 1, unit: 'month' } });
  assert.deepEqual(occurrences(e, '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('a Feb 29 anniversary falls on Feb 28 in other years and comes back in leap years', () => {
  const e = ev({ date: '2028-02-29', repeat: { every: 1, unit: 'year' } });
  assert.deepEqual(occurrences(e, '2029-01-01', '2029-12-31'), ['2029-02-28']);
  assert.deepEqual(occurrences(e, '2032-01-01', '2032-12-31'), ['2032-02-29']);
});

test('weekly repeats jump straight to a far-off window, respect "until" and skipped days', () => {
  const e = ev({ date: '2026-01-05', repeat: { every: 2, unit: 'week', until: '2030-01-01' }, skips: ['2028-03-06'] });
  const march = occurrences(e, '2028-03-01', '2028-03-31');
  assert.ok(!march.includes('2028-03-06'), 'skipped day left out');
  assert.ok(march.every((d) => (Date.parse(d) - Date.parse('2026-01-05')) % (14 * 86_400_000) === 0), JSON.stringify(march));
  assert.deepEqual(occurrences(e, '2030-02-01', '2030-12-31'), [], 'nothing after until');
});

test('a multi-day event shows on each of its days, even when it started before the window', () => {
  const e = ev({ date: '2026-11-27', endDate: '2026-12-02' });
  assert.deepEqual(occurrences(e, '2026-12-01', '2026-12-31'), ['2026-11-27']);
  const h = empty();
  h.events.push(e);
  const items = calendarItems(h, '2026-12-01', '2026-12-31');
  assert.equal(itemsOn(items, '2026-12-02').length, 1);
  assert.equal(itemsOn(items, '2026-12-03').length, 0);
});

test('the agenda gathers events, open dated tasks, plan targets and credential expiries, all-day first', () => {
  const h = empty();
  h.events.push(ev({ id: 'dinner', title: 'Dinner', date: '2026-11-05', startTime: '19:30', whose: 'zul' }));
  h.events.push(ev({ id: 'trip', title: 'Trip', date: '2026-11-05', whose: 'jeffrey' }));
  h.tasks.push({ id: 't', seriesId: 't', title: 'Pay rent', assignee: 'both', due: '2026-11-05', status: 'open', notes: '', updatedBy: 'zul', updatedAt: '', version: 1 });
  h.tasks.push({ id: 'd', seriesId: 'd', title: 'Done thing', assignee: 'both', due: '2026-11-05', status: 'done', completedOn: '2026-11-01', notes: '', updatedBy: 'zul', updatedAt: '', version: 1 });
  h.plans.push({ id: 'p', title: 'Move', description: '', target: '2026-11-07', template: 'home', status: 'active', updatedBy: 'zul', updatedAt: '', version: 1 });
  h.credentials.push({ id: 'c', owner: 'jeffrey', type: 'License', issuer: '', expires: '2026-11-09', hasValue: false, updatedBy: 'jeffrey', updatedAt: '', version: 1 });
  const all = calendarItems(h, '2026-11-01', '2026-11-30');
  assert.deepEqual(all.map((i) => i.title), ['Pay rent', 'Trip', 'Dinner', 'Move', 'License expires']);
  const zuls = calendarItems(h, '2026-11-01', '2026-11-30', 'zul');
  assert.deepEqual(zuls.map((i) => i.title), ['Pay rent', 'Dinner', 'Move'], 'Zul’s: hers and both, not Jeffrey’s');
  assert.equal(matchesWho('both', 'jeffrey'), true);
});

test('times read naturally', () => {
  assert.equal(timeLabel({}), 'All day');
  assert.equal(timeLabel({ startTime: '19:30' }), '7:30 PM');
  assert.equal(timeLabel({ startTime: '14:00', endTime: '16:00' }), '2:00 – 4:00 PM');
  assert.equal(timeLabel({ startTime: '11:30', endTime: '13:00' }), '11:30 AM – 1:00 PM');
  assert.equal(timeLabel({ startTime: '00:15' }), '12:15 AM');
});

test('month grid starts on Sunday and covers six weeks; months shift across years', () => {
  const g = monthGrid('2026-11');
  assert.equal(g.length, 42);
  assert.equal(g[0], '2026-11-01'); // Nov 1 2026 is a Sunday
  assert.equal(monthGrid('2026-10')[0], '2026-09-27');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(nextOccurrence(ev({ date: '2020-03-15', repeat: { every: 1, unit: 'year' } }), '2026-10-26'), '2027-03-15');
});

test('event rules: times in order, multi-day only when all day, repeats end after they start', () => {
  const base = { title: 'Dinner', whose: 'both', date: '2026-11-05', location: '', notes: '', skips: [] };
  const fails = (d: object, field: string) => assert.throws(() => validateData('event', { ...base, ...d }), (e: unknown) => e instanceof InvalidData && e.field === field);
  fails({ startTime: '19:30', endTime: '18:00' }, 'endTime');
  fails({ endTime: '18:00' }, 'endTime');
  fails({ startTime: '7pm' }, 'startTime');
  fails({ startTime: '10:00', endDate: '2026-11-06' }, 'endDate');
  fails({ endDate: '2026-11-01' }, 'endDate');
  fails({ repeat: { every: 1, unit: 'week', until: '2026-10-01' } }, 'repeat.until');
  fails({ date: '' }, 'date');
  fails({ whose: 'someone' }, 'whose');
  const ok = validateData('event', { ...base, startTime: '19:30', endTime: '21:00', skips: ['2026-12-05', '2026-11-12', '2026-12-05'] });
  assert.deepEqual(ok.skips, ['2026-11-12', '2026-12-05'], 'skips de-duplicated and sorted');
  assert.equal(validateData('event', { ...base, endDate: '2026-11-05' }).endDate, undefined, 'a one-day span is just the day');
});
