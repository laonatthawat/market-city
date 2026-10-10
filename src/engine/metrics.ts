/** Largest peak-to-trough decline as a positive fraction (0.25 = -25%). */
export function maxDrawdown(values: readonly number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.max(worst, 1 - v / peak);
  }
  return worst;
}

export function totalReturn(start: number, end: number): number {
  return start > 0 ? end / start - 1 : 0;
}

/** Herfindahl-based diversification score in [0, 1] (1 = perfectly spread). */
export function diversificationScore(weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || weights.length === 0) return 0;
  const hhi = weights.reduce((a, w) => a + (w / total) ** 2, 0);
  if (weights.length === 1) return 0;
  return (1 - hhi) / (1 - 1 / weights.length);
}
