import type { Company, FundamentalsSnapshot, FundamentalsYear } from '../types';

/** Annual results are assumed public ~2 months after fiscal year end. */
export function reportDateOf(year: number): string {
  return `${year + 1}-03-01`;
}

/** Latest fiscal year already reported on `date`; falls back to the earliest year. */
export function reportedYears(company: Company, date: string): FundamentalsYear[] {
  const f = company.fundamentals;
  if (f.length === 0) return [];
  let n = 0;
  while (n < f.length && reportDateOf(f[n].year) <= date) n++;
  return f.slice(0, Math.max(1, n));
}

export function fundamentalsAt(
  company: Company,
  date: string,
  price: number,
): FundamentalsSnapshot | null {
  const years = reportedYears(company, date);
  if (years.length === 0) return null;
  const cur = years[years.length - 1];
  const prev = years.length > 1 ? years[years.length - 2] : null;
  const shares = company.sharesOutstanding;
  const eps = cur.netIncome / shares;
  const bvps = cur.equity / shares;
  return {
    fiscalYear: cur.year,
    price,
    marketCap: price * shares,
    revenue: cur.revenue,
    netIncome: cur.netIncome,
    eps,
    pe: eps > 0 ? price / eps : null,
    pb: bvps > 0 ? price / bvps : null,
    revenueGrowth: prev && prev.revenue > 0 ? cur.revenue / prev.revenue - 1 : null,
    netMargin: cur.revenue > 0 ? cur.netIncome / cur.revenue : 0,
    debtToEquity: cur.debtToEquity,
    dividendYield: price > 0 ? cur.dividendPerShare / price : 0,
    epsTrend: years.slice(-4).map((y) => ({ year: y.year, eps: y.netIncome / shares })),
    approximate: true,
  };
}
