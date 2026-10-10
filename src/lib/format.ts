const thb0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const thb2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 });

/** "1,234,567 ฿" (no decimals when large). */
export function baht(x: number, decimals?: number): string {
  if (!Number.isFinite(x)) return '–';
  const fmt = decimals === 2 || (decimals === undefined && Math.abs(x) < 1000) ? thb2 : thb0;
  return `${fmt.format(x)} ฿`;
}

export function signedBaht(x: number): string {
  if (!Number.isFinite(x)) return '–';
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${baht(Math.abs(x))}`;
}

export function price(x: number): string {
  return Number.isFinite(x) ? thb2.format(x) : '–';
}

export function shares(x: number): string {
  return int.format(x);
}

export function pct(x: number | null | undefined, digits = 2, signed = true): string {
  if (x == null || !Number.isFinite(x)) return '–';
  const s = (Math.abs(x) * 100).toFixed(digits);
  return `${signed ? (x > 0 ? '+' : x < 0 ? '−' : '') : x < 0 ? '−' : ''}${s}%`;
}

/** Large THB amounts in Thai units: พันล้าน / ล้านล้าน. */
export function bigBaht(x: number): string {
  if (!Number.isFinite(x)) return '–';
  const a = Math.abs(x);
  const sign = x < 0 ? '−' : '';
  if (a >= 1e12) return `${sign}${(a / 1e12).toLocaleString('th-TH', { maximumFractionDigits: 2 })} ล้านล้าน ฿`;
  if (a >= 1e9) return `${sign}${(a / 1e9).toLocaleString('th-TH', { maximumFractionDigits: 1 })} พันล้าน ฿`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toLocaleString('th-TH', { maximumFractionDigits: 1 })} ล้าน ฿`;
  return `${sign}${thb0.format(a)} ฿`;
}

export function ratio(x: number | null | undefined, digits = 1): string {
  return x == null || !Number.isFinite(x) ? '–' : `${x.toFixed(digits)} เท่า`;
}

/** Real date for the reveal screen, e.g. "14 มี.ค. 2563" (Buddhist era). */
export function thaiDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function toneClass(x: number): string {
  return x > 0 ? 'text-up' : x < 0 ? 'text-down' : 'text-muted';
}
