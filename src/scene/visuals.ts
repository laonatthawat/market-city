import { Color } from 'three';
import type { CompanySnapshot } from '../engine/MarketView';
import type { SectorId } from '../engine/types';
import { SECTORS } from '../data/sectors';

export const FLOOR_H = 0.7;
export const MAX_HEIGHT = 34;
export const MAX_FLOORS = Math.ceil(MAX_HEIGHT / FLOOR_H) + 1;
export const PLAYER_COLOR = '#ff4f8b';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Height = market cap (log scale so small and huge companies both fit). */
export function heightFromCap(marketCap: number): number {
  return clamp(1.5 + 7 * Math.log10(Math.max(marketCap, 1) / 3e10), 1.4, MAX_HEIGHT);
}

/** Footprint = revenue. */
export function widthFromRevenue(revenue: number): number {
  return clamp(1.6 + 0.75 * Math.log10(Math.max(revenue, 1) / 1e10), 1.6, 4.3);
}

const CHEAP = new Color('#78aeea');
const FAIR = new Color('#f4ecdc');
const RICH = new Color('#f3945a');
const LOSS = new Color('#b4a6b4');

/** Valuation tint: cool blue (cheap P/E) → cream → warm orange (expensive). */
export function valuationColor(pe: number | null, out: Color): Color {
  if (pe == null || pe <= 0) return out.copy(LOSS);
  const t = Math.log(pe);
  const t10 = Math.log(10);
  const t20 = Math.log(20);
  const t45 = Math.log(45);
  if (t <= t20) return out.copy(CHEAP).lerp(FAIR, clamp((t - t10) / (t20 - t10), 0, 1));
  return out.copy(FAIR).lerp(RICH, clamp((t - t20) / (t45 - t20), 0, 1));
}

const DIM = new Color('#3b4054');
const MID = new Color('#c9bd8c');
const BRIGHT = new Color('#fff3a6');

/** Window light: bright in an uptrend, dim in a downtrend. */
export function windowColor(momentum: number, out: Color): Color {
  if (momentum >= 0) return out.copy(MID).lerp(BRIGHT, clamp(momentum / 0.12, 0, 1));
  return out.copy(MID).lerp(DIM, clamp(-momentum / 0.12, 0, 1));
}

const tmp = new Color();
export function bodyColor(sector: SectorId, pe: number | null, out: Color): Color {
  out.set(SECTORS[sector].color);
  return out.lerp(valuationColor(pe, tmp), 0.62);
}

export function needsScaffold(s: CompanySnapshot, sector: SectorId): boolean {
  const deLimit = sector === 'finance' ? 10 : sector === 'realestate' ? 3 : 2;
  return s.epsFalling || s.debtToEquity > deLimit;
}
