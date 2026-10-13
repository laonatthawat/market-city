import { rsi, sma } from './indicators';

export interface StrategyResult {
  /** Buy on day one, hold to the end. */
  hold: number;
  /** In the market only while MA50 > MA200 (decided on yesterday's close), otherwise cash. */
  maCross: number;
  /** Buy when RSI(14) < 30, sell when RSI(14) > 70. */
  rsi: number;
  maTrades: number;
  rsiTrades: number;
}

/**
 * Price-only returns of two textbook signals against buy-and-hold, from bar `from` to the last bar.
 * Indicators use the whole history, so they are warmed up on day one. No costs, no dividends,
 * cash earns nothing: the simplest fair comparison for a lesson.
 */
export function backtestStrategies(closes: readonly number[], from: number): StrategyResult {
  const m50 = sma(closes, 50);
  const m200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const last = closes.length - 1;
  let ma = 1;
  let maIn = false;
  let maTrades = 0;
  let rs = 1;
  let rsIn = false;
  let rsiTrades = 0;
  for (let i = from; i < last; i++) {
    const growth = closes[i + 1] / closes[i];
    const wantMa = m50[i] != null && m200[i] != null && m50[i]! > m200[i]!;
    if (wantMa !== maIn) {
      maIn = wantMa;
      maTrades++;
    }
    if (maIn) ma *= growth;
    const ri = r[i];
    if (!rsIn && ri != null && ri < 30) {
      rsIn = true;
      rsiTrades++;
    } else if (rsIn && ri != null && ri > 70) rsIn = false;
    if (rsIn) rs *= growth;
  }
  return { hold: closes[last] / closes[from] - 1, maCross: ma - 1, rsi: rs - 1, maTrades, rsiTrades };
}
