import { describe, expect, it } from 'vitest';
import { anonDate, formatAnonMonth } from '../anonDate';
import { healthScore } from '../health';
import { changeOver, ema, rsi, sma } from '../indicators';
import { diversificationScore, maxDrawdown, totalReturn } from '../metrics';

describe('indicators', () => {
  it('ema seeds with the SMA, then weights recent prices by 2/(n+1)', () => {
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e.slice(0, 2)).toEqual([null, null]);
    expect(e[2]).toBeCloseTo(2);
    expect(e[3]).toBeCloseTo(4 * 0.5 + 2 * 0.5);
    expect(e[4]).toBeCloseTo(5 * 0.5 + 3 * 0.5);
  });

  it('sma', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('rsi is 100 for strictly rising and ~0 for falling series', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const down = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(rsi(up).at(-1)).toBe(100);
    expect(rsi(down).at(-1)).toBeLessThan(1);
    expect(rsi(up)[13]).toBeNull();
  });

  it('changeOver', () => {
    expect(changeOver([100, 110, 121], 2)).toBeCloseTo(0.21);
    expect(changeOver([100, 110], 20)).toBeCloseTo(0.1);
  });
});

describe('metrics', () => {
  it('maxDrawdown', () => {
    expect(maxDrawdown([100, 120, 90, 130, 65])).toBeCloseTo(0.5);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
  });
  it('totalReturn & diversification', () => {
    expect(totalReturn(100, 150)).toBeCloseTo(0.5);
    expect(diversificationScore([1, 1, 1, 1])).toBeCloseTo(1);
    expect(diversificationScore([1, 0, 0, 0])).toBeCloseTo(0);
  });
});

describe('anonDate', () => {
  it('counts years/months from the run start', () => {
    expect(anonDate('2019-03-14', '2019-03-02')).toEqual({ year: 1, month: 1, day: 14 });
    expect(anonDate('2020-05-01', '2019-03-02')).toEqual({ year: 2, month: 3, day: 1 });
    expect(formatAnonMonth('2019-01-10', '2019-03-02')).toBe('ก่อนเริ่ม 2 เดือน');
  });
});

describe('healthScore', () => {
  it('rewards strong fundamentals and flags weak ones', () => {
    const base = {
      fiscalYear: 2020, price: 100, marketCap: 1e9, revenue: 1e9, netIncome: 2e8, eps: 5,
      pe: 20, pb: 3, revenueGrowth: 0.15, netMargin: 0.2, debtToEquity: 0.3, dividendYield: 0.01,
      epsTrend: [{ year: 2019, eps: 4 }, { year: 2020, eps: 5 }], approximate: true as const,
    };
    const good = healthScore(base, 'tech');
    const bad = healthScore({ ...base, netMargin: -0.1, pe: null, revenueGrowth: -0.1, debtToEquity: 3, epsTrend: [{ year: 2019, eps: 1 }, { year: 2020, eps: -1 }] }, 'tech');
    expect(good.score).toBeGreaterThan(70);
    expect(bad.score).toBeLessThan(30);
    expect(bad.reasons.length).toBeGreaterThan(2);
  });
});
