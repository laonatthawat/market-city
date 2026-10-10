/** Weekday calendar (no holidays) between two ISO dates, inclusive. */
export function weekdayCalendar(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d = new Date(startIso + 'T00:00:00Z');
  const end = new Date(endIso + 'T00:00:00Z');
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Index of the first calendar date >= iso (calendar.length if none). */
export function dayOnOrAfter(calendar: readonly string[], iso: string): number {
  let lo = 0;
  let hi = calendar.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (calendar[mid] < iso) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const TRADING_DAYS_PER_YEAR = 252;
