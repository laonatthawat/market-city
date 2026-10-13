import { CandlestickSeries, HistogramSeries, LineSeries, createChart, createSeriesMarkers } from 'lightweight-charts';
import type { CandlestickData, IChartApi, ISeriesApi, LineData, SeriesMarker, Time } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import type { Annotation, Indicator, Tone } from '../data/chartLessons';
import { ema, rsi, sma } from '../engine/indicators';
import { annotationLine, barIndex, loadLessonBars } from '../engine/lessonData';
import type { PriceBar } from '../engine/types';
import { useGame } from '../store/gameStore';
import { ChartDrawings } from './ChartDrawings';
import type { Drawing, Tool } from './ChartDrawings';
import { chartOptions, cssVar, toTime } from './chartUtils';

export const IND_STYLE = {
  ema20: { color: '#23a77a', label: 'EMA20' },
  ma50: { color: '#f2a03d', label: 'MA50' },
  ma200: { color: '#7c6ce0', label: 'MA200' },
  rsi: { color: '#3b9ede', label: 'RSI' },
  volume: { color: '#9a90a8', label: 'Volume' },
} as const;

export interface HistorySpec {
  ticker: string;
  from: string;
  to: string;
  indicators?: Indicator[];
  annotations?: Annotation[];
}

export interface PriceLineSpec {
  price: number;
  tone: Tone;
  label: string;
}

const toneVar = (t: Tone | undefined) => cssVar(t === 'up' ? '--up' : t === 'down' ? '--down' : '--accent');

/**
 * A window of real daily history with annotations, optional indicator panes, price lines and
 * drawing tools. `hideDates` anonymises the time axis (for guessing games).
 */
export function HistoryChart({
  spec,
  hideDates = false,
  lines = [],
  onClickPrice,
  tool = 'pan',
  drawings,
  onDrawings,
  className = 'h-60 sm:h-72',
}: {
  spec: HistorySpec;
  hideDates?: boolean;
  lines?: PriceLineSpec[];
  onClickPrice?: (price: number) => void;
  tool?: Tool;
  drawings?: Drawing[];
  onDrawings?: (d: Drawing[]) => void;
  className?: string;
}) {
  const theme = useGame((s) => s.theme);
  const el = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [api, setApi] = useState<{ chart: IChartApi; candle: ISeriesApi<'Candlestick'>; bars: PriceBar[] } | null>(null);
  const clickRef = useRef(onClickPrice);
  clickRef.current = onClickPrice;
  const key = JSON.stringify(spec);

  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    setState('loading');
    setApi(null);
    loadLessonBars(spec.ticker).then(
      (all) => {
        if (cancelled || !el.current) return;
        const i0 = barIndex(all, spec.from);
        const i1 = barIndex(all, spec.to);
        if (i0 < 0 || i1 < i0) {
          setState('error');
          return;
        }
        const bars = all.slice(i0, i1 + 1);
        const chart = createChart(el.current, { ...chartOptions(spec.from, !hideDates), handleScroll: false, handleScale: false });
        const up = cssVar('--up');
        const down = cssVar('--down');
        const notes = spec.annotations ?? [];
        const focus = notes.find((a) => a.kind === 'focus');
        const inFocus = (d: string) => !focus || (d >= focus.from && d <= (focus.to ?? focus.from));
        const candle = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false, lastValueVisible: false });
        candle.setData(
          bars.map((b): CandlestickData<Time> => {
            const c = (b.close >= b.open ? up : down) + (inFocus(b.date) ? '' : '38');
            return { time: toTime(b.date), open: b.open, high: b.high, low: b.low, close: b.close, color: c, wickColor: c };
          }),
        );
        const ind = spec.indicators ?? [];
        if (ind.includes('volume')) {
          const vol = chart.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
          vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
          candle.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.24 } });
          vol.setData(bars.map((b) => ({ time: toTime(b.date), value: b.volume, color: (b.close >= b.open ? up : down) + '66' })));
        }
        // Indicators use the full history, so they are warmed up at the left edge.
        const closes = all.map((b) => b.close);
        const lineOpts = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
        const plot = (vals: (number | null)[], color: string, pane = 0) => {
          const s = chart.addSeries(LineSeries, { ...lineOpts, color }, pane);
          s.setData(bars.flatMap((b, k): LineData<Time>[] => (vals[i0 + k] == null ? [] : [{ time: toTime(b.date), value: vals[i0 + k]! }])));
          return s;
        };
        if (ind.includes('ema20')) plot(ema(closes, 20), IND_STYLE.ema20.color);
        if (ind.includes('ma50')) plot(sma(closes, 50), IND_STYLE.ma50.color);
        if (ind.includes('ma200')) plot(sma(closes, 200), IND_STYLE.ma200.color);
        if (ind.includes('rsi')) {
          const r = plot(rsi(closes, 14), IND_STYLE.rsi.color, 1);
          r.createPriceLine({ price: 70, color: down, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
          r.createPriceLine({ price: 30, color: up, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
          chart.panes()[1]?.setHeight(80);
        }
        for (const a of notes) {
          const pts = annotationLine(all, a);
          if (!pts || (a.kind !== 'trend' && a.kind !== 'level')) continue;
          const s = chart.addSeries(LineSeries, { ...lineOpts, color: toneVar(a.tone), lineStyle: a.kind === 'level' ? 2 : 0, pointMarkersVisible: a.kind === 'trend' });
          s.setData(pts.map((p) => ({ time: toTime(p.date), value: p.value })));
        }
        const markers: SeriesMarker<Time>[] = notes
          .filter((a) => a.kind === 'mark')
          .map((a) => ({
            time: toTime(a.date),
            position: a.pos === 'below' ? 'belowBar' : 'aboveBar',
            shape: a.text === '?' ? 'circle' : a.pos === 'below' ? 'arrowUp' : 'arrowDown',
            color: toneVar(a.tone),
            text: a.text,
            size: 1.4,
          }));
        markers.sort((x, y) => (x.time as number) - (y.time as number));
        createSeriesMarkers(candle, markers);
        chart.timeScale().fitContent();
        chart.subscribeClick((p) => {
          if (!clickRef.current || !p.point) return;
          const price = candle.coordinateToPrice(p.point.y);
          if (price != null && p.paneIndex === 0) clickRef.current(price);
        });
        dispose = () => chart.remove();
        setApi({ chart, candle, bars });
        setState('ready');
      },
      () => !cancelled && setState('error'),
    );
    return () => {
      cancelled = true;
      dispose();
    };
  }, [key, theme, hideDates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Price lines (guess / answer markers) come and go without rebuilding the chart.
  const linesKey = JSON.stringify(lines);
  useEffect(() => {
    if (!api) return;
    const made = lines.map((l) => api.candle.createPriceLine({ price: l.price, color: toneVar(l.tone), lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: l.label }));
    return () => made.forEach((m) => api.candle.removePriceLine(m));
  }, [api, linesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative w-full rounded-2xl bg-soft/40 ${className} ${onClickPrice ? 'cursor-crosshair' : ''}`}>
      <div ref={el} className="absolute inset-0" />
      {api && drawings && (
        <ChartDrawings
          chart={api.chart}
          series={api.candle}
          drawings={drawings}
          onChange={onDrawings}
          tool={tool}
          theme={theme}
          ohlcAt={(i) => api.bars[i]}
        />
      )}
      {state !== 'ready' && <div className="absolute inset-0 grid place-items-center text-sm text-muted">{state === 'loading' ? 'กำลังโหลดกราฟ…' : 'โหลดข้อมูลกราฟไม่สำเร็จ ลองใหม่อีกครั้ง'}</div>}
    </div>
  );
}

/** Colour key for the indicators shown on a chart. */
export function IndicatorLegend({ indicators }: { indicators?: Indicator[] }) {
  const shown = (indicators ?? []).filter((k) => k !== 'volume');
  if (shown.length === 0) return null;
  return (
    <div className="mt-1 flex gap-3 text-xs text-muted">
      {shown.map((k) => (
        <span key={k} className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: IND_STYLE[k].color }} />
          {IND_STYLE[k].label}
        </span>
      ))}
    </div>
  );
}
