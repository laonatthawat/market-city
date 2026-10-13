import { describe, expect, it } from 'vitest';
import { chartSignals } from '../signals';

const ids = (xs: { id: string; label: string }[]) => Object.fromEntries(xs.map((x) => [x.id, x.label]));

describe('chartSignals', () => {
  it('reads a steady uptrend', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 * 1.003 ** i);
    const s = ids(chartSignals(closes, closes.map(() => 1000)));
    expect(s.trend).toBe('แนวโน้มขาขึ้น');
    expect(s.range).toBe('ใกล้จุดสูงสุดรอบปี');
    expect(s.rsi).toMatch(/ขึ้นแรง/);
    expect(s.vol).toBeUndefined();
  });

  it('reads a downtrend, a volume spike and a fresh death cross', () => {
    // Up for a long time, then a slide long enough for MA50 to cross under MA200 at the end.
    const up = Array.from({ length: 260 }, (_, i) => 100 + i * 0.2);
    let crossAt = -1;
    const closes = [...up];
    for (let k = 0; k < 200 && crossAt < 0; k++) {
      closes.push(closes[closes.length - 1] * 0.99);
      const n = closes.length;
      const avg = (len: number, end: number) => closes.slice(end - len, end).reduce((a, b) => a + b, 0) / len;
      if (avg(50, n) < avg(200, n) && avg(50, n - 1) >= avg(200, n - 1)) crossAt = n;
    }
    const vols = closes.map(() => 1000);
    vols[vols.length - 1] = 5000;
    const s = ids(chartSignals(closes, vols));
    expect(s.trend).toBe('แนวโน้มขาลง');
    expect(s.cross).toBe('Death Cross');
    expect(s.vol).toBe('วอลุ่ม 5.0 เท่า');
  });

  it('needs some history', () => {
    expect(chartSignals([1, 2, 3], [1, 1, 1])).toEqual([]);
  });
});
