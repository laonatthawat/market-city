import { LineSeries, createChart, createSeriesMarkers } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, SeriesMarker, Time } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { useGame } from '../store/gameStore';
import type { EquityPoint } from '../store/gameStore';
import { chartOptions, cssVar, toTime } from './chartUtils';

export interface ChartMarker {
  day: number;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

/** Portfolio value vs the city index; optionally contributions (DCA) and decision markers. */
export function EquityChart({
  height = 150,
  reveal = false,
  markers,
  showContrib = false,
  mini = false,
}: {
  /** Sparkline style for the side panel: no axes, no value labels. */
  mini?: boolean;
  height?: number;
  reveal?: boolean;
  markers?: ChartMarker[];
  showContrib?: boolean;
}) {
  const view = useGame((s) => s.view);
  const theme = useGame((s) => s.theme);
  const run = useGame((s) => s.run);
  const data = useGame((s) => s.equity);
  const el = useRef<HTMLDivElement>(null);
  const h = useRef<{ chart: IChartApi; mine: ISeriesApi<'Line'>; index: ISeriesApi<'Line'>; contrib: ISeriesApi<'Line'> | null } | null>(null);
  const shown = useRef(0);

  useEffect(() => {
    if (!el.current || !view) return;
    const chart = createChart(el.current, {
      ...chartOptions(view.windowStartDate, reveal),
      handleScroll: false,
      handleScale: false,
    });
    if (mini) chart.applyOptions({ rightPriceScale: { visible: false }, timeScale: { visible: false }, grid: { horzLines: { visible: false }, vertLines: { visible: false } } });
    const priceFormat = { type: 'price' as const, precision: 0, minMove: 1 };
    const index = chart.addSeries(LineSeries, { priceFormat, color: cssVar('--lilac'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: mini ? '' : 'ดัชนี' });
    const contrib = showContrib
      ? chart.addSeries(LineSeries, { priceFormat, color: cssVar('--muted'), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, title: 'เงินที่ลงไป' })
      : null;
    const mine = chart.addSeries(LineSeries, { priceFormat, color: cssVar('--accent'), lineWidth: 2, priceLineVisible: false, lastValueVisible: !mini, title: mini ? '' : 'พอร์ต' });
    h.current = { chart, mine, index, contrib };
    shown.current = 0;
    return () => {
      chart.remove();
      h.current = null;
    };
  }, [view, theme, reveal, showContrib, mini]);

  useEffect(() => {
    const hh = h.current;
    if (!hh || !view || data.length === 0) return;
    const date = (d: number) => toTime(view.dateOf(d));
    const p = data[data.length - 1];
    if (shown.current > 0 && data.length === shown.current + 1) {
      hh.mine.update({ time: date(p.day), value: p.value });
      hh.index.update({ time: date(p.day), value: p.index });
    } else if (shown.current > 0 && data.length === shown.current) {
      // A trade on the same day replaces the last point.
      hh.mine.update({ time: date(p.day), value: p.value });
    } else {
      hh.mine.setData(data.map((q) => ({ time: date(q.day), value: q.value })));
      hh.index.setData(data.map((q) => ({ time: date(q.day), value: q.index })));
      if (hh.contrib && run) {
        let sum = run.startingCash;
        hh.contrib.setData(data.map((q: EquityPoint) => ({ time: date(q.day), value: (sum += q.contrib) })));
      }
    }
    shown.current = data.length;
    hh.chart.timeScale().fitContent();
  }, [data, view, theme, reveal, run, showContrib]);

  useEffect(() => {
    const hh = h.current;
    if (!hh || !view || !markers?.length) return;
    const colors = { good: cssVar('--up'), bad: cssVar('--down'), neutral: cssVar('--muted') };
    const list: SeriesMarker<Time>[] = [...markers]
      .sort((a, b) => a.day - b.day)
      .map((m) => ({ time: toTime(view.dateOf(m.day)), position: 'aboveBar', shape: 'circle', color: colors[m.tone], text: m.text }));
    const api = createSeriesMarkers(hh.mine, list);
    // The chart may already be removed (its effect cleans up first); detaching then would touch a disposed object.
    return () => {
      if (h.current === hh) api.detach();
    };
  }, [markers, view, theme, reveal, showContrib]);

  return <div ref={el} style={{ height }} className="w-full" />;
}
