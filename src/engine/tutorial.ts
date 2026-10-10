import { groupReturn } from '../data/tutorials';
import type { ChapterDecisionCtx, ChapterDef, ScriptedAction } from '../data/tutorials';
import { OUTCOME_DISCLAIMER } from '../data/decisionText';
import { dayOnOrAfter, TRADING_DAYS_PER_YEAR } from './calendar';
import { isActionable } from './decisions/actions';
import { computeOutcomePaths, outcomeHeadline } from './decisions/build';
import type { DecisionOutcome, DecisionPoint, OptionAction } from './decisions/types';
import { disguiseNames } from './disguise';
import type { MarketView } from './MarketView';
import { totalValue } from './portfolio';
import type { Portfolio } from './portfolio';
import type { MarketDataProvider } from './provider/MarketDataProvider';
import { DEFAULT_LOOKBACK } from './sampler';
import type { Company, Run } from './types';

export interface ResolvedChapter {
  run: Run;
  roles: Record<string, string[]>;
  decisionDay: number;
}

/**
 * Maps a chapter onto the active dataset: real tickers when available,
 * otherwise deterministic same-sector substitutes (simulated fallback).
 */
export function resolveChapter(provider: MarketDataProvider, def: ChapterDef): ResolvedChapter {
  const cal = provider.getCalendar();
  const windowStart = Math.max(DEFAULT_LOOKBACK, dayOnOrAfter(cal, def.start));
  const decisionDay = Math.max(windowStart + 20, dayOnOrAfter(cal, def.decisionDate));
  const windowEnd = Math.min(cal.length - 1, decisionDay + def.forwardDays);
  const covers = (c: Company) => c.firstDay <= windowStart && c.lastDay >= windowEnd;
  const used = new Set<string>();
  const roles: Record<string, string[]> = {};
  const all = [...provider.getCompanies()].sort((a, b) => a.id.localeCompare(b.id));
  for (const spec of def.companies) {
    let c = provider.getCompany(spec.ticker);
    if (!c || !covers(c) || used.has(c.id)) c = all.find((x) => x.sector === spec.sector && covers(x) && !used.has(x.id));
    if (!c) continue;
    used.add(c.id);
    (roles[spec.role] ??= []).push(c.id);
  }
  const ids = [...used];
  const companies = ids.map((id) => provider.getCompany(id)!);
  const seed = def.number * 1009;
  return {
    decisionDay,
    roles,
    run: {
      id: `tutorial-${def.id}`,
      seed,
      windowStart,
      windowEnd,
      historyStart: Math.max(0, windowStart - DEFAULT_LOOKBACK),
      companyIds: ids,
      disguisedNames: disguiseNames(companies, seed),
      startingCash: def.startingCash,
      years: (windowEnd - windowStart) / TRADING_DAYS_PER_YEAR,
      modifiers: {},
    },
  };
}

export function chapterCtx(view: MarketView, portfolio: Portfolio, roles: Record<string, string[]>, names: Record<string, string>): ChapterDecisionCtx {
  const priceOf = (id: string) => view.close(id);
  const total = totalValue(portfolio, priceOf);
  const ids = (role: string) => roles[role] ?? [];
  return {
    name: (role) => names[ids(role)[0]] ?? '–',
    names: (role) => ids(role).map((id) => names[id]),
    change: (role, days) =>
      groupReturn(
        ids(role).map((id) => {
          const a = view.close(id, view.currentDay - days);
          const b = view.close(id);
          return a && b ? b / a - 1 : 0;
        }),
      ),
    weight: (role) => {
      const v = ids(role).reduce((s, id) => s + (portfolio.holdings[id]?.shares ?? 0) * (priceOf(id) ?? 0), 0);
      return total > 0 ? v / total : 0;
    },
    avgPe: (role) => {
      const pes = ids(role)
        .map((id) => view.fundamentals(id)?.pe)
        .filter((x): x is number => x != null);
      return pes.length ? groupReturn(pes) : null;
    },
    cash: portfolio.cash,
    total,
  };
}

function toAction(a: ScriptedAction, roles: Record<string, string[]>, portfolio: Portfolio): OptionAction {
  const ids = (r: string) => roles[r] ?? [];
  switch (a.kind) {
    case 'hold':
      return { kind: 'hold' };
    case 'buy_role':
      return { kind: 'buy_basket', companyIds: a.roles.flatMap(ids), amount: portfolio.cash * a.cashFraction };
    case 'trim_role':
      return { kind: 'rotate', sellIds: ids(a.role), sellFraction: a.fraction, buyIds: [] };
    case 'dca_role':
      return { kind: 'dca_basket', companyIds: a.roles.flatMap(ids), total: portfolio.cash * a.cashFraction, parts: a.parts, everyDays: a.everyDays };
    case 'mix':
      return { kind: 'multi', actions: a.parts.map((pt) => ({ kind: 'buy_basket' as const, companyIds: pt.roles.flatMap(ids), amount: portfolio.cash * pt.cashFraction })) };
    case 'rotate_role':
      return { kind: 'rotate', sellIds: ids(a.sellRole), sellFraction: a.sellFraction, buyIds: a.buyRoles.flatMap(ids) };
  }
}

export function buildChapterDecision(
  def: ChapterDef,
  view: MarketView,
  portfolio: Portfolio,
  roles: Record<string, string[]>,
  names: Record<string, string>,
): DecisionPoint {
  const ctx = chapterCtx(view, portfolio, roles, names);
  const priceOf = (id: string) => view.close(id);
  const options = def.decision.options
    .map((o) => ({ id: o.id, label: o.label, detail: o.detail(ctx), style: o.style, action: toAction(o.action, roles, portfolio) }))
    // Keep "hold" plus every option that actually changes something.
    .filter((o) => isActionable(portfolio, o.action, priceOf));
  const focus = roles.focus?.[0];
  return {
    id: `chapter:${def.id}@${view.currentDay}`,
    type: 'scripted',
    key: `chapter:${def.id}`,
    day: view.currentDay,
    companyId: focus,
    title: def.decision.title(ctx),
    prompt: def.decision.prompt(ctx),
    facts: [
      { label: 'มูลค่าพอร์ต', value: Math.round(ctx.total).toLocaleString('th-TH') + ' ฿' },
      { label: 'เงินสด', value: Math.round(ctx.cash).toLocaleString('th-TH') + ' ฿' },
    ],
    options,
    forwardDays: def.forwardDays,
    params: {},
  };
}

export function buildChapterOutcome(
  def: ChapterDef,
  dp: DecisionPoint,
  chosenId: string,
  portfolios: Record<string, Portfolio>,
  view: MarketView,
  roles: Record<string, string[]>,
  names: Record<string, string>,
  portfolioAtDecision: Portfolio,
): DecisionOutcome {
  const core = computeOutcomePaths(dp, portfolios, view, dp.day);
  const weeks = Math.max(1, Math.round((core.days.length - 1) / 5));
  const ctx = chapterCtx(view, portfolioAtDecision, roles, names);
  const roleReturn = (role: string) =>
    groupReturn(
      (roles[role] ?? []).map((id) => {
        const a = view.close(id, dp.day);
        const b = view.close(id);
        return a && b ? b / a - 1 : 0;
      }),
    );
  const lesson = [
    outcomeHeadline(core.outcomes, chosenId, weeks),
    ...def.decision.lesson({ ...ctx, roleReturn, indexReturn: core.indexReturn, weeks }),
    OUTCOME_DISCLAIMER,
  ];
  return { decisionId: dp.id, chosenId, startDay: dp.day, endDay: view.currentDay, ...core, lesson, considerations: def.decision.considerations };
}
