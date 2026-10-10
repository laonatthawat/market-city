// Pure portfolio engine. All functions return new objects; nothing mutates.

export const FEE_RATE = 0.0015;

export interface Holding {
  companyId: string;
  shares: number;
  /** Total cost including buy fees, reduced proportionally on sells. */
  costBasis: number;
}

export interface Transaction {
  id: number;
  day: number;
  companyId: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  fee: number;
  /** Cash out (buy) or cash in (sell), fee included. */
  total: number;
  realizedPnl?: number;
}

export interface Portfolio {
  cash: number;
  holdings: Record<string, Holding>;
  transactions: Transaction[];
  realizedPnl: number;
  feesPaid: number;
}

export type TradeError = 'INVALID_QTY' | 'INVALID_PRICE' | 'INSUFFICIENT_CASH' | 'INSUFFICIENT_SHARES';

export type TradeResult = { ok: true; portfolio: Portfolio; tx: Transaction } | { ok: false; error: TradeError };

export interface TradeOrder {
  companyId: string;
  shares: number;
  price: number;
  day: number;
}

export function createPortfolio(cash: number): Portfolio {
  return { cash, holdings: {}, transactions: [], realizedPnl: 0, feesPaid: 0 };
}

export function feeFor(gross: number): number {
  return Math.round(gross * FEE_RATE * 100) / 100;
}

export function quote(side: 'buy' | 'sell', shares: number, price: number) {
  const gross = shares * price;
  const fee = feeFor(gross);
  return { gross, fee, total: side === 'buy' ? gross + fee : gross - fee };
}

/** Smallest share fraction for automatic (plan / DCA) purchases. */
export const SHARE_STEP = 0.0001;

/**
 * Largest number of shares affordable with `cash`, fees included.
 * Whole shares by default; `fractional` allows 0.0001-share steps (automatic DCA/plan buys).
 */
export function maxAffordableShares(cash: number, price: number, fractional = false): number {
  if (!(price > 0)) return 0;
  const step = fractional ? SHARE_STEP : 1;
  let n = Math.floor(cash / (price * (1 + FEE_RATE)) / step) * step;
  while (n > 0 && quote('buy', n, price).total > cash) n = Math.round((n - step) / step) * step;
  return Math.max(0, Number(n.toFixed(4)));
}

function validate(o: TradeOrder): TradeError | null {
  // Whole shares from the trade form; automatic buys may use 0.0001-share fractions.
  if (!Number.isFinite(o.shares) || o.shares <= 0 || Math.abs(o.shares * 10000 - Math.round(o.shares * 10000)) > 1e-6) return 'INVALID_QTY';
  if (!(o.price > 0) || !Number.isFinite(o.price)) return 'INVALID_PRICE';
  return null;
}

function nextId(p: Portfolio): number {
  return p.transactions.length ? p.transactions[p.transactions.length - 1].id + 1 : 1;
}

export function buy(p: Portfolio, o: TradeOrder): TradeResult {
  const err = validate(o);
  if (err) return { ok: false, error: err };
  const q = quote('buy', o.shares, o.price);
  if (q.total > p.cash + 1e-6) return { ok: false, error: 'INSUFFICIENT_CASH' };
  const prev = p.holdings[o.companyId];
  const holding: Holding = {
    companyId: o.companyId,
    shares: (prev?.shares ?? 0) + o.shares,
    costBasis: (prev?.costBasis ?? 0) + q.total,
  };
  const tx: Transaction = {
    id: nextId(p),
    day: o.day,
    companyId: o.companyId,
    side: 'buy',
    shares: o.shares,
    price: o.price,
    fee: q.fee,
    total: q.total,
  };
  return {
    ok: true,
    tx,
    portfolio: {
      ...p,
      cash: p.cash - q.total,
      holdings: { ...p.holdings, [o.companyId]: holding },
      transactions: [...p.transactions, tx],
      feesPaid: p.feesPaid + q.fee,
    },
  };
}

export function sell(p: Portfolio, o: TradeOrder): TradeResult {
  const err = validate(o);
  if (err) return { ok: false, error: err };
  const prev = p.holdings[o.companyId];
  if (!prev || prev.shares < o.shares) return { ok: false, error: 'INSUFFICIENT_SHARES' };
  const q = quote('sell', o.shares, o.price);
  const costOut = (prev.costBasis * o.shares) / prev.shares;
  const realized = q.total - costOut;
  const remaining = Number((prev.shares - o.shares).toFixed(4));
  const holdings = { ...p.holdings };
  if (remaining === 0) delete holdings[o.companyId];
  else holdings[o.companyId] = { ...prev, shares: remaining, costBasis: prev.costBasis - costOut };
  const tx: Transaction = {
    id: nextId(p),
    day: o.day,
    companyId: o.companyId,
    side: 'sell',
    shares: o.shares,
    price: o.price,
    fee: q.fee,
    total: q.total,
    realizedPnl: realized,
  };
  return {
    ok: true,
    tx,
    portfolio: {
      ...p,
      cash: p.cash + q.total,
      holdings,
      transactions: [...p.transactions, tx],
      realizedPnl: p.realizedPnl + realized,
      feesPaid: p.feesPaid + q.fee,
    },
  };
}

export function averageCost(h: Holding): number {
  return h.shares > 0 ? h.costBasis / h.shares : 0;
}

export function holdingsValue(p: Portfolio, priceOf: (companyId: string) => number | null): number {
  let v = 0;
  for (const h of Object.values(p.holdings)) {
    const price = priceOf(h.companyId);
    if (price != null) v += h.shares * price;
  }
  return v;
}

export function totalValue(p: Portfolio, priceOf: (companyId: string) => number | null): number {
  return p.cash + holdingsValue(p, priceOf);
}
