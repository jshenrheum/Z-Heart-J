import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonthsClamped, diffDays, displayDate, isDateStr, todayIn, relativeLabel, dueState } from '../src/lib/dates.ts';

test('calendar-day math never shifts across US daylight-saving changes', () => {
  assert.equal(addDays('2026-03-07', 1), '2026-03-08'); // spring forward
  assert.equal(addDays('2026-03-07', 2), '2026-03-09');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01'); // fall back
  assert.equal(addDays('2026-10-31', 2), '2026-11-02');
  assert.equal(diffDays('2026-11-02', '2026-10-31'), 2);
  assert.equal(diffDays('2026-03-09', '2026-03-07'), 2);
});

test('household "today" follows New York time, not UTC', () => {
  // 05:00Z on Nov 2 is midnight in New York (EST); one second earlier is still Nov 1.
  assert.equal(todayIn('America/New_York', new Date('2026-11-02T04:59:59Z')), '2026-11-01');
  assert.equal(todayIn('America/New_York', new Date('2026-11-02T05:00:00Z')), '2026-11-02');
  // 23:24 EDT on Oct 25 is already Oct 26 in UTC — the household date is still the 25th.
  assert.equal(todayIn('America/New_York', new Date('2026-10-26T03:24:00Z')), '2026-10-25');
});

test('date validation rejects impossible dates', () => {
  assert.equal(isDateStr('2026-02-29'), false);
  assert.equal(isDateStr('2028-02-29'), true);
  assert.equal(isDateStr('2026-13-01'), false);
  assert.equal(isDateStr('26-01-01'), false);
  assert.equal(isDateStr(undefined), false);
});

test('month arithmetic clamps to the last day and honours the anchor day', () => {
  assert.equal(addMonthsClamped('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonthsClamped('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonthsClamped('2027-02-28', 1, 31), '2027-03-31');
  assert.equal(addMonthsClamped('2026-11-30', 3), '2027-02-28');
  assert.equal(addMonthsClamped('2026-12-15', 1), '2027-01-15'); // year rollover
  assert.equal(addMonthsClamped('2026-01-15', -2), '2025-11-15'); // negative
});

test('display strings do not shift the day', () => {
  assert.equal(displayDate('2026-11-01', '2026-10-25'), 'Sun, Nov 1');
  assert.equal(displayDate('2027-01-01', '2026-10-25'), 'Fri, Jan 1, 2027');
});

test('relative labels and states', () => {
  assert.equal(relativeLabel(undefined, '2026-10-25'), 'No date');
  assert.equal(relativeLabel('2026-10-25', '2026-10-25'), 'Today');
  assert.equal(relativeLabel('2026-10-22', '2026-10-25'), '3 days overdue');
  assert.equal(dueState(undefined, '2026-10-25'), 'none'); // undated is never "late"
  assert.equal(dueState('2026-10-24', '2026-10-25'), 'overdue');
});
