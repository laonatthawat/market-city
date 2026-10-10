import type { MarketView } from '../MarketView';
import { averageCost, totalValue } from '../portfolio';
import type { Portfolio } from '../portfolio';
import type { Day } from '../types';
import type { DecisionType } from './types';

export interface TriggerCandidate {
  type: DecisionType;
  /** Cooldown key, e.g. "holding_drop:AAPL". */
  key: string;
  priority: number;
  companyId?: string;
  params: Record<string, number>;
}

export interface EquitySample {
  day: Day;
  value: number;
  cash: number;
}

export interface DecisionTracker {
  count: number;
  lastDay: number;
  lastByKey: Record<string, number>;
}

export const newTracker = (): DecisionTracker => ({ count: 0, lastDay: -Infinity, lastByKey: {} });

/** Per-key cooldowns (trading days) so the same situation doesn't nag repeatedly. */
export const COOLDOWN: Record<DecisionType, number> = {
  holding_drop: 126,
  holding_gain: 252,
  concentration: 126,
  earnings_gap: 63,
  index_streak: 63,
  index_correction: 126,
  new_high: 189,
  new_low: 126,
  cash_drag: 126,
  event: 0,
  scripted: 0,
};

/** Trading days to fast-forward after a decision of this type. */
export const FORWARD_DAYS: Record<DecisionType, number> = {
  holding_drop: 42,
  holding_gain: 42,
  concentration: 42,
  earnings_gap: 42,
  index_streak: 42,
  index_correction: 63,
  new_high: 42,
  new_low: 42,
  cash_drag: 63,
  event: 63,
  scripted: 63,
};

export const THRESHOLDS = {
  drop: -0.2,
  gain: 0.5,
  concentration: 0.3,
  earningsGap: 0.08,
  streakDays: 5,
  correction: 0.1,
  cashShare: 0.4,
  cashDays: 63,
  risingMarket: 0.03,
};

/** All situations that would justify a Decision Point today (unfiltered). */
export function detectTriggers(view: MarketView, portfolio: Portfolio, equity: readonly EquitySample[]): TriggerCandidate[] {
  const day = view.currentDay;
  const out: TriggerCandidate[] = [];
  const priceOf = (id: string) => view.close(id);
  const total = totalValue(portfolio, priceOf);

  for (const c of view.companies) {
    const held = portfolio.holdings[c.id];
    // Closes up to today (the view never returns future data); companies without a bar today are skipped.
    if (!view.bar(c.id)) continue;
    const closes = view.closes(c.id, day - 253);
    if (closes.length < 2) continue;
    const px = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const dayRet = px / prev - 1;

    if (c.earningsDays.includes(day) && Math.abs(dayRet) >= THRESHOLDS.earningsGap) {
      out.push({ type: 'earnings_gap', key: `earnings_gap:${c.id}`, priority: held ? 95 : 40, companyId: c.id, params: { gap: dayRet, held: held ? 1 : 0 } });
    }
    if (!held) continue;

    const avg = averageCost(held);
    const ret = px / avg - 1;
    const weight = total > 0 ? (held.shares * px) / total : 0;
    const base = { ret, avg, px, weight, value: held.shares * px };
    if (ret <= THRESHOLDS.drop) out.push({ type: 'holding_drop', key: `holding_drop:${c.id}`, priority: 100, companyId: c.id, params: base });
    if (ret >= THRESHOLDS.gain) out.push({ type: 'holding_gain', key: `holding_gain:${c.id}`, priority: 60, companyId: c.id, params: base });
    if (weight > THRESHOLDS.concentration) out.push({ type: 'concentration', key: `concentration:${c.id}`, priority: 80, companyId: c.id, params: base });

    if (closes.length - 1 >= 200) {
      let hi = -Infinity;
      let lo = Infinity;
      for (let i = 0; i < closes.length - 1; i++) {
        if (closes[i] > hi) hi = closes[i];
        if (closes[i] < lo) lo = closes[i];
      }
      if (px > hi) out.push({ type: 'new_high', key: `new_high:${c.id}`, priority: 50, companyId: c.id, params: base });
      else if (px < lo) out.push({ type: 'new_low', key: `new_low:${c.id}`, priority: 70, companyId: c.id, params: base });
    }
  }

  const idx = Array.from(view.indexCloses(day - 130));
  if (idx.length > THRESHOLDS.streakDays + 1) {
    let streak = 0;
    for (let i = idx.length - 1; i > 0 && idx[i] < idx[i - 1]; i--) streak++;
    if (streak === THRESHOLDS.streakDays) {
      const from = idx[idx.length - 1 - streak];
      out.push({ type: 'index_streak', key: 'index_streak', priority: 75, params: { days: streak, drop: idx[idx.length - 1] / from - 1 } });
    }
    const hi = Math.max(...idx);
    const now = idx[idx.length - 1];
    const before = idx[idx.length - 2];
    const line = hi * (1 - THRESHOLDS.correction);
    if (now <= line && before > line) {
      out.push({ type: 'index_correction', key: 'index_correction', priority: 85, params: { drop: now / hi - 1 } });
    }
  }

  const n = THRESHOLDS.cashDays;
  if (equity.length >= n) {
    const recent = equity.slice(-n);
    const allCash = recent.every((e) => e.value > 0 && e.cash / e.value > THRESHOLDS.cashShare);
    const i0 = view.indexBar(recent[0].day)?.close;
    const i1 = view.indexBar()?.close;
    if (allCash && i0 && i1 && i1 / i0 - 1 > THRESHOLDS.risingMarket) {
      out.push({ type: 'cash_drag', key: 'cash_drag', priority: 30, params: { cashShare: portfolio.cash / Math.max(total, 1), indexRet: i1 / i0 - 1, days: n } });
    }
  }
  return out;
}

export interface DecisionLimits {
  /** Minimum trading days between any two decision points (~1 month). */
  minGap: number;
  maxPerRun: number;
  windowStart: Day;
  windowEnd: Day;
}

export function maxDecisionsFor(years: number): number {
  return Math.min(12, Math.round(4 + 2 * years));
}

/** Choose at most one candidate respecting frequency limits and cooldowns. */
export function pickTrigger(
  candidates: readonly TriggerCandidate[],
  tracker: DecisionTracker,
  day: Day,
  limits: DecisionLimits,
): TriggerCandidate | null {
  if (tracker.count >= limits.maxPerRun) return null;
  if (day - tracker.lastDay < limits.minGap) return null;
  if (day < limits.windowStart + 10 || day > limits.windowEnd - 10) return null;
  let best: TriggerCandidate | null = null;
  for (const c of candidates) {
    const last = tracker.lastByKey[c.key];
    if (last !== undefined && day - last < COOLDOWN[c.type]) continue;
    if (!best || c.priority > best.priority) best = c;
  }
  return best;
}

export function recordTrigger(tracker: DecisionTracker, key: string, day: Day): DecisionTracker {
  return { count: tracker.count + 1, lastDay: day, lastByKey: { ...tracker.lastByKey, [key]: day } };
}
