import { ColorType, CrosshairMode, TickMarkType } from 'lightweight-charts';
import type { DeepPartial, ChartOptions, Time, UTCTimestamp } from 'lightweight-charts';
import { formatAnonDay, formatAnonTick } from '../engine/anonDate';
import { price } from '../lib/format';

export function toTime(iso: string): UTCTimestamp {
  return (Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 1000) as UTCTimestamp;
}

function timeToIso(t: Time): string {
  if (typeof t === 'number') return new Date(t * 1000).toISOString().slice(0, 10);
  if (typeof t === 'string') return t;
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Base chart options: theme colors plus anonymized time labels. */
export function chartOptions(windowStartIso: string, reveal = false): DeepPartial<ChartOptions> {
  const ink = cssVar('--ink');
  const muted = cssVar('--muted');
  const line = cssVar('--line');
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: muted,
      fontFamily: "'IBM Plex Sans Thai', system-ui, sans-serif",
      fontSize: 11,
      attributionLogo: false,
      panes: { separatorColor: line, separatorHoverColor: line },
    },
    grid: { vertLines: { visible: false }, horzLines: { color: line } },
    rightPriceScale: { borderVisible: false },
    timeScale: {
      borderVisible: false,
      rightOffset: 3,
      tickMarkFormatter: (t: Time, type: TickMarkType) => {
        const iso = timeToIso(t);
        // Day ticks show just the day number; month/year ticks show the (anonymized) month.
        if (type === TickMarkType.DayOfMonth) return String(Number(iso.slice(8, 10)));
        return reveal ? iso.slice(0, 7) : formatAnonTick(iso, windowStartIso);
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: muted, labelBackgroundColor: ink },
      horzLine: { color: muted, labelBackgroundColor: ink },
    },
    localization: {
      locale: 'th-TH',
      timeFormatter: (t: Time) => (reveal ? timeToIso(t) : formatAnonDay(timeToIso(t), windowStartIso)),
      priceFormatter: (p: number) => price(p),
    },
    handleScale: { axisPressedMouseMove: { time: true, price: false } },
  };
}
