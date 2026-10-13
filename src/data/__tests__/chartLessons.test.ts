import { beforeAll, describe, expect, it } from 'vitest';
import { annotationLine, barIndex, barsFromFile } from '../../engine/lessonData';
import { rsi, sma } from '../../engine/indicators';
import { backtestStrategies } from '../../engine/strategies';
import type { ManifestJson, PriceFileJson } from '../../engine/provider/HistoricalProvider';
import type { PriceBar } from '../../engine/types';
import { CHART_LESSONS } from '../chartLessons';
import type { Annotation } from '../chartLessons';

const priceFiles = import.meta.glob<PriceFileJson>('/public/data/prices/*.json', { import: 'default' });
const cache = new Map<string, PriceBar[]>();
const TICKERS = ['AAPL', 'JPM', 'META', 'DUK', 'INTC', 'NVDA', 'COP', 'MSFT', 'JNJ', 'O', 'V', 'KO', 'XOM', 'DIS', 'PFE', 'HD', 'CAT'];
beforeAll(async () => {
  const manifest = (await import('../../../public/data/manifest.json')).default as unknown as ManifestJson;
  for (const t of TICKERS) cache.set(t, barsFromFile(manifest.calendar, await priceFiles[`/public/data/prices/${t}.json`](), manifest.fx));
});
function bars(ticker: string): PriceBar[] {
  expect(cache.has(ticker), `${ticker} loaded (add it to TICKERS)`).toBe(true);
  return cache.get(ticker)!;
}
const bar = (ticker: string, date: string) => {
  const b = bars(ticker);
  const i = barIndex(b, date);
  expect(i, `${ticker} ${date}`).toBeGreaterThanOrEqual(0);
  return b[i];
};
const shape = (b: PriceBar) => {
  const range = b.high - b.low;
  return {
    body: Math.abs(b.close - b.open) / range,
    upper: (b.high - Math.max(b.open, b.close)) / range,
    lower: (Math.min(b.open, b.close) - b.low) / range,
  };
};

const slides = CHART_LESSONS.flatMap((l) => l.slides);

describe('chart lessons', () => {
  it('every chart window and annotation date exists in the data', () => {
    for (const s of slides) {
      if (!s.chart) continue;
      const { ticker, from, to, annotations = [] } = s.chart;
      bar(ticker, from);
      bar(ticker, to);
      for (const a of annotations) {
        const dates = a.kind === 'mark' ? [a.date] : a.kind === 'focus' ? [a.from, a.to ?? a.from] : a.kind === 'level' ? [a.from, a.to] : [a.a.date, a.b.date, a.until ?? a.b.date];
        for (const d of dates) {
          bar(ticker, d);
          expect(d >= from && d <= to, `${ticker} ${d} inside ${from}..${to}`).toBe(true);
        }
        if (a.kind === 'trend' || a.kind === 'level') expect(annotationLine(bars(ticker), a)).not.toBeNull();
      }
    }
  });

  it('quizzes have exactly one right answer', () => {
    for (const s of slides.filter((x) => x.quiz)) expect(s.quiz!.options.filter((o) => o.correct)).toHaveLength(1);
  });

  it('candles look like the text says', () => {
    const green = bar('AAPL', '2020-03-26');
    expect(green.close > green.open && shape(green).body > 0.9).toBe(true);
    const red = bar('AAPL', '2020-03-20');
    expect(red.close < red.open && red.close / red.open - 1 < -0.06).toBe(true);
    const wick = bar('AAPL', '2020-03-16');
    expect(shape(wick).upper > 0.8 && wick.high / wick.open - 1 > 0.06).toBe(true);
    for (const d of ['2020-02-24', '2020-03-31']) expect(shape(bar('AAPL', d)).body).toBeLessThan(0.15);
    for (const [t, d] of [['AAPL', '2020-03-23'], ['JPM', '2020-03-04']]) {
      const s = shape(bar(t, d));
      expect(s.lower > 0.6 && s.lower > s.body * 2 && s.upper < 0.1).toBe(true);
    }
    const quiz = bar('AAPL', '2020-04-07');
    expect(quiz.close < quiz.open && shape(quiz).body > 0.85).toBe(true);
    // The hammer worked for AAPL and failed for JPM (fell ~30% more within 3 weeks).
    expect(bar('AAPL', '2020-05-15').close / bar('AAPL', '2020-03-23').close).toBeGreaterThan(1.3);
    expect(bar('JPM', '2020-03-23').close / bar('JPM', '2020-03-04').close).toBeLessThan(0.72);
  });

  it('trend lines hold until the break the text describes', () => {
    const trend = (ticker: string, a: Annotation & { kind: 'trend' }) => {
      const b = bars(ticker);
      const pts = annotationLine(b, a)!;
      const i = barIndex(b, pts[0].date);
      const j = barIndex(b, pts[1].date);
      return (n: number) => pts[0].value + ((pts[1].value - pts[0].value) * (n - i)) / (j - i);
    };
    // AAPL: closes stay above the uptrend line until 2020-03-09.
    const aapl = bars('AAPL');
    const up = trend('AAPL', { kind: 'trend', a: { date: '2019-08-05', at: 'low' }, b: { date: '2019-10-03', at: 'low' } });
    const brk = barIndex(aapl, '2020-03-09');
    for (let n = barIndex(aapl, '2019-08-05'); n < brk; n++) expect(aapl[n].close).toBeGreaterThanOrEqual(up(n) - 1e-6);
    expect(aapl[brk].close).toBeLessThan(up(brk));
    // META: highs stay (almost) under the downtrend line.
    const meta = bars('META');
    const down = trend('META', { kind: 'trend', a: { date: '2022-04-05', at: 'high' }, b: { date: '2022-09-12', at: 'high' } });
    for (let n = barIndex(meta, '2022-04-05'); n <= barIndex(meta, '2022-11-30'); n++) expect(meta[n].high).toBeLessThanOrEqual(down(n) * 1.01);
  });

  it('trend quizzes match the data', () => {
    const intc = bars('INTC');
    expect(bar('INTC', '2024-08-30').close / bar('INTC', '2024-01-02').close).toBeLessThan(0.6);
    expect(intc.length).toBeGreaterThan(0);
    const nvda = bars('NVDA');
    const m50 = sma(nvda.map((b) => b.close), 50);
    const end = barIndex(nvda, '2023-08-31');
    expect(nvda[end].close).toBeGreaterThan(m50[end]!);
    expect(m50[end]!).toBeGreaterThan(m50[end - 20]!);
    const duk = bars('DUK').slice(barIndex(bars('DUK'), '2019-02-05'), barIndex(bars('DUK'), '2019-08-05') + 1);
    expect(Math.max(...duk.map((b) => b.high)) / Math.min(...duk.map((b) => b.low))).toBeLessThan(1.08);
  });
  const level = (t: string, from: string, to: string, at: 'high' | 'low') => annotationLine(bars(t), { kind: 'level', from, to, at })![0].value;
  const close = (t: string, d: string) => bar(t, d).close;
  const avgVol = (t: string, d: string) => {
    const b = bars(t);
    const i = barIndex(b, d);
    return b.slice(i - 20, i).reduce((s, x) => s + x.volume, 0) / 20;
  };

  it('support and resistance examples behave as described', () => {
    // COP support: lows touch the level, closes hold above it until the break on 2019-04-26.
    const cop = level('COP', '2019-01-17', '2019-04-04', 'low');
    for (const d of ['2019-01-17', '2019-02-08', '2019-03-08', '2019-04-04']) expect(bar('COP', d).low / cop - 1).toBeLessThan(0.012);
    const c = bars('COP');
    for (let n = barIndex(c, '2019-01-17'); n < barIndex(c, '2019-04-26'); n++) expect(c[n].close).toBeGreaterThan(cop * 0.985);
    expect(close('COP', '2019-04-26')).toBeLessThan(cop * 0.98);
    expect(bar('COP', '2019-04-30').high / cop - 1).toBeGreaterThan(-0.015);
    expect(close('COP', '2019-04-30')).toBeLessThan(cop);
    // MSFT resistance: highs touch, then a high-volume breakout and a retest that holds.
    const msft = level('MSFT', '2016-08-09', '2016-10-10', 'high');
    for (const d of ['2016-08-09', '2016-08-26', '2016-09-29', '2016-10-10']) expect(1 - bar('MSFT', d).high / msft).toBeLessThan(0.012);
    expect(close('MSFT', '2016-10-21')).toBeGreaterThan(msft * 1.01);
    expect(bar('MSFT', '2016-10-21').volume / avgVol('MSFT', '2016-10-21')).toBeGreaterThan(2.8);
    expect(bar('MSFT', '2016-11-04').low / msft - 1).toBeLessThan(0.015);
    const m = bars('MSFT');
    for (let n = barIndex(m, '2016-10-21'); n <= barIndex(m, '2016-12-30'); n++) expect(m[n].close).toBeGreaterThan(msft * 0.985);
    // JNJ pick: the answer level sits at the window's support (within the 2% tolerance of its lowest low).
    const jnj = level('JNJ', '2015-03-11', '2015-08-12', 'low');
    const j = bars('JNJ');
    const win = j.slice(barIndex(j, '2015-03-02'), barIndex(j, '2015-08-14') + 1);
    expect(Math.min(...win.map((b) => b.low)) / jnj - 1).toBeGreaterThan(-0.02);
    expect(win.filter((b) => b.low / jnj - 1 < 0.012).length).toBeGreaterThanOrEqual(8);
    // O false breakout: low volume, back under within days, ~20% lower within two months.
    const o = level('O', '2024-09-05', '2024-10-01', 'high');
    expect(close('O', '2024-10-18')).toBeGreaterThan(o * 1.01);
    expect(bar('O', '2024-10-18').volume / avgVol('O', '2024-10-18')).toBeLessThan(1);
    expect(close('O', '2024-10-24')).toBeLessThan(o);
    const ob = bars('O');
    const after = ob.slice(barIndex(ob, '2024-10-18'), barIndex(ob, '2024-12-31') + 1);
    expect(Math.min(...after.map((b) => b.close)) / close('O', '2024-10-18') - 1).toBeLessThan(-0.17);
  });

  it('moving-average and RSI examples behave as described', () => {
    const cross = (t: string, d: string, dir: 1 | -1) => {
      const b = bars(t);
      const c = b.map((x) => x.close);
      const a = sma(c, 50);
      const z = sma(c, 200);
      const i = barIndex(b, d);
      expect(dir * (a[i]! - z[i]!)).toBeGreaterThan(0);
      expect(dir * (a[i - 1]! - z[i - 1]!)).toBeLessThanOrEqual(0);
      return i;
    };
    const g = cross('META', '2023-03-02', 1);
    const meta = bars('META');
    expect(meta[g + 63].close / meta[g].close).toBeGreaterThan(1.5);
    expect(close('META', '2023-03-02') / close('META', '2022-11-03')).toBeGreaterThan(1.9);
    const dth = cross('META', '2021-12-10', -1);
    expect(meta[dth + 63].close / meta[dth].close).toBeLessThan(0.6);
    cross('AAPL', '2018-12-21', -1);
    cross('AAPL', '2019-05-06', 1);
    expect(close('AAPL', '2019-05-06') / close('AAPL', '2018-12-21')).toBeGreaterThan(1.35);

    const rsiAt = (t: string, d: string) => rsi(bars(t).map((x) => x.close), 14)[barIndex(bars(t), d)]!;
    expect(Math.round(rsiAt('V', '2022-03-07'))).toBe(24);
    const v = bars('V');
    const vi = barIndex(v, '2022-03-07');
    expect(Math.max(...v.slice(vi, vi + 22).map((b) => b.close)) / v[vi].close).toBeGreaterThan(1.17);
    expect(rsiAt('META', '2022-02-03')).toBeLessThan(30);
    expect(close('META', '2022-11-03') / close('META', '2022-02-03')).toBeLessThan(0.4);
    expect(rsiAt('NVDA', '2023-01-25')).toBeGreaterThan(70);
    expect(close('NVDA', '2023-08-31') / close('NVDA', '2023-01-25')).toBeGreaterThan(2.5);
    const nr = rsi(bars('NVDA').map((x) => x.close), 14);
    const nv = bars('NVDA');
    let over = 0;
    for (let n = barIndex(nv, '2023-01-03'); n <= barIndex(nv, '2023-08-31'); n++) if (nr[n]! > 70) over++;
    expect(over).toBeGreaterThanOrEqual(20);
    // Volume: AAPL panic volume ~4x the prior 60-day average; the low came ~3 weeks later.
    const a = bars('AAPL');
    const ai = barIndex(a, '2020-02-28');
    const prior = a.slice(barIndex(a, '2020-01-15') - 60, barIndex(a, '2020-01-15')).reduce((s, x) => s + x.volume, 0) / 60;
    expect(a[ai].volume / prior).toBeGreaterThan(3.5);
    const win = a.slice(barIndex(a, '2020-01-15'), barIndex(a, '2020-05-15') + 1);
    expect(win.reduce((lo, b) => (b.low < lo.low ? b : lo)).date).toBe('2020-03-23');
  });

  it('buy-and-hold beats both signal strategies on most of the backtest tickers', () => {
    const slide = slides.find((s) => s.backtest)!;
    let holdWins = 0;
    for (const t of slide.backtest!.tickers) {
      const b = bars(t);
      const r = backtestStrategies(b.map((x) => x.close), barIndex(b, slide.backtest!.from));
      if (r.hold >= Math.max(r.maCross, r.rsi)) holdWins++;
    }
    expect(holdWins).toBeGreaterThanOrEqual(10);
  });
});
