import { CandlestickSeries, HistogramSeries, LineSeries, createChart } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, LineData, WhitespaceData } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ema, rsi, sma } from '../engine/indicators';
import { chartSignals } from '../engine/signals';
import type { PriceBar } from '../engine/types';
import { pct, price as fmtPrice, toneClass } from '../lib/format';
import { loadJson, saveJson } from '../lib/storage';
import { useGame } from '../store/gameStore';
import { ChartDrawings, DrawingToolbar } from './ChartDrawings';
import type { Tool } from './ChartDrawings';
import { chartOptions, cssVar, toTime } from './chartUtils';
import { setDrawings, useDrawings } from './drawingStore';

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
 * Weekly candles from daily bars. Each keeps the indices of its first and last day, so indicators
 * (computed on daily closes) are read at the week's close and drawings (stored per day) can be
 * placed inside the week. Time is the week's first trading day, so the current week's candle keeps
 * its time while it grows.
 */
function toWeekly(bars: PriceBar[]): Candle[] {
  const out: (Candle & { key: string })[] = [];
  bars.forEach((b, i) => {
    const key = weekKey(b.date);
    const cur = out[out.length - 1];
    if (cur && cur.key === key) {
      cur.bar = { ...cur.bar, high: Math.max(cur.bar.high, b.high), low: Math.min(cur.bar.low, b.low), close: b.close, volume: cur.bar.volume + b.volume };
      cur.lastIndex = i;
    } else out.push({ bar: { ...b }, firstIndex: i, lastIndex: i, key });
  });
  return out;
}

interface Candle {
  bar: PriceBar;
  firstIndex: number;
  lastIndex: number;
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

/** Daily bar position ↔ chart logical index (identity for daily candles, interpolated inside weeks). */
function makeMapping(candles: () => Candle[]) {
  const toLogical = (x: number) => {
    const cs = candles();
    if (cs.length === 0) return x;
    const last = cs[cs.length - 1];
    if (x > last.lastIndex) return cs.length - 1 + (x - last.lastIndex) / (last.lastIndex - last.firstIndex + 1 || 5);
    let lo = 0;
    let hi = cs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cs[mid].firstIndex <= x + 0.5) lo = mid;
      else hi = mid - 1;
    }
    const c = cs[lo];
    const n = c.lastIndex - c.firstIndex + 1;
    return lo - 0.5 + (x - c.firstIndex + 0.5) / n;
  };
  const fromLogical = (l: number) => {
    const cs = candles();
    if (cs.length === 0) return l;
    const k = Math.max(0, Math.min(cs.length - 1, Math.round(l)));
    const c = cs[k];
    const n = c.lastIndex - c.firstIndex + 1;
    if (l > cs.length - 1) return c.lastIndex + (l - (cs.length - 1)) * n;
    if (l < 0) return c.firstIndex + l * n;
    return c.firstIndex + (l - k + 0.5) * n - 0.5;
  };
  return { toLogical, fromLogical };
}

export function PriceChart({ companyId, big = false }: { companyId: string; big?: boolean }) {
  const view = useGame((s) => s.view);
  const day = useGame((s) => s.day);
  const theme = useGame((s) => s.theme);
  const [tf, setTf] = useState<Timeframe>(big ? '1Y' : '6M');
  const [interval, setInterval_] = useState<Interval>('D');
  const [ema20On, setEma20] = useState(false);
  const [ma50On, setMa50] = useState(true);
  const [ma200On, setMa200] = useState(big);
  const [rsiOn, setRsi] = useState(false);
  const [signalsOn, setSignalsOn] = useState(() => loadJson<boolean>('mc.chartSignals', true));
  const [expanded, setExpanded] = useState(false);
  const [tool, setTool] = useState<Tool>('pan');
  const drawings = useDrawings(view, companyId);
  const el = useRef<HTMLDivElement>(null);
  const h = useRef<Handles | null>(null);
  const [api, setApi] = useState<{ chart: IChartApi; candle: ISeriesApi<'Candlestick'> } | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const mapping = useMemo(() => makeMapping(() => candlesRef.current), []);
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
    setApi({ chart, candle });
    last.current = null;
    return () => {
      chart.remove();
      h.current = null;
      setApi(null);
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
      hh.chart.panes()[1]?.setHeight(big ? 110 : 70);
    } else if (!rsiOn && hh.rsi) {
      hh.chart.removeSeries(hh.rsi);
      hh.rsi = null;
    }
    last.current = null;
  }, [rsiOn, view, theme, big]);

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
    const candles = interval === 'W' ? toWeekly(bars) : bars.map((bar, i) => ({ bar, firstIndex: i, lastIndex: i }));
    candlesRef.current = candles;
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

  // Signal helper: plain-language readings of the latest bar.
  const signals = useMemo(() => {
    if (!view || !signalsOn) return [];
    const bars = view.history(companyId);
    return chartSignals([...view.warmupCloses(companyId, 260), ...bars.map((b) => b.close)], bars.map((b) => b.volume));
  }, [view, companyId, day, signalsOn]);

  const toggleSignals = () => {
    setSignalsOn(!signalsOn);
    saveJson('mc.chartSignals', !signalsOn);
  };

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
      <div className={`mb-2 grid gap-1.5 ${big ? 'grid-cols-4 sm:max-w-md' : 'grid-cols-4'}`}>
        <Toggle on={ema20On} color={EMA20_COLOR} onClick={() => setEma20(!ema20On)} label="EMA20" tip="ค่าเฉลี่ยแบบถ่วงน้ำหนัก 20 วัน (ให้น้ำหนักราคาล่าสุดมากกว่า): ตามราคาไวที่สุด ใช้ดูแนวโน้มระยะสั้น" />
        <Toggle on={ma50On} color={MA50_COLOR} onClick={() => setMa50(!ma50On)} label="MA50" tip="ราคาเฉลี่ย 50 วัน: แนวโน้มระยะกลาง" />
        <Toggle on={ma200On} color={MA200_COLOR} onClick={() => setMa200(!ma200On)} label="MA200" tip="ราคาเฉลี่ย 200 วัน (เฉลี่ยธรรมดา ไม่ใช่ EMA): แนวโน้มระยะยาว เส้นจะเรียบและขยับช้ากว่าราคามาก" />
        <Toggle on={rsiOn} color={RSI_COLOR} onClick={() => setRsi(!rsiOn)} label="RSI" tip="RSI 14 วัน: เกิน 70 = ขึ้นแรงเกินไป ต่ำกว่า 30 = ลงแรงเกินไป" />
      </div>
      {big && (
        <div className="mb-2">
          <DrawingToolbar tool={tool} setTool={setTool} onClear={() => view && setDrawings(view, companyId, [])} count={drawings.length} />
        </div>
      )}
      <div className={`relative w-full ${big ? 'h-[52vh] min-h-72' : 'h-64'}`}>
        <div ref={el} className="absolute inset-0" />
        {api && view && (drawings.length > 0 || big) && (
          <ChartDrawings
            chart={api.chart}
            series={api.candle}
            drawings={drawings}
            onChange={big ? (d) => setDrawings(view, companyId, d) : undefined}
            tool={big ? tool : 'pan'}
            theme={theme}
            ohlcAt={(i) => candlesRef.current[i]?.bar}
            toLogical={mapping.toLogical}
            fromLogical={mapping.fromLogical}
          />
        )}
        {!big && (
          <button
            onClick={() => setExpanded(true)}
            className="absolute left-1.5 top-1.5 z-[3] flex h-7 items-center gap-1 rounded-xl border border-line bg-card-solid/90 px-2 text-xs font-semibold text-muted shadow-soft transition hover:text-ink"
            data-tip="เปิดกราฟใหญ่ พร้อมเครื่องมือตีเส้นแนวโน้ม แนวรับ–แนวต้าน และวัดระยะ"
          >
            ⤢ ขยาย · ตีเส้น
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button onClick={toggleSignals} className={`h-6 rounded-lg px-1.5 text-[11px] font-semibold transition ${signalsOn ? 'bg-accent-soft text-ink' : 'bg-soft text-muted'}`} data-tip="ตัวช่วยอ่านกราฟ: สรุปสิ่งที่กราฟบอกตอนนี้ (ไม่ใช่คำแนะนำให้ซื้อขาย)">
          💡 สัญญาณ{signalsOn ? '' : ' (ปิด)'}
        </button>
        {signals.map((s) => (
          <span key={s.id} data-tip={s.tip} className={`chip cursor-help text-[11px] ${s.tone === 'up' ? 'bg-up/10 text-up' : s.tone === 'down' ? 'bg-down/10 text-down' : 'bg-soft text-ink'}`}>
            {s.label}
          </span>
        ))}
      </div>
      {expanded && <BigChart companyId={companyId} onClose={() => setExpanded(false)} />}
    </div>
  );
}

/** Full-screen chart with drawing tools. */
function BigChart({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const view = useGame((s) => s.view);
  const run = useGame((s) => s.run);
  useGame((s) => s.day);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!view || !run) return null;
  const bars = view.history(companyId);
  const lastBar = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const change = lastBar && prev ? lastBar.close / prev.close - 1 : 0;
  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-2 backdrop-blur-[2px] sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card pop-in w-full max-w-6xl !bg-card-solid p-3 sm:p-5">
        <div className="mb-2 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg font-semibold">{run.disguisedNames[companyId]}</div>
            {lastBar && (
              <div className="text-sm">
                <b>{fmtPrice(lastBar.close)} ฿</b> <span className={toneClass(change)}>{pct(change, 2)}</span>
                <span className="ml-2 text-xs text-muted">เวลาในเกมยังเดินต่อถ้าไม่ได้กดหยุด</span>
              </div>
            )}
          </div>
          <button className="btn-soft !h-9 !w-9 !p-0" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>
        <PriceChart companyId={companyId} big />
        <p className="mt-2 text-xs text-muted">เส้นที่ตีไว้จะอยู่บนกราฟของหุ้นตัวนี้ตลอดรอบนี้ (เห็นในกราฟเล็กด้วย) · กด Esc เพื่อยกเลิกเส้นที่วาดค้าง หรือปิดหน้าต่าง</p>
      </div>
    </div>,
    document.body,
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
