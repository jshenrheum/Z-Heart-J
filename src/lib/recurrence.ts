import { addDays, addMonthsClamped, diffDays, parseDate, type DateStr } from './dates.ts';

/**
 * Two explicit models (the brief's distinction):
 *  - "schedule":          every 3 months on a schedule — anchored to the due date
 *  - "after_completion":  3 months after it’s done — anchored to the completion day
 */
export type RecurrenceMode = 'schedule' | 'after_completion';
export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export interface Recurrence {
  mode: RecurrenceMode;
  every: number;
  unit: RecurrenceUnit;
  /** Day of month the series started on, so month-end clamping does not drift. */
  anchorDay?: number;
}

function step(from: DateStr, r: Recurrence, anchorDay: number, times: number): DateStr {
  const n = r.every * times;
  switch (r.unit) {
    case 'day':
      return addDays(from, n);
    case 'week':
      return addDays(from, 7 * n);
    case 'month':
      return addMonthsClamped(from, n, anchorDay);
    case 'year':
      return addMonthsClamped(from, 12 * n, anchorDay);
  }
}

/**
 * The due date of the next instance.
 *  - schedule: the first occurrence after `completedOn` on the original cadence
 *    (missed occurrences are skipped rather than piled up).
 *  - after_completion: `completedOn` plus the interval.
 * Months without the anchor day use the month's last day.
 */
export function nextDue(prevDue: DateStr | undefined, r: Recurrence, completedOn: DateStr): DateStr {
  if (!Number.isInteger(r.every) || r.every < 1) throw new Error('Recurrence interval must be a positive whole number');

  if (r.mode === 'after_completion') {
    return step(completedOn, r, parseDate(completedOn).d, 1);
  }

  const base = prevDue ?? completedOn;
  const anchorDay = r.anchorDay ?? parseDate(base).d;
  let k = 1;
  let candidate = step(base, r, anchorDay, k);
  // Skip occurrences that are not after the completion day. Bounded loop.
  while (diffDays(candidate, completedOn) <= 0 && k < 5000) {
    k += 1;
    candidate = step(base, r, anchorDay, k);
  }
  return candidate;
}

export function describeRecurrence(r: Recurrence): string {
  const unit = `${r.unit}${r.every === 1 ? '' : 's'}`;
  const every = r.every === 1 ? `Every ${r.unit}` : `Every ${r.every} ${unit}`;
  return r.mode === 'schedule' ? `${every} on a schedule` : `${r.every === 1 ? '1' : r.every} ${unit} after it’s done`;
}
