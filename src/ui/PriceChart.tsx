import { CandlestickSeries, HistogramSeries, LineSeries, createChart } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, LineData, WhitespaceData } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { ema, rsi, sma } from '../engine/indicators';
import type { PriceBar } from '../engine/types';
import { useGame } from '../store/gameStore';
import { chartOptions, cssVar, toTime } from './chartUtils';

type Timeframe = '3M' | '6M' | '1Y' | 'ALL';
/** Visible range, in trading days (converted to weeks for weekly candles). */
const TF: { id: Timeframe; label: string; days: number }[] = [
  { id: '3M', label: '3 เดือน', days: 63 },
  { id: '6M', label: '6 เดือน', days: 126 },
  { id: '1Y', label: '1 ปี', days: 252 },
  { id: 'ALL', label: 'ทั้งหมด', days: Infinity },
];
type Interval = 'D' | 'W';
const INTERVALS: { id: Interval; label: string; tip: string }[] = [
  { id: 'D', label: 'รายวัน', tip: 'แท่งเทียน 1 แท่ง = 1 วัน' },
  { id: 'W', label: 'รายสัปดาห์', tip: 'แท่งเทียน 1 แท่ง = 1 สัปดาห์ (เปิดวันแรก ปิดวันสุดท้ายของสัปดาห์)' },
];

/** Monday of the bar's week, as an ISO date (weeks group daily bars into weekly candles). */
function weekKey(iso: string): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Weekly candles from daily bars. Each keeps the index of its last day, so indicators (computed on
 * daily closes) are read at the week's close. Time is the week's first trading day, so the current
 * week's candle keeps its time while it grows.
 */
function toWeekly(bars: PriceBar[]): { bar: PriceBar; lastIndex: number }[] {
  const out: { bar: PriceBar; lastIndex: number; key: string }[] = [];
  bars.forEach((b, i) => {
    const key = weekKey(b.date);
    const cur = out[out.length - 1];
    if (cur && cur.key === key) {
      cur.bar = { ...cur.bar, high: Math.max(cur.bar.high, b.high), low: Math.min(cur.bar.low, b.low), close: b.close, volume: cur.bar.volume + b.volume };
      cur.lastIndex = i;
    } else out.push({ bar: { ...b }, lastIndex: i, key });
  });
  return out;
}

const EMA20_COLOR = '#23a77a';
const MA50_COLOR = '#f2a03d';
const MA200_COLOR = '#7c6ce0';
const RSI_COLOR = '#3b9ede';

interface Handles {
  chart: IChartApi;
  candle: ISeriesApi<'Candlestick'>;
  ema20: ISeriesApi<'Line'>;
  volume: ISeriesApi<'Histogram'>;
  ma50: ISeriesApi<'Line'>;
  ma200: ISeriesApi<'Line'>;
  rsi: ISeriesApi<'Line'> | null;
}

function lineData(bars: PriceBar[], values: (number | null)[]): (LineData | WhitespaceData)[] {
  return bars.map((b, i) => (values[i] == null ? { time: toTime(b.date) } : { time: toTime(b.date), value: values[i]! }));
}

export function PriceChart({ companyId }: { companyId: string }) {
  const view = useGame((s) => s.view);
  const day = useGame((s) => s.day);
  const theme = useGame((s) => s.theme);
  const [tf, setTf] = useState<Timeframe>('6M');
  const [interval, setInterval_] = useState<Interval>('D');
  const [ema20On, setEma20] = useState(false);
  const [ma50On, setMa50] = useState(true);
  const [ma200On, setMa200] = useState(false);
  const [rsiOn, setRsi] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const h = useRef<Handles | null>(null);
  const last = useRef<{ id: string; n: number; interval: Interval; shown: number } | null>(null);
  const tfRef = useRef(tf);
  tfRef.current = tf;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;

  /** `n` is the number of candles on the chart. */
  const applyRange = (n: number) => {
    const chart = h.current?.chart;
    if (!chart || n === 0) return;
    const days = TF.find((t) => t.id === tfRef.current)!.days;
    const span = intervalRef.current === 'W' ? Math.round(days / 5) : days;
    if (!Number.isFinite(span)) chart.timeScale().fitContent();
    else chart.timeScale().setVisibleLogicalRange({ from: n - span - 0.5, to: n + 2 });
  };

  // Create / recreate the chart.
  useEffect(() => {
    if (!el.current || !view) return;
    const chart = createChart(el.current, chartOptions(view.windowStartDate));
    const up = cssVar('--up');
    const down = cssVar('--down');
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
    });
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const lineOpts = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    const ema20 = chart.addSeries(LineSeries, { ...lineOpts, lineWidth: 1, color: EMA20_COLOR });
    const ma50 = chart.addSeries(LineSeries, { ...lineOpts, color: MA50_COLOR });
    const ma200 = chart.addSeries(LineSeries, { ...lineOpts, color: MA200_COLOR });
    h.current = { chart, candle, volume, ema20, ma50, ma200, rsi: null };
    last.current = null;
    return () => {
      chart.remove();
      h.current = null;
    };
  }, [view, theme]);

  // RSI pane on/off.
  useEffect(() => {
    const hh = h.current;
    if (!hh) return;
    if (rsiOn && !hh.rsi) {
      hh.rsi = hh.chart.addSeries(LineSeries, { color: RSI_COLOR, lineWidth: 2, priceLineVisible: false }, 1);
      hh.rsi.createPriceLine({ price: 70, color: cssVar('--down'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      hh.rsi.createPriceLine({ price: 30, color: cssVar('--up'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      hh.chart.panes()[1]?.setHeight(70);
    } else if (!rsiOn && hh.rsi) {
      hh.chart.removeSeries(hh.rsi);
      hh.rsi = null;
    }
    last.current = null;
  }, [rsiOn, view, theme]);

  useEffect(() => {
    h.current?.ema20.applyOptions({ visible: ema20On });
    h.current?.ma50.applyOptions({ visible: ma50On });
    h.current?.ma200.applyOptions({ visible: ma200On });
  }, [ema20On, ma50On, ma200On, view, theme]);

  // Data: full reset on company/toggle change, incremental update when one day passes.
  useEffect(() => {
    const hh = h.current;
    if (!hh || !view) return;
    const bars = view.history(companyId);
    const n = bars.length;
    if (n === 0) return;
    const closes = bars.map((b) => b.close);
    // Warm the indicators up on earlier prices so MA200 doesn't start halfway across the chart.
    const pre = view.warmupCloses(companyId, 200);
    const all = [...pre, ...closes];
    const visible = <T,>(xs: T[]) => xs.slice(pre.length);
    const e20 = visible(ema(all, 20));
    const m50 = visible(sma(all, 50));
    const m200 = visible(sma(all, 200));
    const r = hh.rsi ? visible(rsi(all, 14)) : null;
    const up = cssVar('--up');
    const down = cssVar('--down');
    const volColor = (b: PriceBar) => (b.close >= b.open ? up : down) + '55';
    // Candles to draw (daily or weekly) and, for each, the daily index its indicator values come from.
    const candles = interval === 'W' ? toWeekly(bars) : bars.map((bar, i) => ({ bar, lastIndex: i }));
    const at = (xs: (number | null)[]) => candles.map((c) => xs[c.lastIndex]);
    const series = { e20: at(e20), m50: at(m50), m200: at(m200), r: r ? at(r) : null };
    const cbars = candles.map((c) => c.bar);
    const k = cbars.length;
    const prev = last.current;
    if (prev && prev.id === companyId && prev.interval === interval && n === prev.n + 1) {
      // One more day: update (or append) the last candle and its indicator points.
      const b = cbars[k - 1];
      const t = toTime(b.date);
      const point = (v: number | null) => (v == null ? { time: t } : { time: t, value: v });
      hh.candle.update({ time: t, open: b.open, high: b.high, low: b.low, close: b.close });
      hh.volume.update({ time: t, value: b.volume, color: volColor(b) });
      hh.ema20.update(point(series.e20[k - 1]));
      hh.ma50.update(point(series.m50[k - 1]));
      hh.ma200.update(point(series.m200[k - 1]));
      if (hh.rsi && series.r) hh.rsi.update(point(series.r[k - 1]));
    } else {
      hh.candle.setData(cbars.map((b) => ({ time: toTime(b.date), open: b.open, high: b.high, low: b.low, close: b.close })));
      hh.volume.setData(cbars.map((b) => ({ time: toTime(b.date), value: b.volume, color: volColor(b) })));
      hh.ema20.setData(lineData(cbars, series.e20));
      hh.ma50.setData(lineData(cbars, series.m50));
      hh.ma200.setData(lineData(cbars, series.m200));
      if (hh.rsi && series.r) hh.rsi.setData(lineData(cbars, series.r));
      applyRange(k);
    }
    last.current = { id: companyId, n, interval, shown: k };
  }, [companyId, day, view, theme, rsiOn, interval]);

  useEffect(() => {
    applyRange(last.current?.shown ?? 0);
  }, [tf]);

  return (
    <div>
      {/* Row 1: candle interval and visible range. Row 2: indicators. */}
      {/* Both rows span the full width so their edges line up. */}
      <div className="mb-1.5 flex gap-1.5">
        <div className="flex rounded-2xl bg-soft p-0.5">
          {INTERVALS.map((it) => (
            <button key={it.id} className={`tab !flex-none whitespace-nowrap px-2.5 py-1 text-xs ${interval === it.id ? 'tab-active' : ''}`} onClick={() => setInterval_(it.id)} data-tip={it.tip}>
              {it.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 rounded-2xl bg-soft p-0.5">
          {TF.map((t) => (
            <button key={t.id} className={`tab whitespace-nowrap !px-1 py-1 text-xs ${tf === t.id ? 'tab-active' : ''}`} onClick={() => setTf(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-2 grid grid-cols-4 gap-1.5">
        <Toggle on={ema20On} color={EMA20_COLOR} onClick={() => setEma20(!ema20On)} label="EMA20" tip="ค่าเฉลี่ยแบบถ่วงน้ำหนัก 20 วัน (ให้น้ำหนักราคาล่าสุดมากกว่า): ตามราคาไวที่สุด ใช้ดูแนวโน้มระยะสั้น" />
        <Toggle on={ma50On} color={MA50_COLOR} onClick={() => setMa50(!ma50On)} label="MA50" tip="ราคาเฉลี่ย 50 วัน: แนวโน้มระยะกลาง" />
        <Toggle on={ma200On} color={MA200_COLOR} onClick={() => setMa200(!ma200On)} label="MA200" tip="ราคาเฉลี่ย 200 วัน (เฉลี่ยธรรมดา ไม่ใช่ EMA): แนวโน้มระยะยาว เส้นจะเรียบและขยับช้ากว่าราคามาก" />
        <Toggle on={rsiOn} color={RSI_COLOR} onClick={() => setRsi(!rsiOn)} label="RSI" tip="RSI 14 วัน: เกิน 70 = ขึ้นแรงเกินไป ต่ำกว่า 30 = ลงแรงเกินไป" />
      </div>
      <div ref={el} className="h-64 w-full" />
    </div>
  );
}

function Toggle({ on, color, label, tip, onClick }: { on: boolean; color: string; label: string; tip?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-tip={tip}
      className={`flex h-7 items-center justify-center rounded-2xl border text-xs font-semibold transition ${on ? 'border-transparent text-white' : 'border-line bg-soft/40 text-muted hover:text-ink'}`}
      style={on ? { background: color } : undefined}
    >
      {label}
    </button>
  );
}
