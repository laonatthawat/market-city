import { describe, expect, it } from 'vitest';
import { newAchievements } from '../../data/achievements';
import { CHAPTERS } from '../../data/tutorials';
import { meets } from '../../data/unlocks';
import { weekdayCalendar } from '../calendar';
import { challengeFailure, modifiersKey, ruleViolation } from '../challenges';
import { executePlan, expandPlan, isPayday, timeWeightedReturn, xirr } from '../dca';
import { applyAction, scheduledParts } from '../decisions/actions';
import { computeOutcomePaths } from '../decisions/build';
import type { DecisionPoint } from '../decisions/types';
import { resolveEvents, windowStartForEvent } from '../events';
import { MarketView } from '../MarketView';
import { buy, createPortfolio } from '../portfolio';
import { SimulatedProvider } from '../provider/SimulatedProvider';
import { sampleRun } from '../sampler';
import { buildReport, gradeOf, sharpeOf } from '../scoring';
import type { ScorePoint } from '../scoring';
import { buildChapterDecision, resolveChapter } from '../tutorial';
import type { Company } from '../types';
import { readWeather } from '../weather';

const sim = new SimulatedProvider({ seed: 11, companiesPerSector: 4 });
sim.generate();

describe('DCA helpers', () => {
  it('detects the first trading day of each month', () => {
    const cal = weekdayCalendar('2020-01-01', '2020-03-31');
    const paydays = cal.filter((_, i) => isPayday(cal, i));
    expect(paydays).toEqual(['2020-02-03', '2020-03-02']);
  });

  it('expands sector targets and executes a plan without overspending', () => {
    const companies = sim.getCompanies();
    const techIds = companies.filter((c) => c.sector === 'tech').map((c) => c.id);
    const t = expandPlan({ 'sector:tech': 60, [companies[companies.length - 1].id]: 20 }, companies);
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBeCloseTo(80);
    expect(techIds.every((id) => t[id] > 0)).toBe(true);
    const p = executePlan(createPortfolio(50_000), { 'sector:tech': 100 }, companies, 50_000, (id) => sim.getPrice(id, 500)!.close, 500);
    expect(p.cash).toBeGreaterThanOrEqual(0);
    expect(Object.keys(p.holdings).length).toBeGreaterThan(0);
  });

  it('XIRR matches a simple compound case and TWR ignores contributions', () => {
    // Invest 100, get 121 after 2 years → 10%/yr.
    expect(xirr([{ t: 0, amount: -100 }, { t: 2, amount: 121 }])!).toBeCloseTo(0.1, 4);
    // Value doubles only because money was added: TWR should be ~0.
    expect(timeWeightedReturn([100, 200], [0, 100])).toBeCloseTo(0, 6);
  });
});

describe('challenges', () => {
  const companies = sim.getCompanies().slice(0, 8) as Company[];
  const priceOf = (id: string) => sim.getPrice(id, 400)!.close;
  const base = { day: 400, windowStart: 300, companies, priceOf, payday: false };

  it('blocks selling during the no-sell period and buying outside payday', () => {
    let p = createPortfolio(1e6);
    const r = buy(p, { companyId: companies[0].id, shares: 10, price: priceOf(companies[0].id), day: 400 });
    if (!r.ok) throw new Error();
    p = r.portfolio;
    const sold = applyAction(p, { kind: 'sell_all', companyId: companies[0].id }, priceOf, 400);
    expect(ruleViolation(p, sold, { ...base, mods: { noSellMonths: 6 } })).toMatch(/ห้ามขาย/);
    expect(ruleViolation(p, sold, { ...base, day: 300 + 6 * 21 + 1, mods: { noSellMonths: 6 } })).toBeNull();
    const bought = applyAction(p, { kind: 'buy_more', companyId: companies[1].id, amount: 10_000 }, priceOf, 400);
    expect(ruleViolation(p, bought, { ...base, mods: { dcaOnly: true } })).toMatch(/เงินเดือน/);
    expect(ruleViolation(p, bought, { ...base, payday: true, mods: { dcaOnly: true } })).toBeNull();
  });

  it('enforces a sector cap and a drawdown limit', () => {
    const p = createPortfolio(100_000);
    const allIn = applyAction(p, { kind: 'buy_more', companyId: companies[0].id, amount: 90_000 }, priceOf, 400);
    expect(ruleViolation(p, allIn, { ...base, mods: { sectorCap: 0.3 } })).toMatch(/เซกเตอร์/);
    expect(challengeFailure({ maxDrawdownLimit: 0.15 }, [100, 120, 101])).toMatch(/15%/);
    expect(challengeFailure({ maxDrawdownLimit: 0.15 }, [100, 120, 110])).toBeNull();
    expect(modifiersKey({ sectorCap: 0.3, noSellMonths: 6 })).toBe('cap30+nosell6');
  });
});

describe('scoring', () => {
  it('grades and Sharpe behave sensibly', () => {
    expect(gradeOf(95)).toBe('A+');
    expect(gradeOf(10)).toBe('F');
    const up = Array.from({ length: 100 }, (_, i) => 100 * 1.001 ** i * (1 + (i % 2 ? 0.002 : -0.002)));
    expect(sharpeOf(up)).toBeGreaterThan(1);
  });

  it('builds a report with tips for a simple run', () => {
    const run = sampleRun({ seed: 3, calendarLength: sim.getCalendar().length, companies: sim.getCompanies(), years: 1, startingCash: 1e6 });
    const view = new MarketView(sim, run);
    view.setDay(run.windowEnd);
    const points: ScorePoint[] = [];
    for (let d = run.windowStart; d <= run.windowEnd; d++) {
      const idx = sim.getIndexPrice(d)!.close / sim.getIndexPrice(run.windowStart)!.close;
      points.push({ day: d, value: 1e6 * idx, index: 1e6 * idx, cash: 0, div: 0.8, contrib: 0 });
    }
    const r = buildReport(points, [], view, 1e6);
    expect(Math.abs(r.excess)).toBeLessThan(1e-9);
    expect(r.tips.length).toBeGreaterThan(0);
    expect(['A+', 'A', 'B', 'C', 'D', 'F']).toContain(r.grades.overall);
  });
});

describe('events and weather', () => {
  it('resolves catalog events on a real-dates calendar and biases the sampler', () => {
    const cal = weekdayCalendar('2014-01-01', '2025-12-31');
    const events = resolveEvents(cal);
    expect(events.map((e) => e.tag.id)).toContain('covid_2020');
    const covid = events.find((e) => e.tag.id === 'covid_2020')!;
    const start = windowStartForEvent(covid, 252, 252, cal.length - 252, () => 0.5)!;
    expect(covid.startDay - start).toBeGreaterThanOrEqual(25);
    expect(covid.startDay - start).toBeLessThanOrEqual(177);
    // With eventChance=1, every sample is tagged.
    const companies = sim.getCompanies().map((c) => ({ ...c, lastDay: cal.length - 1 }));
    const run = sampleRun({ seed: 5, calendarLength: cal.length, companies, years: 1, startingCash: 1, events: events.map((e) => ({ id: e.tag.id, startDay: e.startDay })), eventChance: 1 });
    expect(run.taggedEventId).toBeDefined();
  });

  it('classifies weather from index closes', () => {
    const flatUp = Array.from({ length: 260 }, (_, i) => 100 + i * 0.1);
    expect(readWeather(flatUp).weather).toBe('sunny');
    const crash = [...Array.from({ length: 240 }, () => 100), ...Array.from({ length: 20 }, (_, i) => 100 - i * 1.5)];
    expect(['storm', 'rain']).toContain(readWeather(crash).weather);
    const bubble = Array.from({ length: 260 }, (_, i) => 100 * 1.0025 ** i);
    expect(readWeather(bubble).weather).toBe('golden');
  });

  it('only generates synthetic shocks when asked (Sandbox)', () => {
    const quiet = new SimulatedProvider({ seed: 1, companiesPerSector: 2 });
    quiet.generate();
    const noisy = new SimulatedProvider({ seed: 1, companiesPerSector: 2, syntheticEventsPerYear: 3 });
    noisy.generate();
    const shocks = (p: SimulatedProvider) => p.getCalendar().flatMap((_, d) => p.getEvents(d)).filter((e) => e.kind === 'shock');
    expect(shocks(quiet)).toHaveLength(0);
    expect(shocks(noisy).length).toBeGreaterThan(10);
    expect(shocks(noisy).every((e) => !!e.headline)).toBe(true);
  });
});

describe('scheduled DCA option', () => {
  it('values later instalments on their day', () => {
    const def = CHAPTERS.find((c) => c.id === 'ch5')!;
    const r = resolveChapter(sim, def);
    const view = new MarketView(sim, r.run);
    view.setDay(r.decisionDay);
    const p = createPortfolio(def.startingCash);
    const dp = buildChapterDecision(def, view, p, r.roles, r.run.disguisedNames);
    const dcaOpt = dp.options.find((o) => o.id === 'dca')!;
    expect(scheduledParts(dcaOpt.action, dp.day)).toHaveLength(2);
    const portfolios = Object.fromEntries(dp.options.map((o) => [o.id, applyAction(p, o.action, (id) => view.close(id), dp.day)]));
    view.setDay(r.run.windowEnd);
    const out = computeOutcomePaths(dp as DecisionPoint, portfolios, view, dp.day);
    const dcaPath = out.outcomes.find((o) => o.optionId === 'dca')!;
    expect(dcaPath.values).toHaveLength(out.days.length);
  });
});

describe('progress unlocks and achievements', () => {
  it('unlocks civic buildings from chapters/achievements', () => {
    expect(meets({ chapter: 'ch2' }, { chapters: [], achievements: [], runsPlayed: 0 })).toBe(false);
    expect(meets({ chapter: 'ch2' }, { chapters: ['ch2'], achievements: [], runsPlayed: 0 })).toBe(true);
    const ctx = { kind: 'chapter' as const, challenge: false, challengeFailed: false, hadTaggedEvent: false, goldenDays: 0, skippedPaydays: 0, dividendYield: 0, chaptersDone: 3, runsPlayed: 0 };
    expect(newAchievements(ctx, [])).toEqual(['scholar_3']);
    expect(newAchievements(ctx, ['scholar_3'])).toEqual([]);
  });
});
