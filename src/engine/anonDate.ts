function monthIndex(iso: string): number {
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
}

/** Months since the run's start month (0 = the start month, negative = before start). */
export function anonMonthOffset(iso: string, windowStartIso: string): number {
  return monthIndex(iso) - monthIndex(windowStartIso);
}

export interface AnonDate {
  year: number; // 1-based, <= 0 means pre-run history
  month: number; // 1..12
  day: number; // day of month
}

export function anonDate(iso: string, windowStartIso: string): AnonDate {
  const off = anonMonthOffset(iso, windowStartIso);
  const year = Math.floor(off / 12) + 1;
  const month = ((off % 12) + 12) % 12 + 1;
  return { year, month, day: Number(iso.slice(8, 10)) };
}

/** "ปีที่ 1 · เดือน 3" or "ก่อนเริ่ม 4 เดือน" */
export function formatAnonMonth(iso: string, windowStartIso: string): string {
  const off = anonMonthOffset(iso, windowStartIso);
  if (off < 0) return `ก่อนเริ่ม ${-off} เดือน`;
  const a = anonDate(iso, windowStartIso);
  return `ปีที่ ${a.year} · เดือน ${a.month}`;
}

export function formatAnonDay(iso: string, windowStartIso: string): string {
  const off = anonMonthOffset(iso, windowStartIso);
  const d = Number(iso.slice(8, 10));
  if (off < 0) return `ก่อนเริ่ม ${-off} เดือน (วันที่ ${d})`;
  const a = anonDate(iso, windowStartIso);
  return `ปีที่ ${a.year} · เดือน ${a.month} · วันที่ ${d}`;
}

/** Short tick label for chart axes. */
export function formatAnonTick(iso: string, windowStartIso: string): string {
  const off = anonMonthOffset(iso, windowStartIso);
  if (off < 0) return `−${-off}ด.`;
  const a = anonDate(iso, windowStartIso);
  return a.month === 1 ? `ปี${a.year}` : `ด.${a.month}`;
}
