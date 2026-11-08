import type { RecurrenceType } from '../types/meeting';

/**
 * Dates for a repeating meeting, worked out as plain calendar dates.
 *
 * Everything runs in UTC on purpose: building local-midnight dates and then
 * calling toISOString() moves them back a day anywhere east of UTC (in
 * Australia every "2nd Thursday" came out as a Wednesday), and adding days
 * across a daylight-saving change could do the same.
 *
 * @param startDate the first meeting (YYYY-MM-DD); it is not included in the result
 * @param endDate   the last date a repeat may fall on (YYYY-MM-DD), inclusive
 * @param nthWeek   for monthly_nth: 1–4, or 5 for "last"
 * @param nthDay    for monthly_nth: 0 = Sunday … 6 = Saturday
 */
export function generateRecurringDates(
  startDate: string,
  recurrenceType: RecurrenceType,
  endDate: string,
  nthWeek?: number | null,
  nthDay?: number | null,
  limit = 520,
): string[] {
  const start = parseYMD(startDate);
  const end = parseYMD(endDate);
  if (!start || !end || end <= start || recurrenceType === 'none') return [];

  const dates: string[] = [];

  if (recurrenceType === 'monthly_nth') {
    if (nthWeek == null || nthDay == null) return [];
    let year = start.getUTCFullYear();
    let month = start.getUTCMonth() + 1;
    for (let i = 0; i < 120 && dates.length < limit; i++) {
      if (month > 11) { month = 0; year++; }
      const date = nthWeekdayOfMonth(year, month, nthDay, nthWeek);
      if (date && date > end) break;
      if (date && date > start) dates.push(toYMD(date));
      month++;
    }
    return dates;
  }

  const day = start.getUTCDate();
  const monthsStep = recurrenceType === 'monthly' ? 1 : recurrenceType === 'quarterly' ? 3 : recurrenceType === 'yearly' ? 12 : 0;
  const daysStep = recurrenceType === 'weekly' ? 7 : recurrenceType === 'fortnightly' ? 14 : 0;
  if (!monthsStep && !daysStep) return [];

  for (let k = 1; dates.length < limit; k++) {
    let next: Date;
    if (daysStep) {
      next = new Date(start.getTime() + k * daysStep * 86400000);
    } else {
      // Counted from the first meeting, so the 31st stays the 31st (or the month's last day)
      const total = start.getUTCMonth() + k * monthsStep;
      const y = start.getUTCFullYear() + Math.floor(total / 12);
      const m = total % 12;
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      next = new Date(Date.UTC(y, m, Math.min(day, lastDay)));
    }
    if (next > end) break;
    dates.push(toYMD(next));
  }
  return dates;
}

/** The nth (1–4, 5 = last) given weekday of a month, as a UTC date, or null if there isn't one */
export function nthWeekdayOfMonth(year: number, month: number, dayOfWeek: number, nth: number): Date | null {
  if (nth === 5) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    const diff = (last.getUTCDay() - dayOfWeek + 7) % 7;
    return new Date(Date.UTC(year, month, last.getUTCDate() - diff));
  }
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const day = 1 + ((dayOfWeek - firstDow + 7) % 7) + (nth - 1) * 7;
  const result = new Date(Date.UTC(year, month, day));
  return result.getUTCMonth() === month ? result : null;
}

function parseYMD(s: string | undefined | null): Date | null {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}
