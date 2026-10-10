import { describe, expect, it } from 'vitest';
import type { Company } from '../../engine/types';
import { SECTOR_IDS } from '../../engine/types';
import { buildLayout, DISTRICT_SIZE, LOT, openGround, parkFurniture, toLocal } from '../layout';

/** Minimal companies: the layout only looks at id and sector. */
function companies(n: number): Company[] {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i}`, sector: SECTOR_IDS[i % SECTOR_IDS.length] }) as Company);
}

describe('city layout', () => {
  for (const seed of [1, 42, 2024, 987654]) {
    const layout = buildLayout(companies(18), seed);
    const things = [
      ...layout.trees.map((t) => ({ ...t, r: 1.05 * t.s, what: 'tree' })),
      ...layout.bushes.map((b) => ({ ...b, r: 0.85 * b.s, what: 'bush' })),
      ...layout.rocks.map((k) => ({ ...k, r: 0.9 * k.s, what: 'rock' })),
      ...layout.flowers.map((f) => ({ ...f, r: 0.35, what: 'flower' })),
      ...layout.tufts.map((t) => ({ ...t, r: 0.25, what: 'tuft' })),
    ];

    it(`seed ${seed}: scenery never overlaps itself or the park furniture`, () => {
      const furniture = parkFurniture();
      const fixed = [...furniture.benches.map((b) => ({ ...b, r: 0.7 })), ...furniture.lamps.map((l) => ({ ...l, r: 0.4 }))];
      for (let i = 0; i < things.length; i++) {
        const a = things[i];
        for (const f of fixed) expect(Math.hypot(a.x - f.x, a.z - f.z)).toBeGreaterThanOrEqual(a.r + f.r - 1e-6);
        for (let j = i + 1; j < things.length; j++) {
          const b = things[j];
          expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.what} vs ${b.what}`).toBeGreaterThanOrEqual(a.r + b.r - 1e-6);
        }
      }
    });

    it(`seed ${seed}: scenery stays off paths, roads, plots and civic sites`, () => {
      for (const t of things) expect(openGround(t.x, t.z, 0), `${t.what} at ${t.x.toFixed(1)},${t.z.toFixed(1)}`).toBe(true);
    });

    it(`seed ${seed}: every plot lies inside its district and companies all get one`, () => {
      expect(layout.byCompany.size).toBe(18);
      for (const lot of layout.lots) {
        const d = layout.districts.find((x) => x.sector === lot.sector)!;
        const l = toLocal(d, lot.x, lot.z);
        // Plot centres sit on the 3×3 grid, inside the district base.
        expect(Math.abs(l.x)).toBeLessThanOrEqual(LOT + 1e-6);
        expect(Math.abs(l.z)).toBeLessThanOrEqual(LOT + 1e-6);
        expect(LOT + (LOT - 0.9) / 2).toBeLessThan(DISTRICT_SIZE / 2);
      }
      // Lots and parks never share a plot.
      const keys = [...layout.lots, ...layout.parks].map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }
});
