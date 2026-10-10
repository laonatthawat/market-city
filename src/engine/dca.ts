import { buy, maxAffordableShares } from './portfolio';
import type { Portfolio } from './portfolio';
import type { Company, Day, SectorId } from './types';

/** Auto-Invest Plan: target % per company id or per sector ("sector:tech"). Values are percents. */
export type InvestPlan = Record<string, number>;

/** First trading day of a new calendar month. */
export function isPayday(calendar: readonly string[], day: Day): boolean {
  if (day <= 0) return false;
  return calendar[day].slice(0, 7) !== calendar[day - 1].slice(0, 7);
}

export function planTotal(plan: InvestPlan): number {
  return Object.values(plan).reduce((a, b) => a + Math.max(0, b), 0);
}

/** Expand sector targets into equal per-company targets. Result sums to planTotal(plan). */
export function expandPlan(plan: InvestPlan, companies: readonly Company[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, pct] of Object.entries(plan)) {
    if (pct <= 0) continue;
    if (key.startsWith('sector:')) {
      const sector = key.slice(7) as SectorId;
      const ids = companies.filter((c) => c.sector === sector).map((c) => c.id);
      for (const id of ids) out[id] = (out[id] ?? 0) + pct / ids.length;
    } else {
      out[key] = (out[key] ?? 0) + pct;
    }
  }
  return out;
}

/** Buys according to the plan with `amount` THB (fractional shares, like DCA at most brokers). */
export function executePlan(
  p: Portfolio,
  plan: InvestPlan,
  companies: readonly Company[],
  amount: number,
  priceOf: (id: string) => number | null,
  day: Day,
): Portfolio {
  const targets = expandPlan(plan, companies);
  let out = p;
  for (const [id, pct] of Object.entries(targets)) {
    const px = priceOf(id);
    if (!px) continue;
    const shares = maxAffordableShares(Math.min(out.cash, (amount * pct) / 100), px, true);
    if (shares <= 0) continue;
    const r = buy(out, { companyId: id, shares, price: px, day });
    if (r.ok) out = r.portfolio;
  }
  return out;
}

/** Equal-weight plan across current holdings (or all companies if none). */
export function equalPlan(ids: readonly string[]): InvestPlan {
  const plan: InvestPlan = {};
  for (const id of ids) plan[id] = 100 / ids.length;
  return plan;
}

export interface CashFlow {
  /** Years since the first flow. */
  t: number;
  /** Investor's perspective: contributions negative, final value positive. */
  amount: number;
}

/** Money-weighted annual return (XIRR) via bisection. Returns null if it can't bracket a root. */
export function xirr(flows: readonly CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, f.t), 0);
  let lo = -0.99;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Time-weighted return: chains daily returns with contributions removed.
 * `contrib[i]` is money added on day i (before that day's valuation).
 */
export function timeWeightedReturn(values: readonly number[], contrib: readonly number[]): number {
  let g = 1;
  for (let i = 1; i < values.length; i++) {
    const base = values[i - 1];
    if (base > 0) g *= (values[i] - (contrib[i] ?? 0)) / base;
  }
  return g - 1;
}
