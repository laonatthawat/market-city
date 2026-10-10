import { BoxGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry } from 'three';
import type { BufferGeometry } from 'three';
import type { SectorId } from '../engine/types';
import { merge, part } from './geom';

/**
 * Architecture per business sector, so districts are easy to tell apart at a glance.
 * Market encodings are untouched: height = market cap, width = revenue, body tint = valuation,
 * window light = momentum. Only shape, window pattern and rooftop/ground signatures change.
 *
 * Detail geometry is in "unit footprint" space: x and z span -0.5..0.5 of the building
 * (scaled by its width), y is in world units. Roof parts sit on the roof (y = 0 is the roof),
 * base parts on the ground, both as single pre-merged draw calls.
 */
export interface SectorStyle {
  /** Floor-width profile: 0 = setbacks, 1 = straight slab, 2 = tapering tower. */
  profile: 0 | 1 | 2;
  /** Window band height as a fraction of the floor. */
  band: number;
  /** Target width of one window bay (world units). */
  bay: number;
  roughness: number;
  metalness: number;
  /** Floors between cornices; 1 reads as balconies. */
  ledgeEvery: number;
  /** Extra overhang of the cornices (balconies). */
  ledgeOut: number;
}

export const SECTOR_STYLE: Record<SectorId, SectorStyle> = {
  tech: { profile: 2, band: 0.66, bay: 0.95, roughness: 0.3, metalness: 0.3, ledgeEvery: 8, ledgeOut: 0.06 },
  finance: { profile: 0, band: 0.5, bay: 0.42, roughness: 0.7, metalness: 0.05, ledgeEvery: 4, ledgeOut: 0.16 },
  energy: { profile: 1, band: 0.36, bay: 0.6, roughness: 0.85, metalness: 0.1, ledgeEvery: 5, ledgeOut: 0.12 },
  consumer: { profile: 1, band: 0.5, bay: 0.75, roughness: 0.6, metalness: 0.05, ledgeEvery: 5, ledgeOut: 0.12 },
  healthcare: { profile: 1, band: 0.42, bay: 0.5, roughness: 0.55, metalness: 0.05, ledgeEvery: 3, ledgeOut: 0.1 },
  industrial: { profile: 1, band: 0.28, bay: 1.1, roughness: 0.95, metalness: 0.15, ledgeEvery: 6, ledgeOut: 0.1 },
  realestate: { profile: 0, band: 0.4, bay: 0.5, roughness: 0.8, metalness: 0.02, ledgeEvery: 2, ledgeOut: 0.32 },
};

const WHITE = '#f6f2f8';
const STONE = '#ece4d6';
const METAL = '#c9c4cf';
const DARK = '#55525f';
const GOLD = '#f2c14e';
const RED = '#e8505b';
const GREEN = '#7cc47a';
const LEAF = '#5fa86a';
const YELLOW = '#ffcf3f';

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string) => part(new BoxGeometry(w, h, d), x, y, z, c);
const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, c: string, seg = 10) => part(new CylinderGeometry(rt, rb, h, seg), x, y, z, c);

function prism(w: number, h: number, d: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  return new ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}

/** Red/white banded chimney stack. */
function stack(x: number, z: number, h: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const n = 4;
  for (let i = 0; i < n; i++) out.push(cyl(0.085 - i * 0.008, 0.09 - i * 0.008, h / n, x, 0.2 + (i + 0.5) * (h / n), z, i % 2 ? WHITE : RED, 8));
  return out;
}

/** Rooftop clutter (painted, lit by the scene). */
export const SECTOR_ROOF: Record<SectorId, BufferGeometry> = {
  // Satellite dish + antenna array.
  tech: merge([
    cyl(0.03, 0.04, 0.35, 0.22, 0.37, 0.18, METAL, 6),
    part(new SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.6).rotateX(-0.9), 0.22, 0.6, 0.18, WHITE),
    ...[-0.32, -0.2, -0.08].map((x, i) => cyl(0.015, 0.02, 0.9 + i * 0.35, x, 0.2 + (0.9 + i * 0.35) / 2, -0.25, METAL, 5)),
    box(0.3, 0.18, 0.22, -0.2, 0.29, 0.15, METAL),
  ]),
  // Gold dome on a drum, with a spire: a classic bank.
  finance: merge([
    cyl(0.32, 0.34, 0.24, 0, 0.32, 0, STONE, 14),
    // Taller than its radius: the roof is stretched sideways by the building width.
    part(new SphereGeometry(0.3, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2.2, 1), 0, 0.44, 0, GOLD),
    part(new ConeGeometry(0.04, 0.5, 6), 0, 1.35, 0, GOLD),
    ...[-0.42, 0.42].flatMap((x) => [-0.42, 0.42].map((z) => box(0.08, 0.3, 0.08, x, 0.35, z, STONE))),
  ]),
  // Striped smokestacks and a wind turbine tower.
  energy: merge([
    ...stack(-0.25, -0.18, 1.0),
    ...stack(0.0, -0.28, 0.75),
    cyl(0.025, 0.04, 1.5, 0.28, 0.95, 0.2, WHITE, 6),
    box(0.1, 0.08, 0.16, 0.28, 1.72, 0.2, WHITE),
    part(new BoxGeometry(0.34, 0.06, 0.34), -0.15, 0.23, 0.25, '#4b6fa8'), // solar panel
  ]),
  // Billboard on two legs.
  consumer: merge([
    box(0.04, 0.55, 0.04, -0.3, 0.47, -0.05, DARK),
    box(0.04, 0.55, 0.04, 0.3, 0.47, -0.05, DARK),
    box(0.82, 0.5, 0.05, 0, 0.98, -0.08, DARK),
    box(0.3, 0.14, 0.24, 0.25, 0.27, 0.25, METAL),
  ]),
  // Helipad with an "H".
  healthcare: merge([
    cyl(0.42, 0.42, 0.05, 0, 0.225, 0, DARK, 18),
    box(0.06, 0.012, 0.36, -0.1, 0.256, 0, WHITE),
    box(0.06, 0.012, 0.36, 0.1, 0.256, 0, WHITE),
    box(0.2, 0.012, 0.06, 0, 0.256, 0, WHITE),
  ]),
  // Sawtooth roof, pipes and a yellow crane.
  industrial: merge([
    ...[-0.3, 0, 0.3].map((x) => part(prism(0.3, 0.32, 0.9), x, 0.2, 0, METAL)),
    part(new CylinderGeometry(0.04, 0.04, 0.9, 6).rotateX(Math.PI / 2), 0.42, 0.27, 0, '#a7a2ad'),
    // Tower crane: lattice-ish mast, long jib, counterweight and hook.
    box(0.09, 2.2, 0.09, -0.35, 1.3, 0.35, YELLOW),
    box(1.25, 0.08, 0.08, 0.1, 2.42, 0.35, YELLOW),
    box(0.16, 0.16, 0.14, -0.5, 2.38, 0.35, DARK),
    box(0.12, 0.14, 0.12, -0.35, 2.55, 0.35, YELLOW),
    box(0.015, 0.7, 0.015, 0.55, 2.03, 0.35, DARK),
    box(0.08, 0.08, 0.08, 0.55, 1.66, 0.35, DARK),
  ]),
  // Rooftop garden with small trees and a pergola.
  realestate: merge([
    box(0.86, 0.06, 0.86, 0, 0.23, 0, GREEN),
    ...[
      [-0.25, -0.2],
      [0.22, -0.25],
      [-0.15, 0.25],
    ].flatMap(([x, z]) => [cyl(0.02, 0.03, 0.18, x, 0.35, z, '#8a6a4f', 5), part(new ConeGeometry(0.13, 0.32, 6), x, 0.58, z, LEAF)]),
    ...[-0.12, 0.38].flatMap((x) => [0.05, 0.38].map((z) => box(0.03, 0.34, 0.03, x, 0.43, z, WHITE))),
    box(0.56, 0.03, 0.4, 0.13, 0.61, 0.22, WHITE),
  ]),
};

/** Glowing signs (unlit, bloom at night): one draw call per building, or none. */
export const SECTOR_GLOW: Partial<Record<SectorId, BufferGeometry>> = {
  // LED crown band just under the roof.
  tech: merge([box(1.035, 0.09, 1.035, 0, -0.32, 0, '#7df3ff'), part(new SphereGeometry(0.035, 6, 4), -0.08, 1.7, -0.25, '#ff5a6e')]),
  // Billboard face in brand colours.
  consumer: merge([box(0.38, 0.42, 0.012, -0.19, 0.98, -0.05, '#ff7fa8'), box(0.38, 0.42, 0.012, 0.19, 0.98, -0.05, '#ffd36e')]),
  // Green cross signs on the front and side, near the top.
  healthcare: merge([
    box(0.12, 0.42, 0.02, 0, -0.72, 0.51, '#3ee08f'),
    box(0.42, 0.12, 0.02, 0, -0.72, 0.51, '#3ee08f'),
    box(0.02, 0.42, 0.12, 0.51, -0.72, 0, '#3ee08f'),
    box(0.02, 0.12, 0.42, 0.51, -0.72, 0, '#3ee08f'),
  ]),
  // Aviation lights on the stacks.
  energy: merge([part(new SphereGeometry(0.04, 6, 4), -0.25, 1.24, -0.18, '#ff5a6e'), part(new SphereGeometry(0.04, 6, 4), 0, 0.99, -0.28, '#ff5a6e')]),
  // Warning lamp on the crane jib.
  industrial: merge([part(new SphereGeometry(0.05, 6, 4), 0.7, 2.5, 0.35, '#ffb347'), part(new SphereGeometry(0.05, 6, 4), -0.35, 2.66, 0.35, '#ff5a6e')]),
};

/** Ground-floor signatures in the lobby's footprint space. */
export const SECTOR_BASE: Partial<Record<SectorId, BufferGeometry>> = {
  // Columned portico with a pediment.
  finance: merge([
    box(0.9, 0.08, 0.24, 0, 0.04, 0.62, STONE),
    ...[-0.36, -0.12, 0.12, 0.36].map((x) => cyl(0.04, 0.045, 0.56, x, 0.36, 0.64, WHITE, 8)),
    box(0.92, 0.08, 0.26, 0, 0.68, 0.62, STONE),
    part(prism(0.92, 0.2, 0.24), 0, 0.72, 0.62, STONE),
  ]),
  // Striped shop awnings on three sides.
  consumer: merge(
    [-0.375, -0.125, 0.125, 0.375].flatMap((x, i) => [
      box(0.25, 0.04, 0.3, x, 0.6, 0.62, i % 2 ? WHITE : '#f47a9e'),
      box(0.04, 0.3, 0.25, 0.62, 0.6, x, i % 2 ? WHITE : '#f4b23f'),
      box(0.04, 0.3, 0.25, -0.62, 0.6, x, i % 2 ? WHITE : '#7bc0e8'),
    ]),
  ),
  // Ambulance bay canopy with a red stripe.
  healthcare: merge([box(0.7, 0.05, 0.3, 0, 0.62, 0.64, WHITE), box(0.7, 0.04, 0.02, 0, 0.6, 0.79, RED)]),
  // Loading docks.
  industrial: merge([box(0.3, 0.42, 0.04, -0.22, 0.23, 0.53, DARK), box(0.3, 0.42, 0.04, 0.22, 0.23, 0.53, DARK), box(0.9, 0.05, 0.22, 0, 0.5, 0.62, METAL)]),
  // Fuel-station style canopy.
  energy: merge([box(0.8, 0.06, 0.34, 0, 0.66, 0.68, WHITE), box(0.8, 0.05, 0.02, 0, 0.64, 0.85, '#f2a03d'), ...[-0.3, 0.3].map((x) => box(0.05, 0.62, 0.05, x, 0.33, 0.8, METAL))]),
};

/** Turbine rotor (energy), in world units: three blades around the hub at the origin, spun in Building. */
export const TURBINE_ROTOR = merge([0, 1, 2].map((i) => part(new BoxGeometry(0.07, 0.9, 0.02).translate(0, 0.45, 0).rotateZ((i * Math.PI * 2) / 3), 0, 0, 0, WHITE)));
export const TURBINE_HUB = { x: 0.28, y: 1.72, z: 0.29 };
