// Core data model shared by engine, scene and UI.
// All money values inside the engine are THB.

export type SectorId =
  | 'tech'
  | 'finance'
  | 'energy'
  | 'consumer'
  | 'healthcare'
  | 'industrial'
  | 'realestate';

export const SECTOR_IDS: readonly SectorId[] = [
  'tech',
  'finance',
  'energy',
  'consumer',
  'healthcare',
  'industrial',
  'realestate',
];

/** Trading-day index into the provider calendar. */
export type Day = number;

export interface PriceBar {
  day: Day;
  date: string; // ISO yyyy-mm-dd
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Annual, approximate fundamentals for one fiscal year. */
export interface FundamentalsYear {
  year: number;
  revenue: number; // THB
  netIncome: number; // THB
  equity: number; // THB (book value)
  debtToEquity: number; // ratio
  dividendPerShare: number; // THB
}

export interface Company {
  id: string;
  realName: string;
  ticker: string;
  sector: SectorId;
  description: string; // real description (Thai), shown after reveal
  disguisedDescription: string; // generic description (Thai), shown during play
  sharesOutstanding: number;
  fundamentals: FundamentalsYear[]; // sorted by year asc
  earningsDays: Day[]; // sorted asc
  firstDay: Day; // first day with price data
  lastDay: Day; // last day with price data
}

/** Fundamentals as visible on a specific day (only already-reported years). */
export interface FundamentalsSnapshot {
  fiscalYear: number;
  price: number;
  marketCap: number;
  revenue: number;
  netIncome: number;
  eps: number;
  pe: number | null; // null when EPS <= 0
  pb: number | null;
  revenueGrowth: number | null; // YoY, fraction
  netMargin: number;
  debtToEquity: number;
  dividendYield: number; // fraction
  epsTrend: { year: number; eps: number }[];
  approximate: true;
}

export type MarketEventKind = 'earnings' | 'shock';

export interface MarketEvent {
  kind: MarketEventKind;
  day: Day;
  /** Affected company (earnings, scandals). Market-wide shocks have none. */
  companyId?: string;
  /** Thai headline for synthetic shocks (Sandbox). */
  headline?: string;
  sectors?: SectorId[];
}

export interface DatasetInfo {
  /** Short Thai label, e.g. "ข้อมูลย้อนหลังจริง" */
  label: string;
  /** Description for the reveal screen. */
  detail: string;
  /** Whether company names / dates in the reveal are real. */
  real: boolean;
}

export interface RunModifiers {
  // Phase 3: challenge modifiers. Kept for data-model stability.
  maxDrawdownLimit?: number;
  sectorCap?: number;
  noSellMonths?: number;
  dcaOnly?: boolean;
}

export interface Funding {
  mode: 'lump' | 'dca';
  /** Monthly contribution (DCA only). */
  monthly: number;
}

export interface Run {
  id: string;
  seed: number;
  windowStart: Day; // first playable day
  windowEnd: Day; // last playable day (inclusive)
  historyStart: Day; // earliest day visible in charts (pre-window context)
  companyIds: string[];
  disguisedNames: Record<string, string>;
  startingCash: number;
  years: number;
  modifiers: RunModifiers;
  funding?: Funding;
  taggedEventId?: string;
}
