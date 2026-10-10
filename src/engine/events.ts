import { EVENTS } from '../data/events';
import type { EventDecisionDef, EventTag } from '../data/events';
import { OPTION_LABELS, OUTCOME_DISCLAIMER } from '../data/decisionText';
import { baht, pct } from '../lib/format';
import { dayOnOrAfter } from './calendar';
import { isActionable } from './decisions/actions';
import { computeOutcomePaths, outcomeHeadline } from './decisions/build';
import type { DecisionOption, DecisionOutcome, DecisionPoint } from './decisions/types';
import type { MarketView } from './MarketView';
import { totalValue } from './portfolio';
import type { Portfolio } from './portfolio';
import type { Day, Run } from './types';

export interface ResolvedEvent {
  tag: EventTag;
  startDay: Day;
  endDay: Day;
  decisions: { def: EventDecisionDef; day: Day }[];
}

/** Map the catalog onto a calendar (only meaningful for the real historical dataset). */
export function resolveEvents(calendar: readonly string[]): ResolvedEvent[] {
  if (calendar.length === 0) return [];
  const first = calendar[0];
  const last = calendar[calendar.length - 1];
  return EVENTS.filter((e) => e.start >= first && e.start <= last).map((tag) => ({
    tag,
    startDay: dayOnOrAfter(calendar, tag.start),
    endDay: Math.min(calendar.length - 1, dayOnOrAfter(calendar, tag.end)),
    decisions: tag.decisions.map((def) => ({ def, day: dayOnOrAfter(calendar, def.date) })),
  }));
}

/** Events overlapping the run window. */
export function eventsInRun(events: readonly ResolvedEvent[], run: Run): ResolvedEvent[] {
  return events.filter((e) => e.startDay <= run.windowEnd && e.endDay >= run.windowStart);
}

export function activeEventAt(events: readonly ResolvedEvent[], day: Day): ResolvedEvent | null {
  return events.find((e) => day >= e.startDay && day <= e.endDay) ?? null;
}

/**
 * Window start that places the event's start at a random offset inside the window
 * (10–70% in), or null if it can't fit.
 */
export function windowStartForEvent(
  ev: { startDay: Day },
  length: number,
  minStart: Day,
  maxStart: Day,
  rnd: () => number,
): Day | null {
  const lo = Math.max(minStart, ev.startDay - Math.floor(length * 0.7));
  const hi = Math.min(maxStart, ev.startDay - Math.floor(length * 0.1));
  if (hi < lo) return null;
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function sectorIds(view: MarketView, def: EventDecisionDef): string[] {
  return def.sector ? view.companies.filter((c) => c.sector === def.sector).map((c) => c.id) : [];
}

export function buildEventDecision(def: EventDecisionDef, tag: EventTag, view: MarketView, portfolio: Portfolio): DecisionPoint {
  const priceOf = (id: string) => view.close(id);
  const total = totalValue(portfolio, priceOf);
  const options: DecisionOption[] = [];
  const add = (o: DecisionOption) => {
    if (isActionable(portfolio, o.action, priceOf)) options.push(o);
  };
  const heldIds = Object.keys(portfolio.holdings);

  if (def.scope === 'sector') {
    const ids = sectorIds(view, def);
    const heldSector = ids.filter((id) => portfolio.holdings[id]);
    const amount = portfolio.cash * 0.2;
    add({ id: 'buy_sector', label: 'ซื้อหุ้นกลุ่มนี้เพิ่ม', detail: `ใช้เงินสด 20% (${baht(amount)}) กระจายซื้อ ${ids.length} บริษัทในกลุ่ม`, style: 'buy', action: { kind: 'buy_basket', companyIds: ids, amount } });
    add({ id: 'hold', label: heldSector.length ? OPTION_LABELS.hold : OPTION_LABELS.wait, detail: 'ปล่อยพอร์ตไว้ตามเดิม', style: 'hold', action: { kind: 'hold' } });
    add({ id: 'trim_sector', label: 'ลดหุ้นกลุ่มนี้ครึ่งหนึ่ง', detail: 'ขายครึ่งหนึ่งของหุ้นกลุ่มนี้ที่ถืออยู่', style: 'sell', action: { kind: 'rotate', sellIds: heldSector, sellFraction: 0.5, buyIds: [] } });
    add({ id: 'sell_sector', label: 'ขายหุ้นกลุ่มนี้ทั้งหมด', detail: 'ออกจากกลุ่มนี้', style: 'sell', action: { kind: 'rotate', sellIds: heldSector, sellFraction: 1, buyIds: [] } });
  } else {
    const basket = heldIds.length ? heldIds : view.companies.map((c) => c.id);
    const amount = portfolio.cash * 0.25;
    add({ id: 'buy_dip', label: OPTION_LABELS.buyDip, detail: `ใช้เงินสด 25% (${baht(amount)}) ซื้อ${heldIds.length ? 'หุ้นที่ถือ' : 'ทุกบริษัท'}เพิ่มเท่า ๆ กัน`, style: 'buy', action: { kind: 'buy_basket', companyIds: basket, amount } });
    add({ id: 'hold', label: OPTION_LABELS.hold, detail: 'ปล่อยพอร์ตไว้ตามเดิม', style: 'hold', action: { kind: 'hold' } });
    add({ id: 'reduce', label: OPTION_LABELS.reduceRisk, detail: 'ขายครึ่งหนึ่งของหุ้นทุกตัว', style: 'sell', action: { kind: 'sell_fraction_all', fraction: 0.5 } });
    add({ id: 'all_cash', label: OPTION_LABELS.allCash, detail: 'ขายหุ้นทั้งหมด', style: 'sell', action: { kind: 'sell_fraction_all', fraction: 1 } });
  }

  const day = view.currentDay;
  const idx = view.indexHistory(day - 126).map((b) => b.close);
  return {
    id: `event:${def.id}@${day}`,
    type: 'event',
    key: `event:${def.id}`,
    day,
    title: def.title,
    prompt: def.prompt,
    facts: [
      { label: 'ดัชนีจากจุดสูงสุด 6 เดือน', value: pct(idx[idx.length - 1] / Math.max(...idx) - 1, 1), tone: -1 },
      { label: 'เงินสดในพอร์ต', value: `${baht(portfolio.cash)} (${pct(portfolio.cash / Math.max(total, 1), 0, false)})` },
      { label: 'มูลค่าพอร์ต', value: baht(total) },
      { label: 'เหตุการณ์', value: tag.mood === 'golden' ? 'ตลาดคึกคัก' : 'ตลาดปั่นป่วน' },
    ],
    options,
    forwardDays: 63,
    params: {},
    eventDecisionId: def.id,
  };
}

export function findEventDecision(id: string | undefined): { def: EventDecisionDef; tag: EventTag } | null {
  for (const tag of EVENTS) for (const def of tag.decisions) if (def.id === id) return { def, tag };
  return null;
}

export function buildEventOutcome(
  dp: DecisionPoint,
  chosenId: string,
  portfolios: Record<string, Portfolio>,
  view: MarketView,
): DecisionOutcome {
  const found = findEventDecision(dp.eventDecisionId);
  const core = computeOutcomePaths(dp, portfolios, view, dp.day);
  const weeks = Math.max(1, Math.round((core.days.length - 1) / 5));
  const lesson = [outcomeHeadline(core.outcomes, chosenId, weeks)];
  if (found?.def.scope === 'sector' && found.def.sector) {
    const rets = sectorIds(view, found.def).map((id) => {
      const a = view.close(id, dp.day);
      const b = view.close(id);
      return a && b ? b / a - 1 : 0;
    });
    const avg = rets.reduce((x, y) => x + y, 0) / Math.max(1, rets.length);
    lesson.push(`ช่วงต่อมาหุ้นกลุ่มนี้ในเมืองเปลี่ยนไปเฉลี่ย ${pct(avg, 1)} ส่วนดัชนีเมืองเปลี่ยนไป ${pct(core.indexReturn, 1)}`);
  } else {
    lesson.push(`ช่วงต่อมาดัชนีเมืองเปลี่ยนไป ${pct(core.indexReturn, 1)}`);
  }
  lesson.push(...(found?.def.lesson ?? []), OUTCOME_DISCLAIMER);
  return {
    decisionId: dp.id,
    chosenId,
    startDay: dp.day,
    endDay: view.currentDay,
    ...core,
    lesson,
    considerations: found?.def.considerations ?? [],
  };
}
