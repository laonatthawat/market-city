import { maxDrawdown } from './metrics';
import type { Portfolio } from './portfolio';
import { totalValue } from './portfolio';
import type { Company, RunModifiers } from './types';

export interface ChallengeDef {
  id: string;
  label: string;
  detail: string;
  mods: RunModifiers;
  /** Forces the DCA funding mode. */
  requiresDca?: boolean;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'dd15', label: 'คุมขาดทุนไม่เกิน 15%', detail: 'ถ้าพอร์ตลงเกิน 15% จากจุดสูงสุด รอบจะจบทันที', mods: { maxDrawdownLimit: 0.15 } },
  { id: 'cap30', label: 'แต่ละเซกเตอร์ไม่เกิน 30%', detail: 'ซื้อจนเซกเตอร์ใดเกิน 30% ของพอร์ตไม่ได้', mods: { sectorCap: 0.3 } },
  { id: 'nosell6', label: 'ห้ามขาย 6 เดือนแรก', detail: 'ฝึกความอดทน ขายได้หลังผ่านไป 6 เดือน', mods: { noSellMonths: 6 } },
  { id: 'dcaonly', label: 'ซื้อเฉพาะวันเงินเดือนออก', detail: 'โหมด DCA ที่ซื้อได้เฉพาะตอนเงินเข้า', mods: { dcaOnly: true }, requiresDca: true },
];

export function modifiersKey(m: RunModifiers): string {
  const parts: string[] = [];
  if (m.maxDrawdownLimit) parts.push(`dd${Math.round(m.maxDrawdownLimit * 100)}`);
  if (m.sectorCap) parts.push(`cap${Math.round(m.sectorCap * 100)}`);
  if (m.noSellMonths) parts.push(`nosell${m.noSellMonths}`);
  if (m.dcaOnly) parts.push('dcaonly');
  return parts.join('+') || 'none';
}

export function challengeLabels(m: RunModifiers): string[] {
  const key = modifiersKey(m);
  return CHALLENGES.filter((c) => key.includes(modifiersKey(c.mods))).map((c) => c.label);
}

export interface RuleContext {
  mods: RunModifiers;
  day: number;
  windowStart: number;
  companies: readonly Company[];
  priceOf: (id: string) => number | null;
  /** True while a payday allocation is in progress (DCA-only buys allowed). */
  payday: boolean;
}

function sectorWeights(p: Portfolio, ctx: RuleContext): Map<string, number> {
  const total = totalValue(p, ctx.priceOf);
  const m = new Map<string, number>();
  for (const h of Object.values(p.holdings)) {
    const c = ctx.companies.find((x) => x.id === h.companyId);
    if (!c) continue;
    m.set(c.sector, (m.get(c.sector) ?? 0) + (h.shares * (ctx.priceOf(h.companyId) ?? 0)) / Math.max(total, 1));
  }
  return m;
}

/**
 * Checks a portfolio change against the run's challenge rules.
 * Returns a Thai reason when it's not allowed, otherwise null.
 */
export function ruleViolation(before: Portfolio, after: Portfolio, ctx: RuleContext): string | null {
  const newTx = after.transactions.slice(before.transactions.length);
  if (newTx.length === 0) return null;
  const { mods } = ctx;
  if (mods.noSellMonths && newTx.some((t) => t.side === 'sell') && ctx.day - ctx.windowStart < mods.noSellMonths * 21) {
    return `โหมดท้าทาย: ห้ามขายใน ${mods.noSellMonths} เดือนแรก`;
  }
  if (mods.dcaOnly && newTx.some((t) => t.side === 'buy') && !ctx.payday) {
    return 'โหมดท้าทาย: ซื้อได้เฉพาะตอนเงินเดือนออก';
  }
  if (mods.sectorCap && newTx.some((t) => t.side === 'buy')) {
    const w = sectorWeights(after, ctx);
    const wBefore = sectorWeights(before, ctx);
    for (const [s, v] of w) {
      if (v > mods.sectorCap + 1e-9 && v > (wBefore.get(s) ?? 0) + 1e-9) {
        return `โหมดท้าทาย: เซกเตอร์เดียวเกิน ${Math.round(mods.sectorCap * 100)}% ของพอร์ตไม่ได้`;
      }
    }
  }
  return null;
}

/** Run-ending failure (e.g. drawdown limit breached). */
export function challengeFailure(mods: RunModifiers, values: readonly number[]): string | null {
  if (mods.maxDrawdownLimit && maxDrawdown(values) > mods.maxDrawdownLimit) {
    return `พอร์ตลดลงเกิน ${Math.round(mods.maxDrawdownLimit * 100)}% จากจุดสูงสุด — ภารกิจคุมความเสี่ยงล้มเหลว`;
  }
  return null;
}
