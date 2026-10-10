import type { Company, DatasetInfo, FundamentalsYear, SectorId } from '../types';
import { SECTOR_IDS } from '../types';
import { SeriesProvider } from './MarketDataProvider';
import type { PriceSeries } from './MarketDataProvider';

/** Shape of public/data/manifest.json written by scripts/fetch_data.py. */
export interface ManifestJson {
  version: number;
  generatedAt: string;
  source: string;
  currency: string;
  /** Conversion applied to all money values (e.g. USD → THB). */
  fx: number;
  calendar: string[];
  index: { ticker: string; name: string };
  companies: {
    id: string;
    ticker: string;
    name: string;
    sector: string;
    descTh: string;
    industryTh: string;
    sharesOutstanding: number;
    firstDay: number;
    lastDay: number;
    fundamentals: FundamentalsYear[];
    earningsDays: number[];
  }[];
}

export interface PriceFileJson {
  start: number;
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

export type Fetcher = (path: string) => Promise<unknown>;

const defaultFetcher: Fetcher = async (path) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  // Dev servers may answer unknown paths with index.html — json() then throws.
  return res.json();
};

export const INDEX_ID = '_INDEX';

/** Bundled historical dataset (JSON files under /data). */
export class HistoricalProvider extends SeriesProvider {
  private manifest: ManifestJson | null = null;
  private loading = new Map<string, Promise<void>>();

  constructor(
    private readonly baseUrl = `${import.meta.env?.BASE_URL ?? '/'}data`,
    private readonly fetcher: Fetcher = defaultFetcher,
  ) {
    super();
  }

  async init(): Promise<void> {
    const m = (await this.fetcher(`${this.baseUrl}/manifest.json`)) as ManifestJson;
    if (!m || !Array.isArray(m.calendar) || !Array.isArray(m.companies) || m.companies.length === 0) {
      throw new Error('Invalid manifest');
    }
    this.manifest = m;
    this.calendar = m.calendar;
    const fx = m.fx || 1;
    const companies: Company[] = m.companies
      .filter((c) => (SECTOR_IDS as readonly string[]).includes(c.sector))
      .map((c) => ({
        id: c.id,
        realName: c.name,
        ticker: c.ticker,
        sector: c.sector as SectorId,
        description: c.descTh,
        disguisedDescription: c.industryTh,
        sharesOutstanding: c.sharesOutstanding,
        fundamentals: c.fundamentals
          .map((f) => ({
            year: f.year,
            revenue: f.revenue * fx,
            netIncome: f.netIncome * fx,
            equity: f.equity * fx,
            debtToEquity: f.debtToEquity,
            dividendPerShare: f.dividendPerShare * fx,
          }))
          .sort((a, b) => a.year - b.year),
        earningsDays: [...c.earningsDays].sort((a, b) => a - b),
        firstDay: c.firstDay,
        lastDay: c.lastDay,
      }));
    this.setCompanies(companies);
    await this.loadSeries(INDEX_ID);
  }

  getInfo(): DatasetInfo {
    const m = this.manifest;
    return {
      label: 'ข้อมูลย้อนหลังจริง',
      detail: m
        ? `ราคาย้อนหลังจริงจาก ${m.source} (${m.calendar[0]} ถึง ${m.calendar[m.calendar.length - 1]}) แปลงเป็นบาทที่อัตรา ${m.fx} ต่อ ${m.currency} · ตัวเลขงบการเงินเป็นค่าประมาณ`
        : '',
      real: true,
    };
  }

  async ensureLoaded(companyIds: readonly string[]): Promise<void> {
    await Promise.all(companyIds.map((id) => this.loadSeries(id)));
  }

  private loadSeries(id: string): Promise<void> {
    let p = this.loading.get(id);
    if (!p) {
      p = (async () => {
        const raw = (await this.fetcher(`${this.baseUrl}/prices/${encodeURIComponent(id)}.json`)) as PriceFileJson;
        const fx = this.manifest?.fx || 1;
        const scale = (a: number[]) => Float64Array.from(a, (x) => x * fx);
        const s: PriceSeries = {
          start: raw.start,
          open: scale(raw.o),
          high: scale(raw.h),
          low: scale(raw.l),
          close: scale(raw.c),
          volume: raw.v,
        };
        if (id === INDEX_ID) this.indexSeries = s;
        else this.series.set(id, s);
      })();
      this.loading.set(id, p);
      p.catch(() => this.loading.delete(id));
    }
    return p;
  }
}
