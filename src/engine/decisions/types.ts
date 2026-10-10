import type { Day } from '../types';

export type DecisionType =
  | 'holding_drop'
  | 'holding_gain'
  | 'concentration'
  | 'earnings_gap'
  | 'index_streak'
  | 'index_correction'
  | 'new_high'
  | 'new_low'
  | 'cash_drag'
  | 'event'
  | 'scripted';

/** What an option does to the portfolio. Amounts are THB. */
export type OptionAction =
  | { kind: 'hold' }
  | { kind: 'buy_more'; companyId: string; amount: number }
  | { kind: 'trim'; companyId: string; fraction: number }
  | { kind: 'sell_all'; companyId: string }
  | { kind: 'rebalance'; companyId: string; targetWeight: number }
  | { kind: 'buy_basket'; companyIds: string[]; amount: number }
  | { kind: 'sell_fraction_all'; fraction: number }
  | { kind: 'rotate'; sellIds: string[]; sellFraction: number; buyIds: string[] }
  /** Invest `total` in equal parts every `everyDays` trading days (first part immediately). */
  | { kind: 'dca_basket'; companyIds: string[]; total: number; parts: number; everyDays: number }
  | { kind: 'multi'; actions: OptionAction[] };

export type OptionStyle = 'buy' | 'hold' | 'sell' | 'rebalance';

export interface DecisionOption {
  id: string;
  label: string;
  detail: string;
  style: OptionStyle;
  action: OptionAction;
}

export interface DecisionFact {
  label: string;
  value: string;
  tone?: number;
}

export interface DecisionPoint {
  id: string;
  type: DecisionType;
  key: string;
  day: Day;
  companyId?: string;
  title: string;
  prompt: string;
  facts: DecisionFact[];
  options: DecisionOption[];
  /** Trading days to fast-forward after choosing. */
  forwardDays: number;
  params: Record<string, number>;
  /** For type 'event': the hand-written decision definition id. */
  eventDecisionId?: string;
}

export interface OptionOutcome {
  optionId: string;
  label: string;
  style: OptionStyle;
  /** Portfolio value on each day of the forward window (first = decision day, after the option). */
  values: number[];
  ret: number;
}

export interface DecisionOutcome {
  decisionId: string;
  chosenId: string;
  startDay: Day;
  endDay: Day;
  days: Day[];
  outcomes: OptionOutcome[];
  companyReturn: number | null;
  indexReturn: number;
  lesson: string[];
  considerations: string[];
}

/** Compact record for the end-of-run report. */
export interface DecisionRecord {
  day: Day;
  type: DecisionType;
  title: string;
  chosenLabel: string;
  chosenReturn: number;
  bestLabel: string;
  bestReturn: number;
}
