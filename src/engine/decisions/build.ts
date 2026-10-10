import { DECISION_TEXT, OPTION_LABELS, OUTCOME_DISCLAIMER } from '../../data/decisionText';
import type { OutcomeCtx, TextCtx } from '../../data/decisionText';
import { baht, pct, price, ratio } from '../../lib/format';
import { healthScore } from '../health';
import type { MarketView } from '../MarketView';
import { averageCost, totalValue } from '../portfolio';
import type { Portfolio } from '../portfolio';
import type { Day } from '../types';
import { applyAction, isActionable, scheduledParts } from './actions';
import { FORWARD_DAYS } from './triggers';
import type { TriggerCandidate } from './triggers';
import type { DecisionFact, DecisionOption, DecisionOutcome, DecisionPoint, OptionOutcome } from './types';

function textCtx(view: MarketView, c: { companyId?: string; params: Record<string, number> }, names: Record<string, string>): TextCtx {
  const name = c.companyId ? names[c.companyId] ?? c.companyId : 'ดัชนีเมือง';
  let health: TextCtx['health'];
  if (c.companyId) {
    const f = view.fundamentals(c.companyId);
    const co = view.company(c.companyId);
    if (f && co) {
      const h = healthScore(f, co.sector);
      health = { score: h.score, label: h.label };
    }
  }
  return { name, p: c.params, health };
}

/** Turns a trigger into a full Decision Point with options valid for the current portfolio. */
export function buildDecision(
  c: TriggerCandidate,
  view: MarketView,
  portfolio: Portfolio,
  names: Record<string, string>,
): DecisionPoint {
  if (c.type === 'scripted' || c.type === 'event') throw new Error(`${c.type} decisions have their own builders`);
  const day = view.currentDay;
  const priceOf = (id: string) => view.close(id);
  const total = totalValue(portfolio, priceOf);
  const tpl = DECISION_TEXT[c.type];
  const ctx = textCtx(view, c, names);
  const id = c.companyId;
  const holding = id ? portfolio.holdings[id] : undefined;
  const allIds = view.companies.map((co) => co.id);
  const heldIds = Object.keys(portfolio.holdings);
  const options: DecisionOption[] = [];
  const add = (o: DecisionOption) => {
    if (isActionable(portfolio, o.action, priceOf)) options.push(o);
  };

  if (id && holding) {
    const posValue = holding.shares * (priceOf(id) ?? 0);
    if (c.type === 'concentration') {
      add({ id: 'rebalance', label: `${OPTION_LABELS.rebalance} ให้เหลือ 20%`, detail: 'ขายส่วนที่เกิน 20% ของพอร์ตออก', style: 'rebalance', action: { kind: 'rebalance', companyId: id, targetWeight: 0.2 } });
    } else {
      const amount = Math.min(portfolio.cash, posValue * 0.5);
      add({ id: 'buy_more', label: OPTION_LABELS.buyMore, detail: `ใช้เงินราว ${baht(amount)} (เพิ่มอีกครึ่งหนึ่งของที่ถือ)`, style: 'buy', action: { kind: 'buy_more', companyId: id, amount } });
    }
    add({ id: 'hold', label: OPTION_LABELS.hold, detail: 'ปล่อยพอร์ตไว้ตามเดิม', style: 'hold', action: { kind: 'hold' } });
    add({ id: 'trim', label: OPTION_LABELS.trim, detail: `ขาย ${Math.floor(holding.shares / 2).toLocaleString('th-TH')} หุ้น เก็บเงินสด`, style: 'sell', action: { kind: 'trim', companyId: id, fraction: 0.5 } });
    add({ id: 'sell_all', label: OPTION_LABELS.sellAll, detail: `ขายทั้ง ${holding.shares.toLocaleString('th-TH')} หุ้น`, style: 'sell', action: { kind: 'sell_all', companyId: id } });
  } else if (id) {
    // Not held (earnings gap on another company).
    const amount = Math.min(portfolio.cash, total * 0.1);
    add({ id: 'buy', label: `${OPTION_LABELS.buyNew} 10%`, detail: `ซื้อด้วยเงินราว ${baht(amount)}`, style: 'buy', action: { kind: 'buy_basket', companyIds: [id], amount } });
    add({ id: 'buy_small', label: `${OPTION_LABELS.buyNew} 3% (ลองเล็ก ๆ)`, detail: `ซื้อด้วยเงินราว ${baht(amount * 0.3)}`, style: 'buy', action: { kind: 'buy_basket', companyIds: [id], amount: amount * 0.3 } });
    add({ id: 'hold', label: OPTION_LABELS.wait, detail: 'ไม่ทำอะไร', style: 'hold', action: { kind: 'hold' } });
  } else if (c.type === 'cash_drag') {
    add({ id: 'invest50', label: OPTION_LABELS.invest50, detail: `ใช้ ${baht(portfolio.cash * 0.5)} กระจายซื้อทุกบริษัทในเมืองเท่า ๆ กัน`, style: 'buy', action: { kind: 'buy_basket', companyIds: allIds, amount: portfolio.cash * 0.5 } });
    add({ id: 'invest25', label: OPTION_LABELS.invest25, detail: `ใช้ ${baht(portfolio.cash * 0.25)} กระจายซื้อทุกบริษัท`, style: 'buy', action: { kind: 'buy_basket', companyIds: allIds, amount: portfolio.cash * 0.25 } });
    add({ id: 'hold', label: OPTION_LABELS.keepWaiting, detail: 'ถือเงินสดต่อ', style: 'hold', action: { kind: 'hold' } });
  } else {
    // Index-wide drop.
    const basket = heldIds.length ? heldIds : allIds;
    const amount = portfolio.cash * 0.25;
    add({ id: 'buy_dip', label: OPTION_LABELS.buyDip, detail: `ใช้เงินสด 25% (${baht(amount)}) ซื้อ${heldIds.length ? 'หุ้นที่ถือ' : 'ทุกบริษัท'}เพิ่มเท่า ๆ กัน`, style: 'buy', action: { kind: 'buy_basket', companyIds: basket, amount } });
    add({ id: 'hold', label: OPTION_LABELS.hold, detail: 'ปล่อยพอร์ตไว้ตามเดิม', style: 'hold', action: { kind: 'hold' } });
    add({ id: 'reduce', label: OPTION_LABELS.reduceRisk, detail: 'ขายครึ่งหนึ่งของหุ้นทุกตัว', style: 'sell', action: { kind: 'sell_fraction_all', fraction: 0.5 } });
    add({ id: 'all_cash', label: OPTION_LABELS.allCash, detail: 'ขายหุ้นทั้งหมด', style: 'sell', action: { kind: 'sell_fraction_all', fraction: 1 } });
  }

  const facts: DecisionFact[] = [];
  if (id) {
    const snap = view.snapshot(id);
    const f = view.fundamentals(id);
    if (snap) facts.push({ label: 'ราคาวันนี้', value: price(snap.price) }, { label: 'เปลี่ยนแปลง 20 วัน', value: pct(snap.momentum20, 1), tone: snap.momentum20 });
    if (holding) {
      const ret = (priceOf(id) ?? 0) / averageCost(holding) - 1;
      facts.push(
        { label: 'ต้นทุนเฉลี่ย', value: price(averageCost(holding)) },
        { label: 'กำไร/ขาดทุน', value: pct(ret, 1), tone: ret },
        { label: 'สัดส่วนในพอร์ต', value: pct(c.params.weight ?? 0, 1, false) },
      );
    }
    if (f) facts.push({ label: 'P/E', value: f.pe == null ? 'ขาดทุน' : ratio(f.pe) });
    if (ctx.health) facts.push({ label: 'คะแนนสุขภาพ', value: `${ctx.health.score} (${ctx.health.label})` });
  } else {
    const idx = view.indexHistory(day - 126).map((b) => b.close);
    facts.push(
      { label: 'ดัชนีจากจุดสูงสุด 6 เดือน', value: pct(idx[idx.length - 1] / Math.max(...idx) - 1, 1), tone: -1 },
      { label: 'เงินสดในพอร์ต', value: `${baht(portfolio.cash)} (${pct(portfolio.cash / Math.max(total, 1), 0, false)})` },
      { label: 'มูลค่าพอร์ต', value: baht(total) },
    );
  }

  return {
    id: `${c.key}@${day}`,
    type: c.type,
    key: c.key,
    day,
    companyId: id,
    title: tpl.title(ctx),
    prompt: tpl.prompt(ctx),
    facts,
    options,
    forwardDays: FORWARD_DAYS[c.type],
    params: c.params,
  };
}

/** Portfolio after each option, all computed from the same starting point. */
export function optionPortfolios(dp: DecisionPoint, portfolio: Portfolio, view: MarketView): Record<string, Portfolio> {
  const priceOf = (id: string) => view.close(id);
  const out: Record<string, Portfolio> = {};
  for (const o of dp.options) out[o.id] = applyAction(portfolio, o.action, priceOf, dp.day);
  return out;
}

/** Values every option's portfolio over [startDay, current day] — only past data by then. */
export function computeOutcomePaths(
  dp: DecisionPoint,
  portfolios: Record<string, Portfolio>,
  view: MarketView,
  startDay: Day,
): { days: Day[]; outcomes: OptionOutcome[]; companyReturn: number | null; indexReturn: number } {
  const days: Day[] = [];
  for (let d = startDay; d <= view.currentDay; d++) days.push(d);
  const outcomes = dp.options.map((o) => {
    let p = portfolios[o.id];
    const parts = scheduledParts(o.action, startDay);
    const values = days.map((d) => {
      // Apply scheduled instalments (e.g. DCA) on their day, exactly as the game does.
      for (const part of parts) if (part.day === d) p = applyAction(p, part.action, (id) => view.close(id, d), d);
      return totalValue(p, (id) => view.close(id, d));
    });
    return { optionId: o.id, label: o.label, style: o.style, values, ret: values[values.length - 1] / values[0] - 1 };
  });
  const c0 = dp.companyId ? view.close(dp.companyId, startDay) : null;
  const c1 = dp.companyId ? view.close(dp.companyId) : null;
  const i0 = view.indexBar(startDay)?.close ?? 1;
  const i1 = view.indexBar()?.close ?? i0;
  return { days, outcomes, companyReturn: c0 && c1 ? c1 / c0 - 1 : null, indexReturn: i1 / i0 - 1 };
}

export function summarize(outcomes: OptionOutcome[], chosenId: string) {
  const chosen = outcomes.find((o) => o.optionId === chosenId) ?? outcomes[0];
  const best = outcomes.reduce((a, b) => (b.ret > a.ret ? b : a), outcomes[0]);
  const hold = outcomes.find((o) => o.style === 'hold') ?? null;
  return { chosen, best, hold };
}

/** Generic outcome sentence shared by all decision types. */
export function outcomeHeadline(outcomes: OptionOutcome[], chosenId: string, weeks: number): string {
  const { chosen, best } = summarize(outcomes, chosenId);
  const same = best.optionId === chosen.optionId;
  return same
    ? `ใน ${weeks} สัปดาห์ต่อมา ทางเลือกของคุณ "${chosen.label}" ให้ผลดีที่สุดในรอบนี้ (${pct(chosen.ret, 1)})`
    : `ใน ${weeks} สัปดาห์ต่อมา พอร์ตตามทางเลือกของคุณ "${chosen.label}" เปลี่ยนไป ${pct(chosen.ret, 1)} ส่วนทางเลือกที่ได้ผลดีที่สุดในรอบนี้คือ "${best.label}" (${pct(best.ret, 1)})`;
}

export function buildOutcome(
  dp: DecisionPoint,
  chosenId: string,
  portfolios: Record<string, Portfolio>,
  view: MarketView,
  names: Record<string, string>,
): DecisionOutcome {
  const core = computeOutcomePaths(dp, portfolios, view, dp.day);
  const weeks = Math.max(1, Math.round((core.days.length - 1) / 5));
  const { chosen, best, hold } = summarize(core.outcomes, chosenId);
  let lesson: string[] = [outcomeHeadline(core.outcomes, chosenId, weeks)];
  let considerations: string[] = [];
  if (dp.type !== 'scripted' && dp.type !== 'event') {
    const tpl = DECISION_TEXT[dp.type];
    const ctx = textCtx(view, { companyId: dp.companyId, params: dp.params }, names);
    const octx: OutcomeCtx = {
      ...ctx,
      weeks,
      chosen: { label: chosen.label, ret: chosen.ret },
      best: { label: best.label, ret: best.ret },
      hold: hold ? { ret: hold.ret } : null,
      companyRet: core.companyReturn,
      indexRet: core.indexReturn,
    };
    // Use the health/fundamentals as they were at decision time for considerations.
    lesson = lesson.concat(tpl.lesson(octx).filter(Boolean));
    considerations = tpl.considerations(textCtxAt(view, dp, names));
  }
  lesson.push(OUTCOME_DISCLAIMER);
  return { decisionId: dp.id, chosenId, startDay: dp.day, endDay: view.currentDay, ...core, lesson, considerations };
}

function textCtxAt(view: MarketView, dp: DecisionPoint, names: Record<string, string>): TextCtx {
  const ctx = textCtx(view, { companyId: dp.companyId, params: dp.params }, names);
  if (dp.companyId) {
    const f = view.fundamentals(dp.companyId, dp.day);
    const co = view.company(dp.companyId);
    if (f && co) {
      const h = healthScore(f, co.sector);
      ctx.health = { score: h.score, label: h.label };
    }
  }
  return ctx;
}
