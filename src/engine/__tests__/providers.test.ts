import { describe, expect, it } from 'vitest';
import { MarketView } from '../MarketView';
import { HistoricalProvider, INDEX_ID } from '../provider/HistoricalProvider';
import type { ManifestJson, PriceFileJson } from '../provider/HistoricalProvider';
import { SimulatedProvider } from '../provider/SimulatedProvider';
import { sampleRun } from '../sampler';
import { SECTOR_IDS } from '../types';

function sim(seed = 42) {
  const p = new SimulatedProvider({ seed, companiesPerSector: 6 });
  p.generate();
  return p;
}

describe('SimulatedProvider', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = sim(1);
    const b = sim(1);
    const c = sim(2);
    const id = a.getCompanies()[0].id;
    expect(a.getPrice(id, 500)).toEqual(b.getPrice(id, 500));
    expect(a.getCompanies()[0].realName === c.getCompanies()[0].realName && a.getPrice(id, 500)?.close === c.getPrice(c.getCompanies()[0].id, 500)?.close).toBe(false);
  });

  it('produces sane OHLC bars, fundamentals and all sectors', () => {
    const p = sim();
    const cal = p.getCalendar();
    expect(cal.length).toBeGreaterThan(2500);
    expect(new Set(p.getCompanies().map((c) => c.sector)).size).toBe(SECTOR_IDS.length);
    for (const c of p.getCompanies()) {
      for (const d of [0, 1000, cal.length - 1]) {
        const b = p.getPrice(c.id, d)!;
        expect(Number.isFinite(b.close) && b.close > 0).toBe(true);
        expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close) - 1e-9);
        expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close) + 1e-9);
      }
      const f = p.getFundamentals(c.id, 1500)!;
      expect(f.marketCap).toBeGreaterThan(0);
      expect(f.revenue).toBeGreaterThan(0);
    }
    expect(p.getIndexPrice(10)?.close).toBeGreaterThan(0);
    expect(p.getEvents(p.getCompanies()[0].earningsDays[0]).length).toBeGreaterThan(0);
  });

  it('only exposes already-reported fiscal years', () => {
    const p = sim();
    const cal = p.getCalendar();
    const c = p.getCompanies()[0];
    const day = cal.findIndex((d) => d >= '2018-06-01');
    expect(p.getFundamentals(c.id, day)!.fiscalYear).toBe(2017);
    const day2 = cal.findIndex((d) => d >= '2018-02-01');
    expect(p.getFundamentals(c.id, day2)!.fiscalYear).toBe(2016);
  });
});

describe('sampleRun', () => {
  it('picks a valid window with 15–20 sector-balanced companies', () => {
    const p = sim();
    for (let seed = 1; seed < 20; seed++) {
      const run = sampleRun({ seed, calendarLength: p.getCalendar().length, companies: p.getCompanies(), years: 2, startingCash: 1e6 });
      expect(run.windowEnd - run.windowStart + 1).toBe(504);
      expect(run.windowStart).toBeGreaterThanOrEqual(252);
      expect(run.windowEnd).toBeLessThan(p.getCalendar().length);
      expect(run.companyIds.length).toBeGreaterThanOrEqual(15);
      expect(run.companyIds.length).toBeLessThanOrEqual(20);
      expect(new Set(run.companyIds).size).toBe(run.companyIds.length);
      const sectors = run.companyIds.map((id) => p.getCompany(id)!.sector);
      const counts = SECTOR_IDS.map((s) => sectors.filter((x) => x === s).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      const names = Object.values(run.disguisedNames);
      expect(new Set(names).size).toBe(names.length);
      for (const id of run.companyIds) expect(run.disguisedNames[id]).not.toBe(p.getCompany(id)!.realName);
    }
  });

  it('is reproducible from its seed', () => {
    const p = sim();
    const args = { seed: 7, calendarLength: p.getCalendar().length, companies: p.getCompanies(), years: 1, startingCash: 1e6 };
    expect(sampleRun(args)).toEqual(sampleRun(args));
  });
});

describe('MarketView', () => {
  it('never returns data after the current day', () => {
    const p = sim();
    const run = sampleRun({ seed: 3, calendarLength: p.getCalendar().length, companies: p.getCompanies(), years: 1, startingCash: 1e6 });
    const v = new MarketView(p, run);
    const id = run.companyIds[0];
    v.setDay(run.windowStart + 10);
    expect(v.history(id).at(-1)!.day).toBe(run.windowStart + 10);
    expect(v.bar(id, run.windowEnd)!.day).toBe(run.windowStart + 10);
    expect(v.indexHistory().at(-1)!.day).toBe(run.windowStart + 10);
    expect(v.events(0, run.windowEnd).every((e) => e.day <= run.windowStart + 10)).toBe(true);
    v.setDay(run.windowEnd + 100);
    expect(v.currentDay).toBe(run.windowEnd);
  });
});

describe('HistoricalProvider', () => {
  const manifest: ManifestJson = {
    version: 1,
    generatedAt: 'x',
    source: 'test',
    currency: 'USD',
    fx: 35,
    calendar: ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'],
    index: { ticker: 'SPY', name: 'Index' },
    companies: [
      {
        id: 'AAA',
        ticker: 'AAA',
        name: 'Alpha Inc.',
        sector: 'tech',
        descTh: 'จริง',
        industryTh: 'ซอฟต์แวร์',
        sharesOutstanding: 1000,
        firstDay: 1,
        lastDay: 3,
        fundamentals: [{ year: 2018, revenue: 100, netIncome: 10, equity: 50, debtToEquity: 0.5, dividendPerShare: 0.1 }],
        earningsDays: [2],
      },
    ],
  };
  const files: Record<string, unknown> = {
    '/data/manifest.json': manifest,
    [`/data/prices/${INDEX_ID}.json`]: { start: 0, o: [1, 2, 3, 4], h: [1, 2, 3, 4], l: [1, 2, 3, 4], c: [1, 2, 3, 4], v: [0, 0, 0, 0] } satisfies PriceFileJson,
    '/data/prices/AAA.json': { start: 1, o: [10, 11, 12], h: [10, 11, 12], l: [10, 11, 12], c: [10, 11, 12], v: [5, 5, 5] } satisfies PriceFileJson,
  };
  const fetcher = async (path: string) => {
    if (!(path in files)) throw new Error('404');
    return files[path];
  };

  it('loads manifest and lazily loads price files, converting to THB', async () => {
    const p = new HistoricalProvider('/data', fetcher);
    await p.init();
    expect(p.getCompanies()).toHaveLength(1);
    expect(p.getPrice('AAA', 1)).toBeNull();
    await p.ensureLoaded(['AAA']);
    expect(p.getPrice('AAA', 0)).toBeNull();
    expect(p.getPrice('AAA', 2)!.close).toBe(11 * 35);
    expect(p.getIndexPrice(3)!.close).toBe(4 * 35);
    const f = p.getFundamentals('AAA', 2)!;
    expect(f.revenue).toBe(100 * 35);
    expect(f.pe).toBeCloseTo((11 * 35) / ((10 * 35) / 1000), 6);
    expect(p.getEvents(2)).toEqual([{ kind: 'earnings', day: 2, companyId: 'AAA' }]);
  });

  it('fails init when manifest is missing so the fallback can kick in', async () => {
    const p = new HistoricalProvider('/nope', fetcher);
    await expect(p.init()).rejects.toThrow();
  });
});
