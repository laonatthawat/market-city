import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, IcosahedronGeometry, Matrix4, Quaternion, RingGeometry, Vector3 } from 'three';
import type { BufferGeometry, InstancedMesh } from 'three';
import { merge, part } from './geom';
import type { District } from './layout';
import { DISTRICT_RING, DISTRICT_SIZE, LOT, PARK_RING, PLAZA_RADIUS, PROMENADE_R, ROAD_INNER, ROAD_OUTER, parkFurniture, toWorld } from './layout';

/**
 * The pedestrian network that ties the city together while keeping its districts. Along every spoke:
 * index plaza → park path (crossing the inner park's ring path) → zebra crossing over the ring road →
 * walking avenue → the walkway framing the district (joined to its inner lanes) → connector →
 * coastal promenade round the island. Districts face the centre, so every path meets them square-on.
 * `buildWalkGraph` turns it into nodes/edges for the walkers; <Walkways> draws the surfaces.
 */

export const FRAME_IN = DISTRICT_SIZE / 2;
export const FRAME_OUT = FRAME_IN + 0.9;
const FRAME_WALK = (FRAME_IN + FRAME_OUT) / 2;
const PROMENADE_W = 1.2;
const AVENUE_W = 3.6;
const PARK_PATH_W = 1.4;
const PLAZA_WALK = PLAZA_RADIUS - 1.4;
const INNER_WALK = ROAD_INNER - 0.35;
const OUTER_WALK = ROAD_OUTER + 0.35;
const LANE = LOT / 2;
/** Surface heights: sidewalks/paths at ground level, district bases raised. */
const Y_GROUND = 0.05;
const Y_DISTRICT = 0.2;

export interface WalkEdge {
  a: number;
  b: number;
  pts: Vector3[];
  /** Cumulative length at each point. */
  cum: number[];
  len: number;
  /** Junction index for crossings over the ring road (walkers wait for the ring's red light). */
  junction?: number;
  /** Narrow paths (district lanes, ring sidewalks) keep walkers this close to the centre line. */
  maxOff?: number;
}

export interface WalkGraph {
  nodes: Vector3[];
  edges: WalkEdge[];
  /** Edge indices touching each node. */
  adj: number[][];
}

const radial = (theta: number, r: number) => new Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r);

export function buildWalkGraph(districts: readonly District[]): WalkGraph {
  const nodes: Vector3[] = [];
  const edges: WalkEdge[] = [];
  const addNode = (p: Vector3, y: number) => nodes.push(p.clone().setY(y)) - 1;
  const addEdge = (a: number, b: number, mid: Vector3[] = [], extra: Partial<WalkEdge> = {}) => {
    const pts = [nodes[a], ...mid, nodes[b]];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    edges.push({ a, b, pts, cum, len: cum[cum.length - 1], ...extra });
  };
  /** Joins nodes lying on a circle of radius r, in angle order, with sampled arcs. */
  const circle = (ids: number[], r: number, y: number, maxOff?: number) => {
    const sorted = ids.map((id) => ({ id, a: Math.atan2(nodes[id].z, nodes[id].x) })).sort((p, q) => p.a - q.a);
    sorted.forEach((p, i) => {
      const q = sorted[(i + 1) % sorted.length];
      let span = q.a - p.a;
      if (span <= 0) span += Math.PI * 2;
      const steps = Math.max(1, Math.ceil((span * r) / 1.2));
      const mid: Vector3[] = [];
      for (let s = 1; s < steps; s++) {
        const a = p.a + (span * s) / steps;
        mid.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      addEdge(p.id, q.id, mid, { maxOff });
    });
  };

  const plazaIds: number[] = [];
  const parkIds: number[] = [];
  const innerIds: number[] = [];
  const outerIds: number[] = [];
  const promIds: number[] = [];

  districts.forEach((d, k) => {
    const theta = d.angle;
    const at = (lx: number, lz: number) => {
      const w = toWorld(d, lx, lz);
      return new Vector3(w.x, 0, w.z);
    };
    // Frame loop nodes, keyed by their position along the square's perimeter (district-local).
    const H = FRAME_WALK;
    const loop: { id: number; p: number }[] = [];
    const perim = (lx: number, lz: number) => {
      if (Math.abs(lz - H) < 1e-3) return lx + H;
      if (Math.abs(lx - H) < 1e-3) return 2 * H + (H - lz);
      if (Math.abs(lz + H) < 1e-3) return 4 * H + (H - lx);
      return 6 * H + (lz + H);
    };
    const frameNode = (lx: number, lz: number) => {
      const id = addNode(at(lx, lz), Y_DISTRICT);
      loop.push({ id, p: perim(lx, lz) });
      return id;
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) frameNode(sx * H, sz * H);

    // Inner lanes: two lines each way between the plots, ending on the frame.
    const cross = new Map<string, number>();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cross.set(`${sx},${sz}`, addNode(at(sx * LANE, sz * LANE), Y_DISTRICT));
    for (const s of [-1, 1]) {
      const ns = [frameNode(s * LANE, -H), cross.get(`${s},-1`)!, cross.get(`${s},1`)!, frameNode(s * LANE, H)];
      const ew = [frameNode(-H, s * LANE), cross.get(`-1,${s}`)!, cross.get(`1,${s}`)!, frameNode(H, s * LANE)];
      for (const line of [ns, ew]) for (let i = 0; i < 3; i++) addEdge(line[i], line[i + 1], [], { maxOff: 0.16 });
    }

    // Spoke: plaza → park path (via the park's ring path) → crossing → avenue → middle of the district's front.
    const plaza = addNode(radial(theta, PLAZA_WALK), Y_GROUND);
    const park = addNode(radial(theta, PARK_RING), Y_GROUND);
    const inner = addNode(radial(theta, INNER_WALK), Y_GROUND);
    const outer = addNode(radial(theta, OUTER_WALK), Y_GROUND);
    plazaIds.push(plaza);
    parkIds.push(park);
    innerIds.push(inner);
    outerIds.push(outer);
    addEdge(plaza, park);
    addEdge(park, inner);
    addEdge(inner, outer, [], { junction: k });
    const entry = frameNode(0, H);
    // Step up onto the district walkway at its edge.
    addEdge(outer, entry, [radial(theta, DISTRICT_RING - FRAME_OUT - 0.3).setY(Y_GROUND)]);

    // Back of the district: connector out to the coastal promenade.
    const exit = frameNode(0, -H);
    const prom = addNode(radial(theta, PROMENADE_R), Y_GROUND);
    promIds.push(prom);
    addEdge(exit, prom, [radial(theta, DISTRICT_RING + FRAME_OUT + 0.3).setY(Y_GROUND)]);

    // Close the frame loop through every node on it (corners included, so segments are straight).
    loop.sort((p, q) => p.p - q.p);
    const uniq = loop.filter((v, i) => i === 0 || Math.abs(v.p - loop[i - 1].p) > 1e-3);
    uniq.forEach((v, i) => addEdge(v.id, uniq[(i + 1) % uniq.length].id));
  });

  circle(plazaIds, PLAZA_WALK, Y_GROUND);
  circle(parkIds, PARK_RING, Y_GROUND);
  // The ring-road sidewalks are only 0.7 wide, with lamps and signals at their edges.
  circle(innerIds, INNER_WALK, Y_GROUND, 0.1);
  circle(outerIds, OUTER_WALK, Y_GROUND, 0.1);
  circle(promIds, PROMENADE_R, Y_GROUND);

  const adj: number[][] = nodes.map(() => []);
  edges.forEach((e, i) => {
    adj[e.a].push(i);
    adj[e.b].push(i);
  });
  return { nodes, edges, adj };
}

// --- Surfaces -------------------------------------------------------------------------------

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);
const noRaycast = () => {};

/** A flat paved strip from radius r0 to r1 along a spoke (centre line), as a merge part. */
function radialStrip(theta: number, r0: number, r1: number, w: number, y: number): BufferGeometry {
  const len = r1 - r0;
  const mid = (r0 + r1) / 2;
  return part(new BoxGeometry(len, 0.02, w).rotateY(-theta), Math.cos(theta) * mid, y, Math.sin(theta) * mid);
}

const PROM_LAMPS = 20;

/** Park bench (seat, back, legs) facing local +Z. */
const BENCH_GEO = merge([
  part(new BoxGeometry(0.9, 0.06, 0.3), 0, 0.3, 0, '#b88c66'),
  part(new BoxGeometry(0.9, 0.24, 0.05), 0, 0.48, -0.14, '#b88c66'),
  part(new BoxGeometry(0.8, 0.28, 0.22), 0, 0.14, 0, '#6b5a4e'),
]);
const LAMP_GEO = merge([part(new CylinderGeometry(0.05, 0.07, 1.7, 6), 0, 0.85, 0), part(new CylinderGeometry(0.1, 0.12, 0.06, 6), 0, 0.03, 0)]);
const LAMP_HEAD = new IcosahedronGeometry(0.16, 0).translate(0, 1.78, 0);

/** Paved surfaces of the network, ring-road zebra crossings, and the lamps and benches along the paths. */
export function Walkways({ districts, dark }: { districts: readonly District[]; dark: boolean }) {
  const n = districts.length;
  // Sidewalk-like surfaces (district frames, avenues) and gravel-like ones (park paths, promenade).
  const { walks, gravel } = useMemo(() => {
    const w: BufferGeometry[] = [];
    const g: BufferGeometry[] = [];
    districts.forEach((d) => {
      const theta = d.angle;
      // Frame around the district base: four kerbed strips flush with its top, turned with the district.
      const L = FRAME_OUT * 2;
      const fw = FRAME_OUT - FRAME_IN;
      const m = (FRAME_IN + FRAME_OUT) / 2;
      for (const [lx, lz, sx, sz] of [
        [0, m, L, fw],
        [0, -m, L, fw],
        [m, 0, fw, FRAME_IN * 2],
        [-m, 0, fw, FRAME_IN * 2],
      ]) {
        const c = toWorld(d, lx, lz);
        w.push(part(new BoxGeometry(sx, Y_DISTRICT, sz).rotateY(d.rot), c.x, Y_DISTRICT / 2, c.z));
      }
      // Avenue from the ring road's outer kerb to the district's front, and the connector out the back.
      w.push(radialStrip(theta, ROAD_OUTER + 0.65, DISTRICT_RING - FRAME_OUT + 0.3, AVENUE_W, 0.03));
      g.push(radialStrip(theta, DISTRICT_RING + FRAME_OUT - 0.3, PROMENADE_R, PROMENADE_W, 0.03));
      // Park path from the index plaza to the ring road's inner sidewalk.
      g.push(radialStrip(theta, PLAZA_RADIUS + 0.3, ROAD_INNER - 0.65, PARK_PATH_W, 0.03));
    });
    g.push(part(new RingGeometry(PARK_RING - PARK_PATH_W / 2, PARK_RING + PARK_PATH_W / 2, 96).rotateX(-Math.PI / 2), 0, 0.03, 0));
    g.push(part(new RingGeometry(PROMENADE_R - PROMENADE_W / 2, PROMENADE_R + PROMENADE_W / 2, 160).rotateX(-Math.PI / 2), 0, 0.03, 0));
    return { walks: merge(w), gravel: merge(g) };
  }, [districts]);

  const zebra = useRef<InstancedMesh>(null);
  const lamps = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const benches = useRef<InstancedMesh>(null);
  const zebraGeo = useMemo(() => new BoxGeometry(0.26, 0.02, 3.4), []);
  useLayoutEffect(() => {
    const z = zebra.current;
    if (z) {
      let i = 0;
      for (const d of districts) {
        // Bars run along the ring (with the traffic), stepping across it from kerb to kerb.
        for (let b = 0; b < 5; b++) {
          const r = ROAD_INNER + 0.35 + b * 0.45;
          _q.setFromAxisAngle(UP, -d.angle);
          z.setMatrixAt(i++, _m.compose(_p.set(Math.cos(d.angle) * r, 0.063, Math.sin(d.angle) * r), _q, _s.set(1, 1, 1)));
        }
      }
      z.count = i;
      z.instanceMatrix.needsUpdate = true;
      z.computeBoundingSphere();
    }
    const [lp, lh, bn] = [lamps.current, heads.current, benches.current];
    if (lp && lh && bn) {
      let i = 0;
      const lamp = (x: number, z: number) => {
        _m.compose(_p.set(x, 0, z), _q.identity(), _s.set(1, 1, 1));
        lp.setMatrixAt(i, _m);
        lh.setMatrixAt(i, _m);
        i++;
      };
      // Promenade lamps on its seaward edge (the bank's forecourt, straight ahead of the camera, stays clear).
      for (let j = 0; j < PROM_LAMPS; j++) {
        const a = ((j + 0.5) / PROM_LAMPS) * Math.PI * 2;
        if (Math.abs(a - Math.PI / 2) < 0.12) continue;
        const r = PROMENADE_R + PROMENADE_W / 2 + 0.25;
        lamp(Math.cos(a) * r, Math.sin(a) * r);
      }
      // Inner park furniture (positions shared with the layout, which keeps plants clear of it).
      const park = parkFurniture();
      for (const l of park.lamps) lamp(l.x, l.z);
      park.benches.forEach((b, nb) => {
        _q.setFromAxisAngle(UP, b.yaw);
        bn.setMatrixAt(nb, _m.compose(_p.set(b.x, 0.02, b.z), _q, _s.set(1, 1, 1)));
      });
      const nb = park.benches.length;
      lp.count = lh.count = i;
      bn.count = nb;
      for (const m of [lp, lh, bn]) {
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      }
    }
  }, [districts]);

  return (
    <group name="walkways">
      <mesh geometry={walks} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#6d6880' : '#f1ebf3'} />
      </mesh>
      <mesh geometry={gravel} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#6f6a78' : '#ebdfca'} />
      </mesh>
      <instancedMesh ref={zebra} args={[zebraGeo, undefined, n * 5]} raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#c9c3a2' : '#fffaf0'} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[LAMP_GEO, undefined, PROM_LAMPS + n]} raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#8c87a0' : '#6b6578'} flatShading />
      </instancedMesh>
      <instancedMesh ref={heads} args={[LAMP_HEAD, undefined, PROM_LAMPS + n]} raycast={noRaycast}>
        <meshBasicMaterial color={dark ? '#ffd68a' : '#fff6dc'} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={benches} args={[BENCH_GEO, undefined, n * 2]} castShadow raycast={noRaycast}>
        <meshLambertMaterial vertexColors color={dark ? '#8a8494' : '#ffffff'} flatShading />
      </instancedMesh>
    </group>
  );
}
