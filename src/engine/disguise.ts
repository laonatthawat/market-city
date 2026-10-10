import { NAME_PREFIXES, SECTORS } from '../data/sectors';
import { Rng } from './rng';
import type { Company } from './types';

/** Unique disguised names for a run's companies (deterministic per seed). */
export function disguiseNames(companies: readonly Company[], seed: number): Record<string, string> {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const used = new Set<string>(companies.map((c) => c.realName));
  const usedPrefixes = new Set<string>();
  const out: Record<string, string> = {};
  for (const c of companies) {
    const suffixes = SECTORS[c.sector].suffixes;
    let name = '';
    for (let tries = 0; tries < 200; tries++) {
      const prefix = rng.pick(NAME_PREFIXES);
      name = `${prefix} ${rng.pick(suffixes)}`;
      // Distinct first words make companies easier to tell apart.
      if (!used.has(name) && (!usedPrefixes.has(prefix) || tries > 100)) break;
    }
    if (used.has(name)) name = `${name} ${rng.int(2, 99)}`;
    used.add(name);
    usedPrefixes.add(name.split(' ')[0]);
    out[c.id] = name;
  }
  return out;
}

export function disguisedTicker(name: string): string {
  const [a, b = ''] = name.split(' ');
  return (a.slice(0, 3) + b.slice(0, 1)).toUpperCase();
}
