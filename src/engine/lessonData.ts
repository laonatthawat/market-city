import type { Annotation, Anchor } from '../data/chartLessons';
import type { ManifestJson, PriceFileJson } from './provider/HistoricalProvider';
import type { PriceBar } from './types';

/** Daily bars of one bundled price file, in baht (same conversion as the game). */
export function barsFromFile(calendar: readonly string[], file: PriceFileJson, fx: number): PriceBar[] {
  return file.c.map((_, i) => ({
    day: file.start + i,
    date: calendar[file.start + i],
    open: file.o[i] * fx,
    high: file.h[i] * fx,
    low: file.l[i] * fx,
    close: file.c[i] * fx,
    volume: file.v[i],
  }));
}

let manifest: Promise<ManifestJson> | null = null;
const files = new Map<string, Promise<PriceBar[]>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** The bundled dataset's manifest (cached). */
export function loadManifest(): Promise<ManifestJson> {
  manifest ??= getJson<ManifestJson>(`${import.meta.env.BASE_URL}data/manifest.json`);
  manifest.catch(() => {
    manifest = null;
  });
  return manifest;
}

/** Full daily history of a ticker from the bundled dataset (cached per ticker). */
export function loadLessonBars(ticker: string): Promise<PriceBar[]> {
  let p = files.get(ticker);
  if (!p) {
    const base = `${import.meta.env.BASE_URL}data`;
    p = Promise.all([loadManifest(), getJson<PriceFileJson>(`${base}/prices/${encodeURIComponent(ticker)}.json`)]).then(([m, f]) => barsFromFile(m.calendar, f, m.fx || 1));
    files.set(ticker, p);
    p.catch(() => files.delete(ticker));
  }
  return p;
}

/** Index of the bar on `date`, or -1. */
export function barIndex(bars: readonly PriceBar[], date: string): number {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date === date) return mid;
    if (bars[mid].date < date) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

const priceAt = (b: PriceBar, at: Anchor['at']) => b[at];

/** A drawn line: points (date, price) to connect. Null when a date is missing from the data. */
export function annotationLine(bars: readonly PriceBar[], a: Annotation): { date: string; value: number }[] | null {
  if (a.kind === 'trend') {
    const i = barIndex(bars, a.a.date);
    const j = barIndex(bars, a.b.date);
    const k = a.until ? barIndex(bars, a.until) : j;
    if (i < 0 || j <= i || k < j) return null;
    const v1 = priceAt(bars[i], a.a.at);
    const v2 = priceAt(bars[j], a.b.at);
    // Straight in bar-index space, which is how the chart lays candles out.
    const at = (n: number) => v1 + ((v2 - v1) * (n - i)) / (j - i);
    return [i, j, k].filter((n, idx, xs) => xs.indexOf(n) === idx).map((n) => ({ date: bars[n].date, value: at(n) }));
  }
  if (a.kind === 'level') {
    const i = barIndex(bars, a.from);
    const j = barIndex(bars, a.to);
    if (i < 0 || j <= i) return null;
    const span = bars.slice(i, j + 1);
    const value = a.at === 'high' ? Math.max(...span.map((b) => b.high)) : Math.min(...span.map((b) => b.low));
    return [
      { date: bars[i].date, value },
      { date: bars[j].date, value },
    ];
  }
  return null;
}
