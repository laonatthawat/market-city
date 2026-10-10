import { describe, expect, it } from 'vitest';
import { SimulatedProvider } from '../provider/SimulatedProvider';

describe('sandbox market keeps prices tied to fundamentals', () => {
  for (const seed of [11, 1340796517, 2024, 77]) {
    it(`seed ${seed}: P/E and dividend yields stay plausible across the whole calendar`, () => {
      const sim = new SimulatedProvider({ seed, companiesPerSector: 3, syntheticEventsPerYear: 1 });
      sim.generate();
      const n = sim.getCalendar().length;
      const pes: number[] = [];
      let worstYield = 0;
      for (const c of sim.getCompanies()) {
        for (let d = 260; d < n; d += 40) {
          const f = sim.getFundamentals(c.id, d);
          if (!f) continue;
          if (f.pe != null) pes.push(f.pe);
          worstYield = Math.max(worstYield, f.dividendYield);
        }
      }
      pes.sort((a, b) => a - b);
      const q = (p: number) => pes[Math.floor(p * (pes.length - 1))];
      // Individual names may get cheap or expensive, but not absurdly so.
      expect(q(0.02)).toBeGreaterThan(2);
      expect(q(0.98)).toBeLessThan(150);
      expect(worstYield).toBeLessThan(0.2);
    });
  }
});
