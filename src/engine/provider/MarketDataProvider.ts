import type {
  Company,
  DatasetInfo,
  Day,
  FundamentalsSnapshot,
  MarketEvent,
  PriceBar,
} from '../types';
import { fundamentalsAt } from './fundamentals';

/**
 * The single interface through which all market data flows.
 * Game and scene code must never know which implementation is in use.
 */
export interface MarketDataProvider {
  init(): Promise<void>;
  getInfo(): DatasetInfo;
  getCalendar(): readonly string[];
  getCompanies(): readonly Company[];
  getCompany(id: string): Company | undefined;
  /** Make sure price series for these companies (and the index) are in memory. */
  ensureLoaded(companyIds: readonly string[]): Promise<void>;
  getPrice(companyId: string, day: Day): PriceBar | null;
  /** Inclusive range, clipped to available data. */
  getPriceRange(companyId: string, from: Day, to: Day): PriceBar[];
  /** Closing prices only (no per-bar objects) — for hot paths. Inclusive, clipped to available data. */
  getCloses(companyId: string, from: Day, to: Day): ArrayLike<number>;
  getIndexCloses(from: Day, to: Day): ArrayLike<number>;
  getIndexPrice(day: Day): PriceBar | null;
  getIndexRange(from: Day, to: Day): PriceBar[];
  getFundamentals(companyId: string, day: Day): FundamentalsSnapshot | null;
  getEvents(day: Day): MarketEvent[];
}

/** Columnar OHLCV series aligned to the calendar starting at `start`. */
export interface PriceSeries {
  start: Day;
  open: ArrayLike<number>;
  high: ArrayLike<number>;
  low: ArrayLike<number>;
  close: ArrayLike<number>;
  volume: ArrayLike<number>;
}

/**
 * Shared implementation for providers whose data ends up as columnar series in memory.
 * Subclasses fill `calendar`, `companies`, `series` and `indexSeries`.
 */
export abstract class SeriesProvider implements MarketDataProvider {
  protected calendar: string[] = [];
  protected companies: Company[] = [];
  protected companyById = new Map<string, Company>();
  protected series = new Map<string, PriceSeries>();
  protected indexSeries: PriceSeries | null = null;
  /** Non-earnings events (e.g. synthetic Sandbox shocks). */
  protected extraEvents: MarketEvent[] = [];
  private eventsByDay: Map<Day, MarketEvent[]> | null = null;

  abstract init(): Promise<void>;
  abstract getInfo(): DatasetInfo;
  abstract ensureLoaded(companyIds: readonly string[]): Promise<void>;

  protected setCompanies(list: Company[]): void {
    this.companies = list;
    this.companyById = new Map(list.map((c) => [c.id, c]));
    this.eventsByDay = null;
  }

  getCalendar(): readonly string[] {
    return this.calendar;
  }

  getCompanies(): readonly Company[] {
    return this.companies;
  }

  getCompany(id: string): Company | undefined {
    return this.companyById.get(id);
  }

  protected barFrom(s: PriceSeries | null | undefined, day: Day): PriceBar | null {
    if (!s) return null;
    const i = day - s.start;
    if (i < 0 || i >= s.close.length) return null;
    const close = s.close[i];
    if (!(close > 0)) return null;
    return {
      day,
      date: this.calendar[day],
      open: s.open[i],
      high: s.high[i],
      low: s.low[i],
      close,
      volume: s.volume[i],
    };
  }

  protected rangeFrom(s: PriceSeries | null | undefined, from: Day, to: Day): PriceBar[] {
    if (!s) return [];
    const lo = Math.max(from, s.start);
    const hi = Math.min(to, s.start + s.close.length - 1);
    const out: PriceBar[] = [];
    for (let d = lo; d <= hi; d++) {
      const b = this.barFrom(s, d);
      if (b) out.push(b);
    }
    return out;
  }

  protected closesFrom(s: PriceSeries | null | undefined, from: Day, to: Day): ArrayLike<number> {
    if (!s) return [];
    const lo = Math.max(from, s.start) - s.start;
    const hi = Math.min(to, s.start + s.close.length - 1) - s.start;
    if (hi < lo) return [];
    const c = s.close;
    return c instanceof Float64Array ? c.subarray(lo, hi + 1) : Array.prototype.slice.call(c, lo, hi + 1);
  }

  getCloses(companyId: string, from: Day, to: Day): ArrayLike<number> {
    return this.closesFrom(this.series.get(companyId), from, to);
  }

  getIndexCloses(from: Day, to: Day): ArrayLike<number> {
    return this.closesFrom(this.indexSeries, from, to);
  }

  getPrice(companyId: string, day: Day): PriceBar | null {
    return this.barFrom(this.series.get(companyId), day);
  }

  getPriceRange(companyId: string, from: Day, to: Day): PriceBar[] {
    return this.rangeFrom(this.series.get(companyId), from, to);
  }

  getIndexPrice(day: Day): PriceBar | null {
    return this.barFrom(this.indexSeries, day);
  }

  getIndexRange(from: Day, to: Day): PriceBar[] {
    return this.rangeFrom(this.indexSeries, from, to);
  }

  getFundamentals(companyId: string, day: Day): FundamentalsSnapshot | null {
    const company = this.companyById.get(companyId);
    const bar = this.getPrice(companyId, day);
    if (!company || !bar) return null;
    return fundamentalsAt(company, bar.date, bar.close);
  }

  getEvents(day: Day): MarketEvent[] {
    if (!this.eventsByDay) {
      const map = new Map<Day, MarketEvent[]>();
      for (const c of this.companies) {
        for (const d of c.earningsDays) {
          let list = map.get(d);
          if (!list) map.set(d, (list = []));
          list.push({ kind: 'earnings', day: d, companyId: c.id });
        }
      }
      for (const e of this.extraEvents) {
        let list = map.get(e.day);
        if (!list) map.set(e.day, (list = []));
        list.push(e);
      }
      this.eventsByDay = map;
    }
    return this.eventsByDay.get(day) ?? [];
  }
}
