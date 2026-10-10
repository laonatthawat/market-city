import { Rng } from '../engine/rng';
import type { Company, SectorId } from '../engine/types';
import { SECTOR_IDS } from '../engine/types';

export const ISLAND_RADIUS = 50;
export const DISTRICT_RING = 32;
export const DISTRICT_SIZE = 16;
export const LOT = 5.4;
export const PLAZA_RADIUS = 9;
export const ROAD_INNER = 17;
export const ROAD_OUTER = 19.5;
/** Radius of the coastal promenade walkway. */
export const PROMENADE_R = 47.6;

export interface District {
  sector: SectorId;
  x: number;
  z: number;
  angle: number;
  /** Yaw of the district grid: its local +Z faces the city centre, so streets meet it square-on. */
  rot: number;
}

/** Inner park between the index plaza and the ring road: a circular path half-way across. */
export const PARK_RING = (PLAZA_RADIUS + ROAD_INNER) / 2;

/** District-local (x across, z towards the centre) → world. */
export function toWorld(d: { x: number; z: number; rot: number }, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(d.rot);
  const s = Math.sin(d.rot);
  return { x: d.x + lx * c + lz * s, z: d.z - lx * s + lz * c };
}

/** World → district-local. */
export function toLocal(d: { x: number; z: number; rot: number }, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(d.rot);
  const s = Math.sin(d.rot);
  const dx = x - d.x;
  const dz = z - d.z;
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

export interface Lot {
  companyId: string | null; // null = decorative filler building
  sector: SectorId;
  x: number;
  z: number;
  /** Yaw of the plot (its district's), front facing the city centre. */
  rot: number;
  /** Filler height/width, deterministic. */
  fillerHeight: number;
  fillerWidth: number;
}

export interface CityLayout {
  districts: District[];
  lots: Lot[];
  byCompany: Map<string, Lot>;
  /** kind 0 = pine, 1 = round broadleaf. */
  trees: { x: number; z: number; s: number; kind: number }[];
  bushes: { x: number; z: number; s: number }[];
  /** Wild flower clumps (tone picks the colour), grass tufts and boulders on open land. */
  flowers: { x: number; z: number; s: number; tone: number }[];
  tufts: { x: number; z: number; s: number }[];
  rocks: { x: number; z: number; s: number }[];
  /** Empty plots become pocket parks; `rot` is the yaw (district yaw plus a quarter-turn for variety). */
  parks: { x: number; z: number; rot: number }[];
}

export function districtPositions(): District[] {
  return SECTOR_IDS.map((sector, k) => {
    const angle = (k / SECTOR_IDS.length) * Math.PI * 2 - Math.PI / 2;
    return { sector, angle, rot: -angle - Math.PI / 2, x: Math.cos(angle) * DISTRICT_RING, z: Math.sin(angle) * DISTRICT_RING };
  });
}

export const CIVIC_RING = 41;
/** The bank sits in the widest part of the front gap, its forecourt reaching the promenade. */
const BANK_RING = 39;
export const BANK_SLOT = 3;

/**
 * Open plots between sector districts (one per gap) for the Reserve Bank and civic buildings.
 * Gap 3 sits straight in front of the home camera, so the bank goes there.
 */
export function civicSlots(): { x: number; z: number; angle: number }[] {
  return SECTOR_IDS.map((_, k) => {
    const angle = (k / SECTOR_IDS.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / SECTOR_IDS.length;
    const r = k === BANK_SLOT ? BANK_RING : CIVIC_RING;
    return { angle, x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  });
}

/** The lighthouse stands on the beach (front-left, between palms and umbrellas), on the sand's top. */
const LIGHTHOUSE_ANGLE = (120 * Math.PI) / 180;
export const LIGHTHOUSE_SPOT = { x: Math.cos(LIGHTHOUSE_ANGLE) * 52.4, z: Math.sin(LIGHTHOUSE_ANGLE) * 52.4, y: -0.4 };

/**
 * Fixed home of each civic building, chosen so it reads from the home camera: the short ones take the
 * two front gaps, the lighthouse sits on the beach, taller or flat ones the side and back gaps.
 */
const CIVIC_GAP: Record<string, number> = { library: 2, observatory: 4, garden: 1, statue: 5, landmark: 6 };
export function civicSpot(kind: string): { x: number; z: number; y: number } {
  if (kind === 'lighthouse') return LIGHTHOUSE_SPOT;
  const s = civicSlots()[CIVIC_GAP[kind] ?? 0];
  return { x: s.x, z: s.z, y: 0 };
}

const DISTRICTS = districtPositions();
const SLOTS = civicSlots();
const HALF = DISTRICT_SIZE / 2 + 1;

/**
 * True where nothing is built: not the plaza, roads, paths, district plots (with their walkways) or
 * civic plots. `margin` grows (or, negative, shrinks) the keep-out zones.
 */
export function openGround(x: number, z: number, margin = 0): boolean {
  const r = Math.hypot(x, z);
  // Keep-outs are the actual paved edges; callers add their own footprint as margin.
  if (r < PLAZA_RADIUS + 0.6 + margin) return false;
  if (r > ROAD_INNER - 0.75 - margin && r < ROAD_OUTER + 0.75 + margin) return false;
  // The inner park's circular path and the coastal promenade (Paths.tsx).
  if (Math.abs(r - PARK_RING) < 0.75 + margin) return false;
  if (Math.abs(r - PROMENADE_R) < 0.65 + margin) return false;
  for (const d of DISTRICTS) {
    const l = toLocal(d, x, z);
    if (Math.abs(l.x) < HALF + margin && Math.abs(l.z) < HALF + margin) return false;
  }
  if (onSpoke(x, z, DISTRICTS, margin)) return false;
  return !SLOTS.some((c, i) => Math.hypot(x - c.x, z - c.z) < (i === BANK_SLOT ? 8.6 : 7) + margin);
}

/** Benches (facing the path) and lamps around the inner park's ring path. */
export function parkFurniture(): { benches: { x: number; z: number; yaw: number }[]; lamps: { x: number; z: number }[] } {
  const benches: { x: number; z: number; yaw: number }[] = [];
  const lamps: { x: number; z: number }[] = [];
  const n = DISTRICTS.length;
  DISTRICTS.forEach((d) => {
    // A lamp beside each spoke path where it crosses the ring path.
    const r0 = PARK_RING + 1.1;
    lamps.push({ x: Math.cos(d.angle) * r0 - Math.sin(d.angle) * 1.1, z: Math.sin(d.angle) * r0 + Math.cos(d.angle) * 1.1 });
    const span = (Math.PI * 2) / n;
    for (const f of [0.35, 0.65]) {
      const a = d.angle + span * f;
      const r = PARK_RING + 1.05;
      benches.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: -a - Math.PI / 2 });
    }
  });
  return { benches, lamps };
}

export function buildLayout(companies: readonly Company[], seed: number): CityLayout {
  const rng = new Rng(seed ^ 0x2545f491);
  const districts = DISTRICTS;
  const lots: Lot[] = [];
  const parks: CityLayout['parks'] = [];
  const byCompany = new Map<string, Lot>();
  for (const d of districts) {
    const members = companies.filter((c) => c.sector === d.sector);
    const fillers = Math.min(9 - members.length, 3 + rng.int(0, 2));
    // Every run gets its own street pattern: shuffled cells, companies and houses mixed at random.
    const cells = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const occupants = rng.shuffle([...members, ...Array<null>(Math.max(0, Math.min(9, members.length + fillers) - members.length)).fill(null)]);
    for (let i = 0; i < Math.min(9, occupants.length); i++) {
      const cell = cells[i];
      const gx = (cell % 3) - 1;
      const gz = Math.floor(cell / 3) - 1;
      const c = occupants[i];
      const w = toWorld(d, gx * LOT, gz * LOT);
      const lot: Lot = {
        companyId: c?.id ?? null,
        sector: d.sector,
        x: w.x,
        z: w.z,
        rot: d.rot,
        fillerHeight: rng.range(1.2, 3.2),
        fillerWidth: rng.range(1.6, 2.6),
      };
      lots.push(lot);
      if (c) byCompany.set(c.id, lot);
    }
    for (let i = occupants.length; i < 9; i++) {
      const cell = cells[i];
      const w = toWorld(d, ((cell % 3) - 1) * LOT, (Math.floor(cell / 3) - 1) * LOT);
      parks.push({ x: w.x, z: w.z, rot: d.rot + (((cell + parks.length) % 4) * Math.PI) / 2 });
    }
  }

  // Everything scattered on open land keeps a little clear space around it, so nothing overlaps.
  // Park benches and lamps are reserved first.
  const placed: { x: number; z: number; r: number }[] = [];
  const furniture = parkFurniture();
  for (const b of furniture.benches) placed.push({ x: b.x, z: b.z, r: 0.7 });
  for (const l of furniture.lamps) placed.push({ x: l.x, z: l.z, r: 0.4 });
  const free = (x: number, z: number, r: number) => placed.every((p) => Math.hypot(p.x - x, p.z - z) >= p.r + r);
  /** Picks up to `count` free spots of radius r (from `size()`), within [r0, r1) of the centre. */
  const scatter = (count: number, margin: number, size: () => number, radius: (s: number) => number, r0 = 0, r1 = ISLAND_RADIUS - 2) => {
    const out: { x: number; z: number; s: number }[] = [];
    for (let tries = 0; out.length < count && tries < count * 30; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const r = r0 > 0 ? rng.range(r0, r1) : Math.sqrt(rng.next()) * r1;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = size();
      const rad = radius(s);
      // The whole footprint (not just its centre) must stay off paths, roads and plots.
      if (!openGround(x, z, margin + rad) || !free(x, z, rad)) continue;
      placed.push({ x, z, r: rad });
      out.push({ x, z, s });
    }
    return out;
  };
  // Pines gather towards the coast, broadleaf trees inland; the inner park gets its own planting.
  const trees = scatter(120, 0.2, () => rng.range(0.7, 1.3), (s) => 1.05 * s).map((p) => ({
    ...p,
    kind: Math.hypot(p.x, p.z) > 40 ? (rng.next() < 0.75 ? 0 : 1) : rng.next() < 0.3 ? 0 : 1,
  }));
  for (const p of scatter(22, 0.1, () => rng.range(0.6, 1.0), (s) => 1.05 * s, PLAZA_RADIUS + 1.8, ROAD_INNER - 1.6)) trees.push({ ...p, kind: rng.next() < 0.25 ? 0 : 1 });
  const bushes = scatter(90, -0.1, () => rng.range(0.35, 0.7), (s) => 0.85 * s);
  for (const p of scatter(16, -0.1, () => rng.range(0.35, 0.6), (s) => 0.85 * s, PLAZA_RADIUS + 1.8, ROAD_INNER - 1.6)) bushes.push(p);
  const rocks = scatter(14, 0, () => rng.range(0.25, 0.6), (s) => 0.9 * s);
  const flowers = scatter(100, 0, () => rng.range(0.7, 1.2), () => 0.35).map((p) => ({ ...p, tone: rng.next() }));
  for (const p of scatter(30, 0, () => rng.range(0.8, 1.2), () => 0.35, PLAZA_RADIUS + 1.8, ROAD_INNER - 1.6)) flowers.push({ ...p, tone: rng.next() });
  const tufts = scatter(150, 0, () => rng.range(0.6, 1.2), () => 0.25);
  return { districts, lots, byCompany, trees, bushes, flowers, tufts, rocks, parks };
}

function onSpoke(x: number, z: number, districts: District[], margin = 0): boolean {
  const r = Math.hypot(x, z);
  if (r > ISLAND_RADIUS) return false;
  for (const d of districts) {
    // Distance from point to the spoke line through the origin at d.angle.
    const dist = Math.abs(-Math.sin(d.angle) * x + Math.cos(d.angle) * z);
    const along = Math.cos(d.angle) * x + Math.sin(d.angle) * z;
    // Park path, then the walking avenue (3.6 wide) and the connector out to the promenade.
    if (along > 0 && dist < (r < ROAD_INNER ? 0.75 : 1.85) + margin) return true;
  }
  return false;
}
