import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../../data/tutorials';
import { weekdayCalendar } from '../calendar';
import { applyAction } from '../decisions/actions';
import { buildDecision, buildOutcome, optionPortfolios } from '../decisions/build';
import { detectTriggers, newTracker, pickTrigger, recordTrigger } from '../decisions/triggers';
import type { EquitySample, TriggerCandidate } from '../decisions/triggers';
import { MarketView } from '../MarketView';
import { buy, createPortfolio, totalValue } from '../portfolio';
import type { Portfolio } from '../portfolio';
import { SeriesProvider } from '../provider/MarketDataProvider';
import { SimulatedProvider } from '../provider/SimulatedProvider';
import { buildChapterDecision, resolveChapter } from '../tutorial';
import type { Company, DatasetInfo, Run, SectorId } from '../types';

/** Tiny provider with hand-made price paths. */
class TestProvider extends SeriesProvider {
  constructor(paths: Record<string, { sector: SectorId; closes: number[] }>, index: number[]) {
    super();
    const n = index.length;
    this.calendar = weekdayCalendar('2018-01-01', '2030-01-01').slice(0, n);
    const companies: Company[] = [];
    for (const [id, p] of Object.entries(paths)) {
      this.series.set(id, { start: 0, open: p.closes, high: p.closes, low: p.closes, close: p.closes, volume: p.closes.map(() => 1000) });
      companies.push({
        id,
        realName: id,
        ticker: id,
        sector: p.sector,
        description: '',
        disguisedDescription: '',
        sharesOutstanding: 1e6,
        fundamentals: [{ year: 2017, revenue: 1e9, netIncome: 1e8, equity: 5e8, debtToEquity: 0.5, dividendPerShare: 0 }],
        earningsDays: [],
        firstDay: 0,
        lastDay: n - 1,
      });
    }
    this.indexSeries = { start: 0, open: index, high: index, low: index, close: index, volume: index.map(() => 0) };
    this.setCompanies(companies);
  }
  async init() {}
  async ensureLoaded() {}
  getInfo(): DatasetInfo {
    return { label: 'test', detail: '', real: false };
  }
}

const N = 600;
const flat = (v: number) => Array.from({ length: N }, () => v);
// A: flat at 100, then falls 25% from day 400. B: flat. Index: flat.
const aPath = flat(100).map((v, i) => (i >= 400 ? 75 : v));

function setup() {
  const provider = new TestProvider({ A: { sector: 'tech', closes: aPath }, B: { sector: 'energy', closes: flat(50) } }, flat(1000));
  const run: Run = {
    id: 't',
    seed: 1,
    windowStart: 300,
    windowEnd: 550,
    historyStart: 50,
    companyIds: ['A', 'B'],
    disguisedNames: { A: 'Alpha Labs', B: 'Beta Energy' },
    startingCash: 100_000,
    years: 1,
    modifiers: {},
  };
  const view = new MarketView(provider, run);
  view.setDay(300);
  let p = createPortfolio(100_000);
  const r = buy(p, { companyId: 'A', shares: 600, price: 100, day: 300 });
  if (!r.ok) throw new Error();
  p = r.portfolio;
  return { provider, run, view, portfolio: p };
}

const priceAt = (view: MarketView) => (id: string) => view.close(id);

describe('applyAction', () => {
  it('handles every action kind without throwing', () => {
    const { view, portfolio } = setup();
    const px = priceAt(view);
    expect(applyAction(portfolio, { kind: 'hold' }, px, 300)).toBe(portfolio);
    expect(applyAction(portfolio, { kind: 'trim', companyId: 'A', fraction: 0.5 }, px, 300).holdings.A.shares).toBe(300);
    expect(applyAction(portfolio, { kind: 'sell_all', companyId: 'A' }, px, 300).holdings.A).toBeUndefined();
    const reb = applyAction(portfolio, { kind: 'rebalance', companyId: 'A', targetWeight: 0.2 }, px, 300);
    expect((reb.holdings.A.shares * 100) / totalValue(reb, px)).toBeLessThanOrEqual(0.2 + 1e-9);
    const more = applyAction(portfolio, { kind: 'buy_more', companyId: 'A', amount: 10_000 }, px, 300);
    expect(more.holdings.A.shares).toBeGreaterThan(600);
    const basket = applyAction(portfolio, { kind: 'buy_basket', companyIds: ['A', 'B'], amount: 20_000 }, px, 300);
    expect(basket.holdings.B.shares).toBeGreaterThan(0);
    const rot = applyAction(portfolio, { kind: 'rotate', sellIds: ['A'], sellFraction: 1, buyIds: ['B'] }, px, 300);
    expect(rot.holdings.A).toBeUndefined();
    expect(rot.holdings.B.shares).toBeGreaterThan(500);
    // Impossible trades are skipped, not thrown.
    expect(applyAction(createPortfolio(0), { kind: 'buy_more', companyId: 'A', amount: 1e9 }, px, 300).holdings.A).toBeUndefined();
  });
});

describe('detectTriggers', () => {
  it('finds a ≥20% drop and concentration on a held stock', () => {
    const { view, portfolio } = setup();
    view.setDay(399);
    expect(detectTriggers(view, portfolio, []).some((c) => c.type === 'holding_drop')).toBe(false);
    view.setDay(400);
    const types = detectTriggers(view, portfolio, []).map((c) => c.type);
    expect(types).toContain('holding_drop');
    expect(types).toContain('concentration');
  });

  it('flags long cash holdings during a rising market', () => {
    // The city index follows the run's own companies, so the company itself has to rise.
    const provider = new TestProvider({ A: { sector: 'tech', closes: Array.from({ length: N }, (_, i) => 100 + i * 0.2) } }, Array.from({ length: N }, (_, i) => 1000 + i * 2));
    const { run } = setup();
    const view = new MarketView(provider, { ...run, companyIds: ['A'] });
    view.setDay(400);
    const eq: EquitySample[] = Array.from({ length: 70 }, (_, k) => ({ day: 331 + k, value: 100_000, cash: 100_000 }));
    const c = detectTriggers(view, createPortfolio(100_000), eq).find((x) => x.type === 'cash_drag');
    expect(c).toBeDefined();
    expect(c!.params.indexRet).toBeGreaterThan(0.03);
  });

  it('builds the city index from the run companies only (equal weight)', () => {
    const provider = new TestProvider(
      { A: { sector: 'tech', closes: Array.from({ length: N }, (_, i) => 100 * 1.01 ** i) }, B: { sector: 'energy', closes: flat(50) } },
      Array.from({ length: N }, () => 1000),
    );
    const { run } = setup();
    const view = new MarketView(provider, { ...run, companyIds: ['A', 'B'] });
    view.setDay(run.historyStart + 10);
    const h = view.indexHistory();
    // Half the city gains 1% a day, the other half is flat: about +0.5% a day, ignoring the provider's own index.
    expect(h[1].close / h[0].close).toBeCloseTo(1.005, 6);
    expect(h.at(-1)!.day).toBe(view.currentDay);
  });
});

describe('pickTrigger', () => {
  const cand = (type: TriggerCandidate['type'], key: string, priority: number): TriggerCandidate => ({ type, key, priority, params: {} });
  const limits = { minGap: 21, maxPerRun: 2, windowStart: 0, windowEnd: 1000 };

  it('prefers the highest priority and respects gap, cooldown and cap', () => {
    let t = newTracker();
    const cs = [cand('new_high', 'new_high:A', 50), cand('holding_drop', 'holding_drop:A', 100)];
    expect(pickTrigger(cs, t, 100, limits)?.type).toBe('holding_drop');
    t = recordTrigger(t, 'holding_drop:A', 100);
    expect(pickTrigger(cs, t, 110, limits)).toBeNull(); // within a month
    expect(pickTrigger(cs, t, 130, limits)?.type).toBe('new_high'); // drop still cooling down
    t = recordTrigger(t, 'new_high:A', 130);
    expect(pickTrigger(cs, t, 400, limits)).toBeNull(); // max per run reached
  });

  it('never fires right at the start or end of the window', () => {
    const cs = [cand('holding_drop', 'k', 100)];
    expect(pickTrigger(cs, newTracker(), 8, limits)).toBeNull();
    expect(pickTrigger(cs, newTracker(), 995, limits)).toBeNull();
  });
});

describe('decision build + outcome', () => {
  it('builds actionable options and values each one over the forward window', () => {
    const { view, portfolio, run } = setup();
    view.setDay(400);
    const cand = detectTriggers(view, portfolio, []).find((c) => c.type === 'holding_drop')!;
    const dp = buildDecision(cand, view, portfolio, run.disguisedNames);
    expect(dp.options.map((o) => o.id)).toEqual(['buy_more', 'hold', 'trim', 'sell_all']);
    expect(dp.title).toContain('Alpha Labs');
    const portfolios = optionPortfolios(dp, portfolio, view);
    view.setDay(400 + dp.forwardDays);
    const out = buildOutcome(dp, 'hold', portfolios, view, run.disguisedNames);
    expect(out.days).toHaveLength(dp.forwardDays + 1);
    // Prices are flat after the drop, so every option ends where it started (fees aside).
    for (const o of out.outcomes) expect(Math.abs(o.ret)).toBeLessThan(0.01);
    expect(out.lesson.length).toBeGreaterThan(1);
    expect(out.considerations.length).toBeGreaterThan(1);
  });
});

describe('tutorial chapters', () => {
  const sim = new SimulatedProvider({ seed: 5, companiesPerSector: 4 });
  sim.generate();

  it('resolve on the simulated dataset with every role filled', () => {
    for (const def of CHAPTERS) {
      const r = resolveChapter(sim, def);
      expect(r.run.windowEnd).toBeGreaterThan(r.decisionDay);
      expect(r.decisionDay).toBeGreaterThan(r.run.windowStart);
      for (const spec of def.companies) expect(r.roles[spec.role]?.length).toBeGreaterThan(0);
      expect(new Set(r.run.companyIds).size).toBe(r.run.companyIds.length);
    }
  });

  it('builds a scripted decision with valid options', () => {
    const def = CHAPTERS.find((c) => c.id === 'ch3')!;
    const r = resolveChapter(sim, def);
    const view = new MarketView(sim, r.run);
    view.setDay(r.run.windowStart);
    let p: Portfolio = createPortfolio(def.startingCash);
    p = applyAction(p, { kind: 'buy_basket', companyIds: r.roles.energy, amount: p.cash * 0.95 }, priceAt(view), view.currentDay);
    view.setDay(r.decisionDay);
    const dp = buildChapterDecision(def, view, p, r.roles, r.run.disguisedNames);
    expect(dp.type).toBe('scripted');
    expect(dp.options.map((o) => o.id)).toEqual(['hold', 'diversify', 'cash']);
  });
});
