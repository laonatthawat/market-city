import { changeOver } from './indicators';
import type { MarketDataProvider } from './provider/MarketDataProvider';
import type { Company, Day, FundamentalsSnapshot, MarketEvent, PriceBar, Run } from './types';

/** Per-day derived values the city and lists need for one company. */
export interface CompanySnapshot {
  id: string;
  price: number;
  prevClose: number;
  change1d: number;
  momentum20: number; // 20-day change
  marketCap: number;
  revenue: number;
  pe: number | null;
  debtToEquity: number;
  epsFalling: boolean;
  high52: boolean;
  low52: boolean;
}

/**
 * Time-gated, run-scoped window onto a provider. Everything the game shows goes through here,
 * and no method ever returns data after `currentDay`.
 */
export class MarketView {
  private day: Day;
  private snapCache = new Map<string, CompanySnapshot>();
  private snapDay = -1;
  private indexCache: Float64Array | null = null;
  readonly companies: Company[];

  constructor(
    private readonly provider: MarketDataProvider,
    readonly run: Run,
  ) {
    this.day = run.windowStart;
    this.companies = run.companyIds.map((id) => provider.getCompany(id)!).filter(Boolean);
  }

  get currentDay(): Day {
    return this.day;
  }

  setDay(day: Day): void {
    this.day = Math.max(this.run.historyStart, Math.min(day, this.run.windowEnd));
  }

  private clamp(day: Day | undefined): Day {
    return day === undefined ? this.day : Math.min(day, this.day);
  }

  dateOf(day: Day): string {
    return this.provider.getCalendar()[this.clamp(day)];
  }

  get calendar(): readonly string[] {
    return this.provider.getCalendar();
  }

  get windowStartDate(): string {
    return this.provider.getCalendar()[this.run.windowStart];
  }

  get windowEndDate(): string {
    return this.provider.getCalendar()[this.run.windowEnd];
  }

  company(id: string): Company | undefined {
    return this.provider.getCompany(id);
  }

  bar(id: string, day?: Day): PriceBar | null {
    return this.provider.getPrice(id, this.clamp(day));
  }

  /** Latest available close on or before `day`. */
  close(id: string, day?: Day): number | null {
    const d = this.clamp(day);
    for (let k = d; k >= Math.max(0, d - 10); k--) {
      const b = this.provider.getPrice(id, k);
      if (b) return b.close;
    }
    return null;
  }

  history(id: string, from: Day = this.run.historyStart): PriceBar[] {
    return this.provider.getPriceRange(id, from, this.day);
  }

  /**
   * Up to `count` closes just before the visible history (never past the company's first listed day),
   * used only to warm up long moving averages so they span the whole chart. All are before the window.
   */
  warmupCloses(id: string, count: number): number[] {
    const first = this.provider.getCompany(id)?.firstDay ?? this.run.historyStart;
    const from = Math.max(0, first, this.run.historyStart - count);
    if (from >= this.run.historyStart) return [];
    return Array.from(this.provider.getCloses(id, from, this.run.historyStart - 1));
  }

  /** Closing prices from `from` up to the current day (zero-copy where possible). */
  closes(id: string, from: Day): ArrayLike<number> {
    return this.provider.getCloses(id, from, this.day);
  }

  /**
   * The city index is an equal-weight index of this run's own companies (rebalanced daily),
   * not the broad market. The benchmark is then "buy every company in town evenly and hold",
   * so a run dealt a weak set of companies is just as winnable as a strong one.
   */
  private cityIndex(): Float64Array {
    if (this.indexCache) return this.indexCache;
    const { historyStart: start, windowEnd: end } = this.run;
    const out = new Float64Array(end - start + 1);
    const prev = new Map<string, number>();
    let level = 1000;
    for (let d = start; d <= end; d++) {
      let sum = 0;
      let n = 0;
      for (const c of this.companies) {
        const p = this.provider.getPrice(c.id, d)?.close;
        if (p == null || !(p > 0)) continue;
        const q = prev.get(c.id);
        if (q != null) {
          sum += p / q - 1;
          n++;
        }
        prev.set(c.id, p);
      }
      if (n > 0) level *= 1 + sum / n;
      out[d - start] = level;
    }
    this.indexCache = out;
    return out;
  }

  private indexBarAt(d: Day): PriceBar | null {
    if (d < this.run.historyStart || d > this.run.windowEnd) return null;
    const close = this.cityIndex()[d - this.run.historyStart];
    return { day: d, date: this.provider.getCalendar()[d], open: close, high: close, low: close, close, volume: 0 };
  }

  indexCloses(from: Day): ArrayLike<number> {
    const start = this.run.historyStart;
    const lo = Math.max(from, start) - start;
    const hi = this.day - start;
    return hi < lo ? [] : this.cityIndex().subarray(lo, hi + 1);
  }

  indexBar(day?: Day): PriceBar | null {
    return this.indexBarAt(this.clamp(day));
  }

  indexHistory(from: Day = this.run.historyStart): PriceBar[] {
    const out: PriceBar[] = [];
    for (let d = Math.max(from, this.run.historyStart); d <= this.day; d++) out.push(this.indexBarAt(d)!);
    return out;
  }

  fundamentals(id: string, day?: Day): FundamentalsSnapshot | null {
    return this.provider.getFundamentals(id, this.clamp(day));
  }

  /** Events for run companies (plus market-wide shocks) from `from` up to the current day. */
  events(from: Day, to: Day = this.day): MarketEvent[] {
    const ids = new Set(this.run.companyIds);
    const out: MarketEvent[] = [];
    for (let d = Math.max(from, 0); d <= Math.min(to, this.day); d++) {
      for (const e of this.provider.getEvents(d)) if (!e.companyId || ids.has(e.companyId)) out.push(e);
    }
    return out;
  }

  snapshot(id: string): CompanySnapshot | null {
    if (this.snapDay !== this.day) {
      this.snapCache.clear();
      this.snapDay = this.day;
    }
    const cached = this.snapCache.get(id);
    if (cached) return cached;
    const closes = this.provider.getCloses(id, this.day - 252, this.day);
    const f = this.fundamentals(id);
    if (closes.length === 0 || !f) return null;
    const price = closes[closes.length - 1];
    const prevClose = closes.length > 1 ? closes[closes.length - 2] : price;
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = 0; i < closes.length - 1; i++) {
      if (closes[i] > hi) hi = closes[i];
      if (closes[i] < lo) lo = closes[i];
    }
    const trend = f.epsTrend;
    const snap: CompanySnapshot = {
      id,
      price,
      prevClose,
      change1d: prevClose > 0 ? price / prevClose - 1 : 0,
      momentum20: changeOver(closes, 20) ?? 0,
      marketCap: f.marketCap,
      revenue: f.revenue,
      pe: f.pe,
      debtToEquity: f.debtToEquity,
      epsFalling: trend.length >= 2 && trend[trend.length - 1].eps < trend[trend.length - 2].eps * 0.9,
      high52: closes.length > 120 && price > hi,
      low52: closes.length > 120 && price < lo,
    };
    this.snapCache.set(id, snap);
    return snap;
  }
}
