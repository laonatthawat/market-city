import { describe, expect, it } from 'vitest';
import {
  FEE_RATE,
  averageCost,
  buy,
  createPortfolio,
  maxAffordableShares,
  quote,
  sell,
  totalValue,
} from '../portfolio';

describe('portfolio engine', () => {
  it('buys with a 0.15% fee and tracks average cost', () => {
    const p0 = createPortfolio(100_000);
    const r = buy(p0, { companyId: 'A', shares: 100, price: 500, day: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fee = 100 * 500 * FEE_RATE;
    expect(r.tx.fee).toBeCloseTo(fee, 2);
    expect(r.portfolio.cash).toBeCloseTo(100_000 - 50_000 - fee, 2);
    expect(averageCost(r.portfolio.holdings.A)).toBeCloseTo(500 * (1 + FEE_RATE), 4);
    expect(p0.cash).toBe(100_000); // immutability
  });

  it('rejects trades it cannot afford or invalid quantities', () => {
    const p = createPortfolio(1000);
    expect(buy(p, { companyId: 'A', shares: 10, price: 100, day: 0 })).toEqual({ ok: false, error: 'INSUFFICIENT_CASH' });
    expect(buy(p, { companyId: 'A', shares: 0, price: 100, day: 0 })).toEqual({ ok: false, error: 'INVALID_QTY' });
    expect(buy(p, { companyId: 'A', shares: 0.00001, price: 100, day: 0 })).toEqual({ ok: false, error: 'INVALID_QTY' });
    expect(buy(p, { companyId: 'A', shares: 1.5, price: 100, day: 0 }).ok).toBe(true);
    expect(sell(p, { companyId: 'A', shares: 1, price: 100, day: 0 })).toEqual({ ok: false, error: 'INSUFFICIENT_SHARES' });
  });

  it('computes realized P&L on partial and full sells', () => {
    let p = createPortfolio(1_000_000);
    let r = buy(p, { companyId: 'A', shares: 100, price: 100, day: 0 });
    if (!r.ok) throw new Error();
    p = r.portfolio;
    r = buy(p, { companyId: 'A', shares: 100, price: 200, day: 1 });
    if (!r.ok) throw new Error();
    p = r.portfolio;
    const avg = averageCost(p.holdings.A);
    r = sell(p, { companyId: 'A', shares: 50, price: 300, day: 2 });
    if (!r.ok) throw new Error();
    p = r.portfolio;
    const expected = quote('sell', 50, 300).total - avg * 50;
    expect(r.tx.realizedPnl).toBeCloseTo(expected, 6);
    expect(p.holdings.A.shares).toBe(150);
    expect(averageCost(p.holdings.A)).toBeCloseTo(avg, 6);
    r = sell(p, { companyId: 'A', shares: 150, price: 300, day: 3 });
    if (!r.ok) throw new Error();
    expect(r.portfolio.holdings.A).toBeUndefined();
    expect(r.portfolio.transactions).toHaveLength(4);
  });

  it('fractional max shares for automatic buys', () => {
    const n = maxAffordableShares(500, 12_345, true);
    expect(n).toBeGreaterThan(0.04);
    expect(quote('buy', n, 12_345).total).toBeLessThanOrEqual(500);
  });

  it('maxAffordableShares never exceeds cash', () => {
    for (const [cash, price] of [[1_000_000, 333.33], [10_000, 9_990], [5, 10], [123_456, 1.07]]) {
      const n = maxAffordableShares(cash, price);
      expect(quote('buy', n, price).total).toBeLessThanOrEqual(cash);
      expect(quote('buy', n + 1, price).total).toBeGreaterThan(cash);
    }
  });

  it('values cash plus holdings', () => {
    const r = buy(createPortfolio(10_000), { companyId: 'A', shares: 10, price: 100, day: 0 });
    if (!r.ok) throw new Error();
    expect(totalValue(r.portfolio, () => 150)).toBeCloseTo(r.portfolio.cash + 1500, 6);
  });
});
