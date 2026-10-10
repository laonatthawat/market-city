import { buy, maxAffordableShares, sell, totalValue } from '../portfolio';
import type { Portfolio } from '../portfolio';
import type { OptionAction } from './types';

export type PriceOf = (companyId: string) => number | null;

function tryBuy(p: Portfolio, companyId: string, amount: number, price: number | null, day: number): Portfolio {
  if (!price || amount <= 0) return p;
  const shares = maxAffordableShares(Math.min(amount, p.cash), price, true);
  if (shares <= 0) return p;
  const r = buy(p, { companyId, shares, price, day });
  return r.ok ? r.portfolio : p;
}

function trySell(p: Portfolio, companyId: string, shares: number, price: number | null, day: number): Portfolio {
  if (!price || shares <= 0) return p;
  const r = sell(p, { companyId, shares: Math.min(shares, p.holdings[companyId]?.shares ?? 0), price, day });
  return r.ok ? r.portfolio : p;
}

function sellFraction(p: Portfolio, companyId: string, fraction: number, priceOf: PriceOf, day: number): Portfolio {
  const h = p.holdings[companyId];
  if (!h) return p;
  const shares = fraction >= 1 ? h.shares : Math.max(Math.min(1, h.shares), Number((h.shares * fraction).toFixed(4)));
  return trySell(p, companyId, shares, priceOf(companyId), day);
}

function buyBasket(p: Portfolio, ids: string[], amount: number, priceOf: PriceOf, day: number): Portfolio {
  if (ids.length === 0) return p;
  const per = Math.min(amount, p.cash) / ids.length;
  let out = p;
  for (const id of ids) out = tryBuy(out, id, per, priceOf(id), day);
  return out;
}

/** Applies an option to a portfolio at the given day's prices. Never throws; impossible trades are skipped. */
export function applyAction(p: Portfolio, action: OptionAction, priceOf: PriceOf, day: number): Portfolio {
  switch (action.kind) {
    case 'hold':
      return p;
    case 'buy_more':
      return tryBuy(p, action.companyId, action.amount, priceOf(action.companyId), day);
    case 'trim':
      return sellFraction(p, action.companyId, action.fraction, priceOf, day);
    case 'sell_all':
      return sellFraction(p, action.companyId, 1, priceOf, day);
    case 'rebalance': {
      const h = p.holdings[action.companyId];
      const px = priceOf(action.companyId);
      if (!h || !px) return p;
      const total = totalValue(p, priceOf);
      const excess = h.shares * px - action.targetWeight * total;
      return excess > 0 ? trySell(p, action.companyId, Math.ceil(excess / px), px, day) : p;
    }
    case 'buy_basket':
      return buyBasket(p, action.companyIds, action.amount, priceOf, day);
    case 'sell_fraction_all': {
      let out = p;
      for (const id of Object.keys(p.holdings)) out = sellFraction(out, id, action.fraction, priceOf, day);
      return out;
    }
    case 'multi':
      return action.actions.reduce((acc, a) => applyAction(acc, a, priceOf, day), p);
    case 'dca_basket':
      return buyBasket(p, action.companyIds, action.total / action.parts, priceOf, day);
    case 'rotate': {
      let out = p;
      for (const id of action.sellIds) out = sellFraction(out, id, action.sellFraction, priceOf, day);
      const freed = out.cash - p.cash;
      return buyBasket(out, action.buyIds, freed, priceOf, day);
    }
  }
}

/** Does this action actually change anything for the given portfolio? */
export function isActionable(p: Portfolio, action: OptionAction, priceOf: PriceOf): boolean {
  if (action.kind === 'hold') return true;
  const after = applyAction(p, action, priceOf, 0);
  return after !== p && after.transactions.length > p.transactions.length;
}

/** Later instalments of a scheduled action (empty for one-shot actions). */
export function scheduledParts(action: OptionAction, startDay: number): { day: number; action: OptionAction }[] {
  if (action.kind === 'multi') return action.actions.flatMap((a) => scheduledParts(a, startDay));
  if (action.kind !== 'dca_basket') return [];
  const out: { day: number; action: OptionAction }[] = [];
  for (let k = 1; k < action.parts; k++) {
    out.push({ day: startDay + k * action.everyDays, action: { kind: 'buy_basket', companyIds: action.companyIds, amount: action.total / action.parts } });
  }
  return out;
}
