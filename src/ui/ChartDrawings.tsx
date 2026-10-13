import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { price as fmtPrice } from '../lib/format';
import { cssVar } from './chartUtils';

/**
 * Drawing tools over a lightweight-charts chart: horizontal lines, trend lines, zones and a
 * measuring box. Drawings live in data space (x = bar position, p = price) so they stay put when
 * the chart scrolls or zooms; a canvas overlay re-projects them every frame.
 */

/** x is a bar position in the caller's own units (e.g. daily index); `toLogical` maps it onto the chart. */
export interface Pt {
  x: number;
  p: number;
}
export type DrawingKind = 'hline' | 'trend' | 'zone' | 'measure';
export interface Drawing {
  id: string;
  kind: DrawingKind;
  a: Pt;
  b: Pt;
}
export type Tool = 'pan' | DrawingKind | 'erase';

export const TOOLS: { id: Tool; icon: string; label: string; tip: string }[] = [
  { id: 'pan', icon: '✋', label: 'เลื่อน', tip: 'เลื่อน/ซูมกราฟตามปกติ' },
  { id: 'hline', icon: '➖', label: 'แนวนอน', tip: 'คลิก 1 ครั้ง: ลากเส้นแนวนอน ใช้ตีแนวรับ–แนวต้าน' },
  { id: 'trend', icon: '📐', label: 'แนวโน้ม', tip: 'ลาก (หรือคลิก 2 จุด): เส้นแนวโน้ม ต่อเส้นไปทางขวาให้อัตโนมัติ' },
  { id: 'zone', icon: '▭', label: 'โซน', tip: 'ลากเป็นกรอบ: ใช้ตีโซนแนวรับ–แนวต้าน หรือกรอบไซด์เวย์' },
  { id: 'measure', icon: '📏', label: 'วัด', tip: 'ลากจากจุดหนึ่งไปอีกจุด: บอกว่าราคาเปลี่ยนไปกี่ % ในกี่แท่ง' },
  { id: 'erase', icon: '🧽', label: 'ลบ', tip: 'คลิกที่เส้นเพื่อลบ' },
];

interface Props {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  drawings: Drawing[];
  onChange?: (d: Drawing[]) => void;
  tool: Tool;
  /** OHLC of the candle at a logical index, for snapping to prices (magnet). */
  ohlcAt?: (logical: number) => { open: number; high: number; low: number; close: number } | undefined;
  toLogical?: (x: number) => number;
  fromLogical?: (l: number) => number;
  /** Draws are re-done after a theme change. */
  theme?: string;
}

const same = (x: number) => x;
let seq = 0;

export function ChartDrawings({ chart, series, drawings, onChange, tool, ohlcAt, toLogical = same, fromLogical = same, theme }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const pending = useRef<{ d: Drawing; downAt: { x: number; y: number }; dragged: boolean } | null>(null);
  const live = useRef({ drawings, draft, toLogical, fromLogical });
  live.current = { drawings, draft, toLogical, fromLogical };

  // Cancel a half-drawn shape when the tool changes or Escape is pressed.
  useEffect(() => {
    pending.current = null;
    setDraft(null);
  }, [tool]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pending.current) {
        e.stopPropagation();
        pending.current = null;
        setDraft(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Projection helpers (pixel space of the main pane).
  const px = (pt: Pt) => {
    const x = logicalX(chart, live.current.toLogical(pt.x));
    const y = series.priceToCoordinate(pt.p);
    return x == null || y == null ? null : { x, y };
  };

  // Redraw every frame: cheap (a handful of lines) and always in sync with scrolling and autoscale.
  useEffect(() => {
    let raf = 0;
    const colors = {
      ink: cssVar('--ink'),
      accent: cssVar('--accent'),
      up: cssVar('--up'),
      down: cssVar('--down'),
      lilac: cssVar('--lilac'),
      card: cssVar('--card-solid'),
    };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const w = chart.timeScale().width();
      const h = chart.panes()[0]?.getHeight() ?? c.clientHeight;
      const W = Math.round(w * dpr);
      const H = Math.round(h * dpr);
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      const g = c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.font = "600 11px 'IBM Plex Sans Thai', system-ui, sans-serif";
      const all = live.current.draft ? [...live.current.drawings, live.current.draft] : live.current.drawings;
      for (const d of all) paint(g, d, w, colors);
    };
    const paint = (g: CanvasRenderingContext2D, d: Drawing, w: number, col: typeof colors) => {
      const a = px(d.a);
      const b = px(d.b);
      if (d.kind === 'hline') {
        const y = series.priceToCoordinate(d.a.p);
        if (y == null) return;
        g.strokeStyle = col.accent;
        g.lineWidth = 1.5;
        g.setLineDash([]);
        line(g, 0, y, w, y);
        label(g, fmtPrice(d.a.p), w - 4, y - 4, col.accent, 'right');
        return;
      }
      if (!a || !b) return;
      if (d.kind === 'trend') {
        g.strokeStyle = col.lilac;
        g.lineWidth = 2;
        g.setLineDash([]);
        line(g, a.x, a.y, b.x, b.y);
        // Extend to the right edge, dashed.
        if (Math.abs(b.x - a.x) > 1) {
          const k = (b.y - a.y) / (b.x - a.x);
          const x2 = b.x >= a.x ? w : 0;
          g.setLineDash([5, 4]);
          line(g, b.x, b.y, x2, b.y + k * (x2 - b.x));
          g.setLineDash([]);
        }
        dot(g, a.x, a.y, col.lilac);
        dot(g, b.x, b.y, col.lilac);
        return;
      }
      const x0 = Math.min(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const rw = Math.abs(b.x - a.x);
      const rh = Math.abs(b.y - a.y);
      if (d.kind === 'zone') {
        g.fillStyle = hexA(col.lilac, 0.18);
        g.fillRect(x0, y0, rw, rh);
        g.strokeStyle = hexA(col.lilac, 0.8);
        g.lineWidth = 1;
        g.strokeRect(x0, y0, rw, rh);
        return;
      }
      // measure
      const change = d.b.p / d.a.p - 1;
      const tone = change >= 0 ? col.up : col.down;
      g.fillStyle = hexA(tone, 0.14);
      g.fillRect(x0, y0, rw, rh);
      g.strokeStyle = tone;
      g.lineWidth = 1.5;
      line(g, a.x, a.y, b.x, b.y);
      const bars = Math.round(Math.abs(d.b.x - d.a.x));
      const text = `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}% · ${bars} แท่ง`;
      const ty = change >= 0 ? y0 - 6 : y0 + rh + 15;
      label(g, text, x0 + rw / 2, ty, tone, 'center', col.card);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [chart, series, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Pointer input -------------------------------------------------------------------------
  const toPt = (e: React.PointerEvent, snap: boolean): Pt | null => {
    const r = canvas.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let logical = chart.timeScale().coordinateToLogical(x) as number | null;
    let p = series.coordinateToPrice(y) as number | null;
    if (logical == null || p == null) return null;
    if (snap && ohlcAt) {
      // Magnet: snap to the nearest open/high/low/close of the candle under the cursor.
      const i = Math.round(logical);
      const bar = ohlcAt(i);
      if (bar) {
        let best: number | null = null;
        let bestD = 12;
        for (const v of [bar.open, bar.high, bar.low, bar.close]) {
          const vy = series.priceToCoordinate(v);
          if (vy != null && Math.abs(vy - y) < bestD) {
            bestD = Math.abs(vy - y);
            best = v;
          }
        }
        if (best != null) {
          p = best;
          logical = i;
        }
      }
    }
    return { x: live.current.fromLogical(logical), p };
  };

  const hit = (e: React.PointerEvent): string | null => {
    const r = canvas.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const w = chart.timeScale().width();
    let best: string | null = null;
    let bestD = 9;
    for (const d of drawings) {
      let dist = Infinity;
      if (d.kind === 'hline') {
        const y = series.priceToCoordinate(d.a.p);
        if (y != null) dist = Math.abs(y - my);
      } else {
        const a = px(d.a);
        const b = px(d.b);
        if (!a || !b) continue;
        if (d.kind === 'trend') {
          const k = Math.abs(b.x - a.x) > 1 ? (b.y - a.y) / (b.x - a.x) : 0;
          const x2 = b.x >= a.x ? w : 0;
          dist = Math.min(segDist(mx, my, a.x, a.y, b.x, b.y), segDist(mx, my, b.x, b.y, x2, b.y + k * (x2 - b.x)));
        } else {
          const inside = mx >= Math.min(a.x, b.x) && mx <= Math.max(a.x, b.x) && my >= Math.min(a.y, b.y) && my <= Math.max(a.y, b.y);
          dist = inside ? 0 : Infinity;
        }
      }
      if (dist < bestD) {
        bestD = dist;
        best = d.id;
      }
    }
    return best;
  };

  const onDown = (e: React.PointerEvent) => {
    if (tool === 'pan' || !onChange) return;
    e.preventDefault();
    if (tool === 'erase') {
      const id = hit(e);
      if (id) onChange(drawings.filter((d) => d.id !== id));
      return;
    }
    const pt = toPt(e, true);
    if (!pt) return;
    if (tool === 'hline') {
      onChange([...drawings, { id: `d${++seq}`, kind: 'hline', a: pt, b: pt }]);
      return;
    }
    // Second click of a two-click shape.
    if (pending.current && !pending.current.dragged) {
      const d = { ...pending.current.d, b: pt };
      pending.current = null;
      setDraft(null);
      onChange([...drawings, d]);
      return;
    }
    canvas.current!.setPointerCapture(e.pointerId);
    const d: Drawing = { id: `d${++seq}`, kind: tool, a: pt, b: pt };
    pending.current = { d, downAt: { x: e.clientX, y: e.clientY }, dragged: false };
    setDraft(d);
  };
  const onMove = (e: React.PointerEvent) => {
    const pend = pending.current;
    if (!pend) return;
    const pt = toPt(e, tool !== 'zone');
    if (!pt) return;
    if (Math.hypot(e.clientX - pend.downAt.x, e.clientY - pend.downAt.y) > 5 && e.buttons) pend.dragged = true;
    pend.d = { ...pend.d, b: pt };
    setDraft(pend.d);
  };
  const onUp = () => {
    const pend = pending.current;
    if (!pend || !pend.dragged) return; // a click: wait for the second point
    pending.current = null;
    setDraft(null);
    onChange?.([...drawings, pend.d]);
  };

  const active = tool !== 'pan' && !!onChange;
  return (
    <canvas
      ref={canvas}
      className="absolute left-0 top-0 z-[2] touch-none"
      style={{ pointerEvents: active ? 'auto' : 'none', cursor: tool === 'erase' ? 'pointer' : active ? 'crosshair' : undefined }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    />
  );
}

/** Tool buttons plus "clear all". */
export function DrawingToolbar({ tool, setTool, onClear, count }: { tool: Tool; setTool: (t: Tool) => void; onClear: () => void; count: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          data-tip={t.tip}
          className={`flex h-8 items-center gap-1 rounded-xl border px-2 text-xs font-semibold transition ${tool === t.id ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-card-solid text-muted hover:text-ink'}`}
        >
          <span>{t.icon}</span>
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
      <button onClick={onClear} disabled={count === 0} className="ml-auto h-8 rounded-xl border border-line px-2 text-xs font-semibold text-muted transition enabled:hover:text-down disabled:opacity-40" data-tip="ลบเส้นทั้งหมดบนกราฟนี้">
        🗑️ ล้าง
      </button>
    </div>
  );
}

/** Pixel x of a (possibly fractional) logical index: the library only maps whole bars, so interpolate. */
function logicalX(chart: IChartApi, l: number): number | null {
  const ts = chart.timeScale();
  const i = Math.floor(l);
  const x0 = ts.logicalToCoordinate(i as never);
  if (x0 == null || l === i) return x0;
  const x1 = ts.logicalToCoordinate((i + 1) as never);
  return x1 == null ? x0 : x0 + (x1 - x0) * (l - i);
}

function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}
function dot(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, 3.5, 0, Math.PI * 2);
  g.fill();
}
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign, bg?: string) {
  g.textAlign = align;
  if (bg) {
    const m = g.measureText(text).width;
    const left = align === 'center' ? x - m / 2 : align === 'right' ? x - m : x;
    g.fillStyle = hexA(bg, 0.9);
    g.fillRect(left - 4, y - 11, m + 8, 15);
  }
  g.fillStyle = color;
  g.fillText(text, x, y);
}
function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
/** "#rrggbb" + alpha → rgba(). Falls back to the input for other formats. */
function hexA(hex: string, a: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
