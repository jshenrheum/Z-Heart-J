import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDue, describeRecurrence } from '../src/lib/recurrence.ts';

const monthly = { mode: 'schedule', every: 1, unit: 'month' } as const;

test('schedule: month-end clamps and the series does not drift', () => {
  assert.equal(nextDue('2027-01-31', monthly, '2027-01-31'), '2027-02-28');
  assert.equal(nextDue('2027-02-28', { ...monthly, anchorDay: 31 }, '2027-02-28'), '2027-03-31');
  assert.equal(nextDue('2028-01-31', monthly, '2028-01-31'), '2028-02-29'); // leap year
});

test('schedule: every 3 months is anchored to the due date, not the completion date', () => {
  const r = { mode: 'schedule', every: 3, unit: 'month' } as const;
  assert.equal(nextDue('2026-11-15', r, '2026-11-20'), '2027-02-15');
});

test('schedule: missed occurrences are skipped, not piled up', () => {
  assert.equal(nextDue('2026-01-15', monthly, '2026-04-20'), '2026-05-15');
});

test('after completion: counts from the day it was finished', () => {
  const r = { mode: 'after_completion', every: 3, unit: 'month' } as const;
  assert.equal(nextDue('2026-01-01', r, '2026-11-30'), '2027-02-28');
  assert.equal(nextDue(undefined, { mode: 'after_completion', every: 6, unit: 'month' }, '2026-12-31'), '2027-06-30');
});

test('days, weeks, and years', () => {
  assert.equal(nextDue('2026-03-07', { mode: 'schedule', every: 2, unit: 'day' }, '2026-03-07'), '2026-03-09'); // across DST
  assert.equal(nextDue('2026-10-26', { mode: 'schedule', every: 1, unit: 'week' }, '2026-10-26'), '2026-11-02'); // across DST end
  assert.equal(nextDue('2028-02-29', { mode: 'schedule', every: 1, unit: 'year' }, '2028-02-29'), '2029-02-28');
});

test('invalid intervals are rejected', () => {
  assert.throws(() => nextDue('2026-01-01', { mode: 'schedule', every: 0, unit: 'day' }, '2026-01-01'));
  assert.throws(() => nextDue('2026-01-01', { mode: 'schedule', every: 1.5, unit: 'day' }, '2026-01-01'));
});

test('the two models read differently to a person', () => {
  assert.equal(describeRecurrence({ mode: 'schedule', every: 3, unit: 'month' }), 'Every 3 months on a schedule');
  assert.equal(describeRecurrence({ mode: 'after_completion', every: 3, unit: 'month' }), '3 months after it’s done');
});
