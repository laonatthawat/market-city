import { timeWeightedReturn, xirr } from './dca';
import type { MarketView } from './MarketView';
import { maxDrawdown } from './metrics';
import type { Transaction } from './portfolio';
import type { Day } from './types';

export interface ScorePoint {
  day: Day;
  value: number;
  index: number;
  cash: number;
  /** Diversification of the holdings that day (0..1). */
  div: number;
  /** Money added that day (DCA contributions). */
  contrib: number;
}

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface BehaviorFlag {
  day: Day;
  companyId: string;
  /** Price move that made the trade look bad in hindsight. */
  move: number;
}

export interface Report {
  contributed: number;
  finalValue: number;
  totalReturn: number;
  indexReturn: number;
  excess: number;
  /** Money-weighted (XIRR) and time-weighted returns — mainly for DCA runs. */
  xirr: number | null;
  twr: number;
  sharpe: number;
  indexSharpe: number;
  maxDrawdown: number;
  indexMaxDrawdown: number;
  avgDiversification: number;
  avgCashShare: number;
  trades: number;
  panicSells: BehaviorFlag[];
  fomoBuys: BehaviorFlag[];
  heldThroughDrawdown: boolean;
  behaviorScore: number;
  scores: { returns: number; risk: number; diversification: number; behavior: number; overall: number };
  grades: { returns: Grade; risk: Grade; diversification: Grade; behavior: Grade; overall: Grade };
  tips: string[];
}

export function gradeOf(score: number): Grade {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

const clamp = (x: number) => Math.max(0, Math.min(100, x));

/** Annualized Sharpe-like ratio of daily returns (risk-free = 0), contributions removed. */
export function sharpeOf(values: readonly number[], contrib: readonly number[] = []): number {
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) rets.push((values[i] - (contrib[i] ?? 0)) / values[i - 1] - 1);
  }
  if (rets.length < 5) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
  return sd > 0 ? (mean / sd) * Math.sqrt(252) : 0;
}

/** Sells close to a 3-month low that then rebounded ≥10% within 3 months. */
export function findPanicSells(txs: readonly Transaction[], view: MarketView): BehaviorFlag[] {
  const out: BehaviorFlag[] = [];
  for (const t of txs) {
    if (t.side !== 'sell') continue;
    const past = view.history(t.companyId, t.day - 63).filter((b) => b.day <= t.day).map((b) => b.close);
    const future = view.history(t.companyId, t.day + 1).filter((b) => b.day <= t.day + 63).map((b) => b.close);
    if (past.length < 20 || future.length < 10) continue;
    const low = Math.min(...past);
    const rebound = Math.max(...future) / t.price - 1;
    if (t.price <= low * 1.05 && rebound >= 0.1) out.push({ day: t.day, companyId: t.companyId, move: rebound });
  }
  return out;
}

/** Buys after a ≥30% 3-month run-up near a 6-month high that then fell ≥10% within 3 months. */
export function findFomoBuys(txs: readonly Transaction[], view: MarketView): BehaviorFlag[] {
  const out: BehaviorFlag[] = [];
  for (const t of txs) {
    if (t.side !== 'buy') continue;
    const past = view.history(t.companyId, t.day - 126).filter((b) => b.day <= t.day).map((b) => b.close);
    const future = view.history(t.companyId, t.day + 1).filter((b) => b.day <= t.day + 63).map((b) => b.close);
    if (past.length < 70 || future.length < 10) continue;
    const runUp = t.price / past[Math.max(0, past.length - 64)] - 1;
    const nearHigh = t.price >= Math.max(...past) * 0.97;
    const drop = Math.min(...future) / t.price - 1;
    if (runUp >= 0.3 && nearHigh && drop <= -0.1) out.push({ day: t.day, companyId: t.companyId, move: drop });
  }
  return out;
}

/** Did the player stay invested through the worst drawdown (sold < half of holdings)? */
export function heldThrough(points: readonly ScorePoint[], txs: readonly Transaction[]): boolean {
  let peakI = 0;
  let worst = 0;
  let worstPeak = 0;
  let worstTrough = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].value > points[peakI].value) peakI = i;
    const dd = 1 - points[i].value / points[peakI].value;
    if (dd > worst) {
      worst = dd;
      worstPeak = peakI;
      worstTrough = i;
    }
  }
  if (worst < 0.15) return false;
  const p = points[worstPeak];
  const invested = p.value - p.cash;
  const sold = txs
    .filter((t) => t.side === 'sell' && t.day >= p.day && t.day <= points[worstTrough].day)
    .reduce((a, t) => a + t.total, 0);
  return invested > 0 && sold < invested * 0.5;
}

export function buildReport(points: readonly ScorePoint[], txs: readonly Transaction[], view: MarketView, startingCash: number): Report {
  const values = points.map((p) => p.value);
  const index = points.map((p) => p.index);
  const contrib = points.map((p) => p.contrib);
  const contributed = startingCash + contrib.reduce((a, b) => a + b, 0);
  const last = points[points.length - 1];
  const totalReturn = contributed > 0 ? last.value / contributed - 1 : 0;
  const indexReturn = contributed > 0 ? last.index / contributed - 1 : 0;

  const years = Math.max(1 / 252, (points.length - 1) / 252);
  const flows = [
    ...(startingCash > 0 ? [{ t: 0, amount: -startingCash }] : []),
    ...points.filter((p) => p.contrib > 0).map((p) => ({ t: (p.day - points[0].day) / 252, amount: -p.contrib })),
    { t: years, amount: last.value },
  ];
  const sharpe = sharpeOf(values, contrib);
  const indexSharpe = sharpeOf(index, contrib);
  // Drawdowns on time-weighted growth so new contributions don't hide losses.
  const growth = (vals: readonly number[]) => {
    const g = [1];
    for (let i = 1; i < vals.length; i++) g.push(g[i - 1] * (vals[i - 1] > 0 ? (vals[i] - contrib[i]) / vals[i - 1] : 1));
    return g;
  };
  const dd = maxDrawdown(growth(values));
  const idd = maxDrawdown(growth(index));
  const avgDiv = points.reduce((a, p) => a + p.div, 0) / points.length;
  const avgCash = points.reduce((a, p) => a + (p.value > 0 ? p.cash / p.value : 1), 0) / points.length;

  // Payday (DCA) purchases are a plan being followed, not discretionary trading.
  const paydays = new Set(points.filter((p) => p.contrib > 0).map((p) => p.day));
  const discretionary = txs.filter((t) => !(t.side === 'buy' && paydays.has(t.day)));
  const panicSells = findPanicSells(discretionary, view);
  const fomoBuys = findFomoBuys(discretionary, view);
  const held = heldThrough(points, txs);
  const trades = discretionary.length;
  const behaviorScore = clamp(
    75 - 10 * panicSells.length - 8 * fomoBuys.length + (held ? 10 : 0) + (avgDiv > 0.6 ? 5 : 0) - (trades > 80 ? 10 : trades > 40 ? 5 : 0),
  );

  const excess = totalReturn - indexReturn;
  const scores = {
    returns: clamp(60 + excess * 200),
    risk: clamp(55 + (sharpe - indexSharpe) * 35 + (idd - dd) * 100),
    diversification: clamp(avgDiv * 100),
    behavior: behaviorScore,
    overall: 0,
  };
  scores.overall = clamp(scores.returns * 0.3 + scores.risk * 0.25 + scores.diversification * 0.2 + scores.behavior * 0.25);

  const report: Report = {
    contributed,
    finalValue: last.value,
    totalReturn,
    indexReturn,
    excess,
    xirr: xirr(flows),
    twr: timeWeightedReturn(values, contrib),
    sharpe,
    indexSharpe,
    maxDrawdown: dd,
    indexMaxDrawdown: idd,
    avgDiversification: avgDiv,
    avgCashShare: avgCash,
    trades,
    panicSells,
    fomoBuys,
    heldThroughDrawdown: held,
    behaviorScore,
    scores,
    grades: {
      returns: gradeOf(scores.returns),
      risk: gradeOf(scores.risk),
      diversification: gradeOf(scores.diversification),
      behavior: gradeOf(scores.behavior),
      overall: gradeOf(scores.overall),
    },
    tips: [],
  };
  report.tips = tipsFor(report);
  return report;
}

/** Personalized Thai tips; always at least one, at most four. */
export function tipsFor(r: Report): string[] {
  const tips: string[] = [];
  if (r.panicSells.length > 0)
    tips.push(`คุณขายหุ้นใกล้จุดต่ำสุด ${r.panicSells.length} ครั้ง แล้วราคาเด้งกลับหลังจากนั้น ครั้งหน้าลองตั้งกฎกับตัวเองไว้ก่อนตลาดตก เช่น "จะไม่ขายภายใน 1 สัปดาห์หลังราคาร่วงแรง"`);
  if (r.fomoBuys.length > 0)
    tips.push(`คุณไล่ซื้อหุ้นที่ขึ้นแรงไปแล้ว ${r.fomoBuys.length} ครั้ง แล้วราคาย่อลงหลังจากนั้น ก่อนซื้อหุ้นร้อนแรง ลองเช็ก P/E และจำกัดขนาดไว้ไม่ให้เกิน 5–10% ของพอร์ต`);
  if (r.avgDiversification < 0.4)
    tips.push('พอร์ตกระจุกตัวค่อนข้างมาก การถือหุ้น 8–15 ตัวจากหลายเซกเตอร์ช่วยลดความเสี่ยงที่เกิดจากบริษัทเดียวได้มาก');
  if (r.avgCashShare > 0.4)
    tips.push(`โดยเฉลี่ยคุณถือเงินสด ${Math.round(r.avgCashShare * 100)}% ของพอร์ต เงินสดปลอดภัยแต่ไม่งอกเงย ถ้ากังวลเรื่องจังหวะ ลองทยอยลงทุนเป็นงวดแทน`);
  if (r.trades > 60) tips.push(`คุณซื้อขาย ${r.trades} ครั้ง ค่าธรรมเนียมกับการตัดสินใจจากอารมณ์จะสะสมเมื่อเทรดบ่อย ลองถามตัวเองก่อนกดทุกครั้งว่าเหตุผลเปลี่ยนไปหรือยัง`);
  if (r.excess > 0 && r.maxDrawdown > r.indexMaxDrawdown + 0.08)
    tips.push('คุณชนะดัชนีได้ แต่ก็ลงลึกกว่าดัชนีมากระหว่างทาง ผลตอบแทนที่สูงขึ้นมาจากความเสี่ยงที่สูงขึ้นด้วย ถามตัวเองว่ารับขาลงแบบนี้ไหวทุกครั้งหรือเปล่า');
  if (r.heldThroughDrawdown) tips.push('เยี่ยมมาก! คุณถือผ่านช่วงพอร์ตลงหนักโดยไม่ตื่นตระหนก ความอดทนแบบนี้คือทักษะสำคัญที่สุดอย่างหนึ่งของนักลงทุน');
  if (tips.length === 0)
    tips.push(r.excess >= 0 ? 'ลงทุนได้สมดุลดี ลองเล่นโหมดท้าทายเพื่อฝึกวินัยในสถานการณ์ที่ยากขึ้น' : 'การชนะดัชนีทำได้ยากแม้แต่มืออาชีพ การถือพอร์ตกระจายหลายตัวแล้วอดทนมักเป็นกลยุทธ์ที่ดีพอสำหรับคนส่วนใหญ่');
  return tips.slice(0, 4);
}
