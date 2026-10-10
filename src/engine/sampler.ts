import { TRADING_DAYS_PER_YEAR } from './calendar';
import { disguiseNames } from './disguise';
import { windowStartForEvent } from './events';
import { Rng } from './rng';
import type { Company, Run, SectorId } from './types';

export interface SampleRunOptions {
  seed: number;
  calendarLength: number;
  companies: readonly Company[];
  years: number;
  startingCash: number;
  /** Days of pre-window history shown in charts (enough for MA200). */
  lookback?: number;
  minCompanies?: number;
  maxCompanies?: number;
  /** Tagged real-world events (historical data only) for weighted window selection. */
  events?: readonly { id: string; startDay: number }[];
  /** Share of runs biased to contain one tagged event (spec: ~20–30%). */
  eventChance?: number;
}

export const DEFAULT_LOOKBACK = TRADING_DAYS_PER_YEAR;

/**
 * Picks a random playable window and a sector-balanced set of companies
 * that have prices for the whole window.
 */
export function sampleRun(opts: SampleRunOptions): Run {
  const {
    seed,
    calendarLength,
    companies,
    years,
    startingCash,
    lookback = DEFAULT_LOOKBACK,
    minCompanies = 15,
    maxCompanies = 20,
    events = [],
    eventChance = 0.25,
  } = opts;
  const rng = new Rng(seed);
  const length = Math.round(years * TRADING_DAYS_PER_YEAR);
  const minStart = lookback;
  const maxStart = calendarLength - length;
  if (maxStart < minStart) throw new Error('Calendar too short for requested run length');

  const eligibleAt = (start: number) => companies.filter((c) => c.firstDay <= start && c.lastDay >= start + length - 1);

  // ~25% of runs are biased to contain one tagged event, at a random offset (never announced).
  let best: { start: number; eligible: Company[] } | null = null;
  let taggedEventId: string | undefined;
  if (events.length > 0 && rng.next() < eventChance) {
    for (const ev of rng.shuffle(events)) {
      const start = windowStartForEvent(ev, length, minStart, maxStart, () => rng.next());
      if (start == null) continue;
      const eligible = eligibleAt(start);
      if (eligible.length >= minCompanies) {
        best = { start, eligible };
        taggedEventId = ev.id;
        break;
      }
    }
  }

  // Otherwise try a few plain random windows; prefer one with enough eligible companies.
  for (let attempt = 0; attempt < 12 && !taggedEventId; attempt++) {
    const start = rng.int(minStart, maxStart);
    // Need data from the window start (pre-history optional) through the end.
    const eligible = eligibleAt(start);
    if (!best || eligible.length > best.eligible.length) best = { start, eligible };
    if (eligible.length >= maxCompanies * 2) break;
  }
  const { start, eligible } = best!;
  const end = start + length - 1;
  const target = Math.min(eligible.length, rng.int(minCompanies, maxCompanies));
  const picked = pickSectorBalanced(eligible, target, rng);
  const historyStart = Math.max(0, start - lookback, Math.min(...picked.map((c) => c.firstDay)));

  return {
    id: `run-${seed.toString(36)}-${start}`,
    seed,
    windowStart: start,
    windowEnd: end,
    historyStart,
    companyIds: picked.map((c) => c.id),
    disguisedNames: disguiseNames(picked, seed),
    startingCash,
    years,
    modifiers: {},
    taggedEventId,
  };
}

/** Round-robin over shuffled sectors so every sector gets a fair share. */
export function pickSectorBalanced(eligible: readonly Company[], target: number, rng: Rng): Company[] {
  const bySector = new Map<SectorId, Company[]>();
  for (const c of eligible) {
    const list = bySector.get(c.sector) ?? [];
    list.push(c);
    bySector.set(c.sector, list);
  }
  const pools = rng.shuffle([...bySector.keys()]).map((s) => rng.shuffle(bySector.get(s)!));
  const out: Company[] = [];
  while (out.length < target && pools.some((p) => p.length > 0)) {
    for (const pool of pools) {
      if (out.length >= target) break;
      const c = pool.pop();
      if (c) out.push(c);
    }
  }
  return out;
}
