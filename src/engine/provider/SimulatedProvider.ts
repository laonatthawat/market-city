import { NAME_PREFIXES, SECTORS } from '../../data/sectors';
import { weekdayCalendar, TRADING_DAYS_PER_YEAR } from '../calendar';
import { Rng, deriveSeed } from '../rng';
import { SECTOR_IDS } from '../types';
import type { Company, DatasetInfo, FundamentalsYear, SectorId } from '../types';
import { SeriesProvider } from './MarketDataProvider';
import type { PriceSeries } from './MarketDataProvider';

/**
 * Procedural market: geometric Brownian motion with Markov regime switching,
 * market → sector → company factor structure, earnings jumps and random shocks.
 * Fully deterministic for a given seed.
 */

export type Regime = 'bull' | 'choppy' | 'bear' | 'crash' | 'recovery';

/** Strength (per year) of the pull of each price towards its earnings-based fair value. */
const VALUE_PULL = 2;

const REGIMES: Record<Regime, { mu: number; vol: number }> = {
  bull: { mu: 0.16, vol: 0.13 },
  choppy: { mu: 0.0, vol: 0.18 },
  bear: { mu: -0.28, vol: 0.27 },
  crash: { mu: -2.4, vol: 0.6 },
  recovery: { mu: 0.65, vol: 0.3 },
};

const TRANSITIONS: Record<Regime, [Regime, number][]> = {
  bull: [['choppy', 0.004], ['bear', 0.0015], ['crash', 0.0005]],
  choppy: [['bull', 0.007], ['bear', 0.0025], ['crash', 0.0005]],
  bear: [['choppy', 0.004], ['bull', 0.003], ['crash', 0.001]],
  crash: [['recovery', 0.06]],
  recovery: [['bull', 0.025]],
};

interface SectorParams {
  beta: number;
  vol: number;
  idio: number;
  drift: number;
  pe: [number, number];
  growth: [number, number];
  margin: [number, number];
  de: [number, number];
  payout: number;
  roe: [number, number];
}

const SECTOR_PARAMS: Record<SectorId, SectorParams> = {
  tech: { beta: 1.2, vol: 0.12, idio: 0.28, drift: 0.04, pe: [20, 45], growth: [0.08, 0.25], margin: [0.12, 0.3], de: [0.2, 0.8], payout: 0.1, roe: [0.15, 0.4] },
  finance: { beta: 1.1, vol: 0.1, idio: 0.2, drift: 0, pe: [9, 16], growth: [0.02, 0.08], margin: [0.15, 0.3], de: [1.5, 6], payout: 0.35, roe: [0.08, 0.16] },
  energy: { beta: 0.9, vol: 0.18, idio: 0.26, drift: -0.01, pe: [8, 16], growth: [-0.02, 0.06], margin: [0.05, 0.15], de: [0.3, 1.2], payout: 0.5, roe: [0.06, 0.18] },
  consumer: { beta: 0.95, vol: 0.08, idio: 0.22, drift: 0.02, pe: [18, 32], growth: [0.03, 0.12], margin: [0.04, 0.15], de: [0.4, 1.5], payout: 0.4, roe: [0.12, 0.35] },
  healthcare: { beta: 0.8, vol: 0.09, idio: 0.24, drift: 0.02, pe: [14, 28], growth: [0.04, 0.12], margin: [0.08, 0.25], de: [0.3, 1.0], payout: 0.35, roe: [0.1, 0.3] },
  industrial: { beta: 1.05, vol: 0.1, idio: 0.22, drift: 0, pe: [14, 24], growth: [0.02, 0.08], margin: [0.06, 0.14], de: [0.5, 1.8], payout: 0.4, roe: [0.1, 0.25] },
  realestate: { beta: 0.85, vol: 0.1, idio: 0.18, drift: 0, pe: [25, 45], growth: [0.02, 0.07], margin: [0.2, 0.4], de: [0.8, 2.0], payout: 0.85, roe: [0.04, 0.1] },
};

export interface SimulatedOptions {
  seed: number;
  startDate?: string;
  endDate?: string;
  companiesPerSector?: number;
  /** Random idiosyncratic shocks per company per year. */
  shockRate?: number;
  /** Synthetic macro shocks per year (Sandbox only): crashes, sector booms, scandals, rate surprises. */
  syntheticEventsPerYear?: number;
}

export class SimulatedProvider extends SeriesProvider {
  readonly options: Required<SimulatedOptions>;
  /** Regime of each day (exposed for tests / future weather). */
  regimes: Regime[] = [];
  private ready = false;

  constructor(options: SimulatedOptions) {
    super();
    this.options = {
      startDate: '2015-01-02',
      endDate: '2025-12-31',
      companiesPerSector: 13,
      shockRate: 0.5,
      syntheticEventsPerYear: 0,
      ...options,
    };
  }

  getInfo(): DatasetInfo {
    return {
      label: 'ตลาดจำลอง',
      detail: `ข้อมูลจำลองด้วยโมเดลสุ่ม (seed ${this.options.seed}) — ชื่อบริษัทและวันที่เป็นข้อมูลสมมติ`,
      real: false,
    };
  }

  async init(): Promise<void> {
    this.generate();
  }

  async ensureLoaded(): Promise<void> {
    // Everything is generated up-front.
  }

  /** Synchronous generation (also used by tests). */
  generate(): void {
    if (this.ready) return;
    const { seed, startDate, endDate, companiesPerSector, shockRate, syntheticEventsPerYear } = this.options;
    this.calendar = weekdayCalendar(startDate, endDate);
    const n = this.calendar.length;
    const rng = new Rng(seed);

    // 1) Market factor with regime switching.
    const market = new Float64Array(n);
    let regime: Regime = 'bull';
    for (let t = 0; t < n; t++) {
      const roll = rng.next();
      let acc = 0;
      for (const [to, p] of TRANSITIONS[regime]) {
        acc += p;
        if (roll < acc) {
          regime = to;
          break;
        }
      }
      this.regimes.push(regime);
      const { mu, vol } = REGIMES[regime];
      const sd = vol / Math.sqrt(TRADING_DAYS_PER_YEAR);
      market[t] = mu / TRADING_DAYS_PER_YEAR - 0.5 * sd * sd + sd * rng.normal();
    }
    const yearOf = (t: number) => Number(this.calendar[t].slice(0, 4));

    // 1b) Synthetic shocks (Sandbox). Effects are written into the factor paths below.
    const shocks = planShocks(new Rng(deriveSeed(seed, 'shocks')), n, syntheticEventsPerYear, companiesPerSector);
    for (const sh of shocks) {
      if (sh.kind === 'crash') for (let t = sh.day; t < Math.min(n, sh.day + sh.days); t++) market[t] -= sh.size / sh.days;
    }
    this.extraEvents = shocks.map((sh) => ({
      kind: 'shock' as const,
      day: sh.day,
      headline: sh.headline,
      sectors: sh.sector ? [sh.sector] : undefined,
      companyId: undefined as string | undefined,
    }));
    const firstYear = yearOf(0);
    const lastYear = yearOf(n - 1);

    // Market return per calendar year, used to nudge fundamentals.
    const yearReturn = new Map<number, number>();
    for (let t = 0; t < n; t++) yearReturn.set(yearOf(t), (yearReturn.get(yearOf(t)) ?? 0) + market[t]);

    // 2) Index series.
    this.indexSeries = this.buildSeries(rng, market, 4000, 1e9, 0.01);

    // 3) Sectors and companies.
    const usedNames = new Set<string>();
    const companies: Company[] = [];
    for (const sectorId of SECTOR_IDS) {
      const sp = SECTOR_PARAMS[sectorId];
      const meta = SECTORS[sectorId];
      const srng = new Rng(deriveSeed(seed, sectorId));
      const sector = new Float64Array(n);
      const sdS = sp.vol / Math.sqrt(TRADING_DAYS_PER_YEAR);
      for (let t = 0; t < n; t++) {
        sector[t] = sp.beta * market[t] + sp.drift / TRADING_DAYS_PER_YEAR - 0.5 * sdS * sdS + sdS * srng.normal();
      }
      for (const sh of shocks) {
        if (sh.kind === 'boom' && sh.sector === sectorId) for (let t = sh.day; t < Math.min(n, sh.day + sh.days); t++) sector[t] += sh.size / sh.days;
        if (sh.kind === 'rate') sector[sh.day] += sectorId === 'finance' ? 0.02 : sectorId === 'realestate' || sectorId === 'tech' ? -0.06 : -0.015;
      }

      for (let k = 0; k < companiesPerSector; k++) {
        const crng = new Rng(deriveSeed(seed, `${sectorId}:${k}`));
        let name = '';
        do {
          name = `${crng.pick(NAME_PREFIXES)} ${crng.pick(meta.suffixes)}`;
        } while (usedNames.has(name));
        usedNames.add(name);
        const ticker = makeTicker(name, companies);
        const id = `SIM-${ticker}`;
        const industry = crng.pick(meta.industriesTh);

        // Fundamentals path.
        const growth = crng.range(sp.growth[0], sp.growth[1]);
        let margin = crng.range(sp.margin[0], sp.margin[1]);
        let revenue = 10 ** crng.range(10.6, 12.9);
        let de = crng.range(sp.de[0], sp.de[1]);
        const roe = crng.range(sp.roe[0], sp.roe[1]);
        let equity = (revenue * margin) / roe;
        const pe0 = crng.range(sp.pe[0], sp.pe[1]);
        const price0 = 10 ** crng.range(2.2, 3.7);
        const mcap0 = revenue * margin * pe0;
        const shares = Math.round(mcap0 / price0);
        const fundamentals: FundamentalsYear[] = [];
        for (let y = firstYear - 1; y <= lastYear; y++) {
          if (y > firstYear - 1) {
            const g = growth + 0.25 * (yearReturn.get(y) ?? 0) + crng.normal() * 0.05;
            revenue *= 1 + g;
            margin = clamp(margin + crng.normal() * 0.02 + (g - growth) * 0.1, -0.12, 0.45);
            de = clamp(de * Math.exp(crng.normal() * 0.12), 0.05, 8);
          }
          const netIncome = revenue * margin;
          equity = Math.max(equity * 0.6, equity + netIncome * (1 - sp.payout));
          fundamentals.push({
            year: y,
            revenue,
            netIncome,
            equity,
            debtToEquity: de,
            dividendPerShare: netIncome > 0 ? (netIncome * sp.payout) / shares : 0,
          });
        }

        // Earnings roughly every quarter, offset per company.
        const earningsDays: number[] = [];
        for (let d = crng.int(15, 60); d < n; d += crng.int(60, 66)) earningsDays.push(d);
        const earningsSet = new Set(earningsDays);

        // Company returns.
        const beta = crng.range(0.7, 1.3);
        const idio = sp.idio * crng.range(0.75, 1.3);
        const alpha = (growth - 0.06) * 0.6 + crng.normal() * 0.04;
        const sdI = idio / Math.sqrt(TRADING_DAYS_PER_YEAR);
        const pShock = shockRate / TRADING_DAYS_PER_YEAR;
        const scandal = shocks.find((sh) => sh.kind === 'scandal' && sh.sector === sectorId && sh.index === k);
        const fundByYear = new Map(fundamentals.map((f) => [f.year, f]));
        const rets = new Float64Array(n);
        // Valuation anchor: price is pulled (slowly) towards what the earnings justify at the starting P/E,
        // so over many years the random walk can't drift into P/E 0.5 or a 70% dividend yield.
        // Blend this year's earnings with last year's (the figures players can actually see).
        const fairLog = (y: number) => {
          const f = fundByYear.get(y) ?? fundamentals[fundamentals.length - 1];
          const p = fundByYear.get(y - 1) ?? f;
          const earnings = (Math.max(f.netIncome, f.revenue * 0.02) + Math.max(p.netIncome, p.revenue * 0.02)) / 2;
          return Math.log((earnings * pe0) / shares);
        };
        let logP = Math.log(price0);
        for (let t = 0; t < n; t++) {
          let r = alpha / TRADING_DAYS_PER_YEAR + beta * sector[t] - 0.5 * sdI * sdI + sdI * crng.normal();
          r += (VALUE_PULL / TRADING_DAYS_PER_YEAR) * (fairLog(yearOf(t)) - logP);
          if (earningsSet.has(t)) {
            const f = fundByYear.get(yearOf(t));
            const p = fundByYear.get(yearOf(t) - 1);
            const surprise = f && p && p.revenue > 0 ? (f.revenue / p.revenue - 1 - growth) * 0.6 : 0;
            r += clamp(surprise, -0.08, 0.08) + crng.normal() * 0.045;
          }
          if (crng.chance(pShock)) r += crng.normal() * 0.13;
          if (scandal && scandal.day === t) r -= scandal.size;
          rets[t] = r;
          logP += r;
        }
        const series = this.buildSeries(crng, rets, price0, shares * 0.006, sdI);
        this.series.set(id, series);

        companies.push({
          id,
          realName: name,
          ticker,
          sector: sectorId,
          description: `${industry} (บริษัทสมมติในตลาดจำลอง)`,
          disguisedDescription: industry,
          sharesOutstanding: shares,
          fundamentals,
          earningsDays,
          firstDay: 0,
          lastDay: n - 1,
        });
      }
    }
    // Link scandal headlines to the affected company.
    this.extraEvents.forEach((e, i) => {
      const sh = shocks[i];
      if (sh.kind === 'scandal') e.companyId = companies.filter((c) => c.sector === sh.sector)[sh.index ?? 0]?.id;
    });
    this.setCompanies(companies);
    this.ready = true;
  }

  private buildSeries(
    rng: Rng,
    rets: Float64Array,
    startPrice: number,
    baseVolume: number,
    dailyVol: number,
  ): PriceSeries {
    const n = rets.length;
    const open = new Float64Array(n);
    const high = new Float64Array(n);
    const low = new Float64Array(n);
    const close = new Float64Array(n);
    const volume = new Float64Array(n);
    const sd = Math.max(dailyVol, 0.004);
    let prev = startPrice;
    for (let t = 0; t < n; t++) {
      const r = rets[t];
      const c = prev * Math.exp(r);
      const o = prev * Math.exp(r * rng.range(0, 0.6) + rng.normal() * sd * 0.15);
      const hi = Math.max(o, c) * Math.exp(Math.abs(rng.normal()) * sd * 0.5);
      const lo = Math.min(o, c) * Math.exp(-Math.abs(rng.normal()) * sd * 0.5);
      open[t] = o;
      high[t] = hi;
      low[t] = lo;
      close[t] = c;
      volume[t] = Math.round(baseVolume * Math.exp(rng.normal() * 0.3) * (1 + (2.5 * Math.abs(r)) / sd));
      prev = c;
    }
    return { start: 0, open, high, low, close, volume };
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function makeTicker(name: string, existing: Company[]): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  const taken = new Set(existing.map((c) => c.ticker));
  const words = name.split(' ');
  const candidates = [
    (words[0].slice(0, 3) + words[1][0]).toUpperCase(),
    (words[0].slice(0, 2) + words[1].slice(0, 2)).toUpperCase(),
    letters.slice(0, 4),
  ];
  for (const c of candidates) if (!taken.has(c)) return c;
  let i = 2;
  while (taken.has(letters.slice(0, 3) + i)) i++;
  return letters.slice(0, 3) + i;
}

interface PlannedShock {
  kind: 'crash' | 'boom' | 'scandal' | 'rate';
  day: number;
  days: number;
  size: number;
  sector?: SectorId;
  index?: number;
  headline: string;
}

const CRASH_HEADLINES = [
  'ข่าวด่วน: วิกฤตการเงินลุกลาม ตลาดถล่มทั้งเมือง',
  'ข่าวด่วน: เหตุการณ์ไม่คาดฝันทั่วโลก นักลงทุนแห่ขายหุ้น',
  'ข่าวด่วน: ฟองสบู่แตก! ดัชนีเมืองดิ่งต่อเนื่อง',
];

/** Deterministic schedule of synthetic shocks (Sandbox only — never applied to real data). */
function planShocks(rng: Rng, n: number, perYear: number, companiesPerSector: number): PlannedShock[] {
  if (perYear <= 0) return [];
  const count = Math.round((n / TRADING_DAYS_PER_YEAR) * perYear);
  const out: PlannedShock[] = [];
  for (let i = 0; i < count; i++) {
    const day = rng.int(30, n - 30);
    const roll = rng.next();
    const sector = rng.pick(SECTOR_IDS);
    if (roll < 0.3) {
      out.push({ kind: 'crash', day, days: rng.int(8, 16), size: rng.range(0.15, 0.3), headline: rng.pick(CRASH_HEADLINES) });
    } else if (roll < 0.55) {
      out.push({ kind: 'boom', day, days: rng.int(30, 55), size: rng.range(0.2, 0.4), sector, headline: `ข่าวด่วน: นวัตกรรมใหม่จุดกระแส ${SECTORS[sector].districtTh}บูมสุดขีด` });
    } else if (roll < 0.8) {
      out.push({ kind: 'scandal', day, days: 1, size: rng.range(0.25, 0.45), sector, index: rng.int(0, companiesPerSector - 1), headline: 'ข่าวด่วน: {company} ถูกสอบสวนกรณีตกแต่งบัญชี ราคาหุ้นดิ่ง' });
    } else {
      out.push({ kind: 'rate', day, days: 1, size: 0.06, headline: 'ข่าวด่วน: ธนาคารกลางขึ้นดอกเบี้ยแรงเกินคาด หุ้นอสังหาฯ และเทคโนโลยีถูกเทขาย' });
    }
  }
  return out.sort((a, b) => a.day - b.day);
}
