// Date-only helpers. Due dates and expiry dates are plain "YYYY-MM-DD" strings
// and are never converted through a local-time Date, so they cannot shift a
// day because of UTC offsets or daylight-saving changes.

export type DateStr = string;

export const HOUSEHOLD_TZ = 'America/New_York';

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateStr(v: unknown): v is DateStr {
  if (typeof v !== 'string') return false;
  const m = RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parseDate(v: DateStr): { y: number; m: number; d: number } {
  const m = RE.exec(v);
  if (!m) throw new Error(`Invalid date: ${v}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function formatDate(y: number, m: number, d: number): DateStr {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar-day arithmetic in UTC, so DST can never add or lose a day. */
export function addDays(v: DateStr, n: number): DateStr {
  const { y, m, d } = parseDate(v);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return formatDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function diffDays(a: DateStr, b: DateStr): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86_400_000);
}

/**
 * Add whole months. If the target month is shorter than the anchor day, the
 * month's last day is used (Jan 31 + 1 month = Feb 28/29). Passing the original
 * anchor day keeps the series from drifting (Jan 31 → Feb 28 → Mar 31).
 */
export function addMonthsClamped(v: DateStr, months: number, anchorDay?: number): DateStr {
  const { y, m, d } = parseDate(v);
  const anchor = anchorDay ?? d;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  return formatDate(ny, nm, Math.min(anchor, daysInMonth(ny, nm)));
}

/** Today's calendar date in the household's timezone. */
export function todayIn(tz: string = HOUSEHOLD_TZ, now: Date = new Date()): DateStr {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA yields YYYY-MM-DD
}

export function hourIn(tz: string = HOUSEHOLD_TZ, now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now);
  return Number(h) % 24;
}

/** "Tue, Nov 3" (adds the year when it differs from `today`'s year). */
export function displayDate(v: DateStr, today: DateStr = todayIn()): string {
  const { y, m, d } = parseDate(v);
  const sameYear = y === parseDate(today).y;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export function dueState(due: DateStr | undefined, today: DateStr): DueState {
  if (!due) return 'none';
  const n = diffDays(due, today);
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= 7) return 'soon';
  return 'later';
}

export function relativeLabel(due: DateStr | undefined, today: DateStr): string {
  if (!due) return 'No date';
  const n = diffDays(due, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${-n} days overdue`;
  if (n <= 14) return `In ${n} days`;
  return displayDate(due, today);
}
