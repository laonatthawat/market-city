import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Object3D, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { SECTOR_IDS } from '../engine/types';
import { useGame } from '../store/gameStore';
import { merge, part } from './geom';
import { ROAD_INNER, ROAD_OUTER } from './layout';

/**
 * Ring-road traffic: several vehicle types, car-following (no overlaps) and traffic lights at
 * every junction where a spoke road meets the ring. Cars queue at red lights and pull away on green.
 * Everything is instanced: one draw call per vehicle type, plus one for the night lights.
 */

const noRaycast = () => {};
const _o = new Object3D();
const _c = new Color();
const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);

const MID = (ROAD_INNER + ROAD_OUTER) / 2;
/** Lane 0 runs clockwise (inner), lane 1 counter-clockwise (outer). */
const LANES = [
  { r: MID - 0.6, dir: -1 },
  { r: MID + 0.6, dir: 1 },
];
const JUNCTIONS = SECTOR_IDS.map((_, k) => (k / SECTOR_IDS.length) * Math.PI * 2 - Math.PI / 2);
/** Half the width of a junction along the ring (spoke road + a little margin). */
const JUNCTION_HALF = 1.9;

// --- traffic light timing -------------------------------------------------------

const CYCLE = 12;
const GREEN = 6.5;
const YELLOW = 1.6;
export type Signal = 'green' | 'yellow' | 'red';

/** Seconds of red left for ring traffic at junction k (0 when green or yellow): pedestrians cross in it. */
export function ringRedLeft(k: number, t: number): number {
  const ph = (t + k * 1.7) % CYCLE;
  return ph >= GREEN + YELLOW ? CYCLE - ph : 0;
}

/** Signal for ring traffic at junction k; neighbouring junctions are offset so they don't all switch at once. */
export function ringSignal(k: number, t: number): Signal {
  const ph = (t + k * 1.7) % CYCLE;
  return ph < GREEN ? 'green' : ph < GREEN + YELLOW ? 'yellow' : 'red';
}

// --- vehicle models -------------------------------------------------------------

const GLASS = '#3d4a63';
const TYRE = '#26232e';
const WHITE = '#ffffff';
const HEAD = '#fff1b8';
const TAIL = '#ff4d5e';

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string) => part(new BoxGeometry(w, h, d), x, y, z, c);
const wheels = (xs: number[], z: number, r = 0.14) =>
  xs.flatMap((x) => [-z, z].map((zz) => part(new CylinderGeometry(r, r, 0.1, 10).rotateX(Math.PI / 2), x, r, zz, TYRE)));
const lamps = (front: number, back: number, y: number, z: number) => [
  box(0.04, 0.08, 0.14, front, y, z, HEAD),
  box(0.04, 0.08, 0.14, front, y, -z, HEAD),
  box(0.04, 0.08, 0.12, back, y, z, TAIL),
  box(0.04, 0.08, 0.12, back, y, -z, TAIL),
];

interface VehicleType {
  id: string;
  /** Body parts are white so the per-car colour shows through; glass and tyres stay dark. */
  body: BufferGeometry;
  lights: BufferGeometry;
  length: number;
  speed: number;
  colors: string[];
  count: number;
}

/** Local space: forward is +X, wheels touch y = 0. */
const TYPES: VehicleType[] = [
  {
    id: 'sedan',
    body: merge([box(1.2, 0.28, 0.6, 0, 0.3, 0, WHITE), box(0.64, 0.3, 0.54, -0.08, 0.59, 0, GLASS), box(0.62, 0.05, 0.52, -0.08, 0.765, 0, WHITE), ...wheels([-0.38, 0.38], 0.29)]),
    lights: merge(lamps(0.61, -0.61, 0.34, 0.19)),
    length: 1.2,
    speed: 2.6,
    colors: ['#ff8fb1', '#9fb8e8', '#7fd6a8', '#f3eee6', '#b9a8ec', '#e0566e', '#6f87c2'],
    count: 8,
  },
  {
    id: 'hatch',
    body: merge([box(0.95, 0.3, 0.58, 0, 0.31, 0, WHITE), box(0.55, 0.3, 0.52, -0.1, 0.6, 0, GLASS), box(0.56, 0.05, 0.5, -0.11, 0.775, 0, WHITE), ...wheels([-0.3, 0.3], 0.28, 0.13)]),
    lights: merge(lamps(0.485, -0.485, 0.36, 0.18)),
    length: 0.95,
    speed: 2.4,
    colors: ['#ffd36e', '#7fd6a8', '#ff9f7a', '#9fd0f0', '#f4adc3'],
    count: 6,
  },
  {
    id: 'suv',
    body: merge([
      box(1.28, 0.42, 0.66, 0, 0.38, 0, WHITE),
      box(0.86, 0.32, 0.6, -0.12, 0.75, 0, GLASS),
      box(0.86, 0.06, 0.6, -0.12, 0.94, 0, WHITE),
      box(0.7, 0.04, 0.5, -0.12, 0.99, 0, TYRE), // roof rack
      ...wheels([-0.42, 0.42], 0.31, 0.17),
    ]),
    lights: merge(lamps(0.65, -0.65, 0.48, 0.21)),
    length: 1.28,
    speed: 2.4,
    colors: ['#5b5566', '#f3eee6', '#6fae78', '#c47f3e', '#7c6ce0'],
    count: 5,
  },
  {
    id: 'pickup',
    body: merge([
      box(1.4, 0.3, 0.64, 0, 0.32, 0, WHITE),
      box(0.5, 0.32, 0.58, 0.2, 0.63, 0, GLASS),
      box(0.5, 0.05, 0.56, 0.2, 0.8, 0, WHITE),
      // open bed with side walls
      box(0.62, 0.16, 0.05, -0.38, 0.55, 0.3, WHITE),
      box(0.62, 0.16, 0.05, -0.38, 0.55, -0.3, WHITE),
      box(0.05, 0.16, 0.64, -0.69, 0.55, 0, WHITE),
      box(0.3, 0.18, 0.3, -0.38, 0.56, 0, '#b88c66'), // cargo crate
      ...wheels([-0.44, 0.44], 0.3, 0.15),
    ]),
    lights: merge(lamps(0.71, -0.71, 0.36, 0.2)),
    length: 1.4,
    speed: 2.3,
    colors: ['#e0566e', '#9fb8e8', '#d8c19c', '#3b3346'],
    count: 3,
  },
  {
    id: 'taxi',
    body: merge([
      box(1.2, 0.28, 0.6, 0, 0.3, 0, WHITE),
      box(0.64, 0.3, 0.54, -0.08, 0.59, 0, GLASS),
      box(0.62, 0.05, 0.52, -0.08, 0.765, 0, WHITE),
      box(0.26, 0.11, 0.16, -0.08, 0.845, 0, '#fff8e0'), // TAXI sign
      box(1.21, 0.05, 0.61, 0, 0.36, 0, '#3b3346'), // checker stripe
      ...wheels([-0.38, 0.38], 0.29),
    ]),
    lights: merge([...lamps(0.61, -0.61, 0.34, 0.19), box(0.27, 0.06, 0.17, -0.08, 0.86, 0, '#ffe08a')]),
    length: 1.2,
    speed: 2.6,
    colors: ['#ffcf3f'],
    count: 4,
  },
  {
    id: 'bus',
    body: merge([
      box(2.5, 0.7, 0.72, 0, 0.55, 0, WHITE),
      box(2.3, 0.26, 0.735, -0.05, 0.68, 0, GLASS),
      box(0.04, 0.4, 0.6, 1.252, 0.62, 0, GLASS), // windscreen
      box(2.4, 0.06, 0.66, 0, 0.93, 0, WHITE),
      ...wheels([-0.8, 0.8], 0.33, 0.17),
    ]),
    lights: merge([...lamps(1.255, -1.255, 0.35, 0.24), box(0.03, 0.1, 0.4, 1.26, 0.9, 0, '#ffb347')]),
    length: 2.5,
    speed: 1.9,
    colors: ['#ffd36e', '#7fd6a8', '#ff8fb1'],
    count: 2,
  },
  {
    id: 'truck',
    body: merge([
      box(0.55, 0.55, 0.66, 0.68, 0.45, 0, WHITE),
      box(0.04, 0.24, 0.58, 0.96, 0.6, 0, GLASS),
      box(1.4, 0.82, 0.72, -0.32, 0.6, 0, '#f6f2f8'), // cargo box stays pale
      ...wheels([-0.65, -0.25, 0.65], 0.32, 0.15),
    ]),
    lights: merge(lamps(0.97, -1.03, 0.34, 0.22)),
    length: 2.0,
    speed: 2.0,
    colors: ['#e0566e', '#5fb4e6', '#23a77a'],
    count: 2,
  },
];

interface Car {
  type: number;
  index: number;
  lane: number;
  /** Arc position along the lane's travel direction. */
  s: number;
  speed: number;
  v0: number;
  len: number;
  active: boolean;
  /** 0..1 fade for appearing / leaving. */
  vis: number;
}

const CIRC = LANES.map((l) => 2 * Math.PI * l.r);
const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Arc position of junction k's stop line for a lane (cars stop before the crossing). */
function stopLine(lane: number, k: number): number {
  const { r, dir } = LANES[lane];
  return mod(dir * JUNCTIONS[k] * r - JUNCTION_HALF, CIRC[lane]);
}

export function Cars({ dark }: { dark: boolean }) {
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const lightMeshes = useRef<(InstancedMesh | null)[]>([]);
  const bodyMat = useMemo(() => new MeshLambertMaterial({ vertexColors: true, flatShading: true }), []);
  const lightMat = useMemo(() => new MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);

  const cars = useMemo<Car[]>(() => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const out: Car[] = [];
    TYPES.forEach((t, ti) => {
      for (let i = 0; i < t.count; i++) out.push({ type: ti, index: i, lane: 0, s: 0, speed: 0, v0: t.speed * (0.9 + rnd() * 0.2), len: t.length, active: false, vis: 0 });
    });
    // Shuffle so the activation order mixes vehicle types, then spread them over both lanes.
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    out.forEach((c, i) => (c.lane = i % 2));
    return out;
  }, []);

  const colorsSet = useRef(false);
  const spawnTimer = useRef(0);

  useFrame((frame, rawDt) => {
    const ms = meshes.current;
    if (ms.some((m) => !m)) return;
    if (!colorsSet.current) {
      for (const c of cars) ms[c.type]!.setColorAt(c.index, _c.set(TYPES[c.type].colors[c.index % TYPES[c.type].colors.length]));
      for (const m of ms) if (m!.instanceColor) m!.instanceColor.needsUpdate = true;
      colorsSet.current = true;
    }
    const st = useGame.getState();
    const pace = st.flow === 'fastforward' ? 3 : 1;
    const dt = Math.min(rawDt, 0.05) * pace;
    const t = frame.clock.elapsedTime * pace;

    // How busy the roads are follows the market mood; cars join or leave one at a time.
    const mood = st.phase === 'playing' ? st.weatherScore / 100 : 0.6;
    const target = Math.round(8 + mood * (cars.length - 8));
    spawnTimer.current -= rawDt;
    if (spawnTimer.current <= 0) {
      spawnTimer.current = 0.35;
      const live = cars.filter((c) => c.active).length;
      if (live < target) spawn(cars);
      else if (live > target) {
        const leaving = cars.find((c) => c.active);
        if (leaving) leaving.active = false;
      }
    }

    const signals = JUNCTIONS.map((_, k) => ringSignal(k, t));
    for (let lane = 0; lane < LANES.length; lane++) {
      const C = CIRC[lane];
      const list = cars.filter((c) => c.lane === lane && (c.active || c.vis > 0)).sort((a, b) => a.s - b.s);
      for (let i = 0; i < list.length; i++) {
        const car = list[i];
        const lead = list[(i + 1) % list.length];
        let gap = lead === car ? Infinity : mod(lead.s - car.s, C) - (lead.len + car.len) / 2;
        // Red (or a late yellow) light ahead: treat the stop line as the car in front.
        for (let k = 0; k < JUNCTIONS.length; k++) {
          const sig = signals[k];
          if (sig === 'green') continue;
          const d = mod(stopLine(lane, k) - car.s - car.len / 2, C);
          if (d > 9) continue;
          if (sig === 'yellow' && d < 0.6) continue; // too close to stop: go through
          gap = Math.min(gap, d);
        }
        const want = car.v0 * Math.max(0, Math.min(1, (gap - 0.45) / 2.2));
        car.speed += (want - car.speed) * Math.min(1, dt * (want < car.speed ? 7 : 1.6));
        car.s = mod(car.s + car.speed * dt, C);
      }
    }

    // Write instance matrices (hidden cars are scaled to zero).
    for (const c of cars) {
      c.vis += ((c.active ? 1 : 0) - c.vis) * Math.min(1, rawDt * 4);
      if (!c.active && c.vis < 0.02) c.vis = 0;
      const { r, dir } = LANES[c.lane];
      const a = (dir * c.s) / r;
      _o.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      _o.rotation.set(0, -a + (dir > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
      _o.scale.setScalar(c.vis);
      _o.updateMatrix();
      ms[c.type]!.setMatrixAt(c.index, _o.matrix);
      lightMeshes.current[c.type]?.setMatrixAt(c.index, _o.matrix);
    }
    for (const m of ms) m!.instanceMatrix.needsUpdate = true;
    for (const m of lightMeshes.current) if (m) m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {TYPES.map((t, i) => (
        <instancedMesh key={t.id} ref={(m) => void (meshes.current[i] = m)} args={[t.body, bodyMat, t.count]} castShadow frustumCulled={false} raycast={noRaycast} />
      ))}
      {TYPES.map((t, i) => (
        <instancedMesh key={`${t.id}-l`} ref={(m) => void (lightMeshes.current[i] = m)} args={[t.lights, lightMat, t.count]} visible={dark} frustumCulled={false} raycast={noRaycast} />
      ))}
    </group>
  );
}

/** Put one waiting car into the biggest gap of the emptier lane, so it never appears on top of another. */
function spawn(cars: Car[]) {
  const idle = cars.find((c) => !c.active && c.vis === 0);
  if (!idle) return;
  let best = { lane: idle.lane, s: 0, gap: -1 };
  for (let lane = 0; lane < LANES.length; lane++) {
    const C = CIRC[lane];
    const occ = cars.filter((c) => c.lane === lane && (c.active || c.vis > 0)).sort((a, b) => a.s - b.s);
    if (occ.length === 0) {
      if (C > best.gap) best = { lane, s: Math.random() * C, gap: C };
      continue;
    }
    for (let i = 0; i < occ.length; i++) {
      const a = occ[i];
      const b = occ[(i + 1) % occ.length];
      const gap = (occ.length === 1 ? C : mod(b.s - a.s, C)) - (a.len + b.len) / 2;
      if (gap > best.gap) best = { lane, s: mod(a.s + (a.len / 2 + gap / 2), C), gap };
    }
  }
  if (best.gap < idle.len + 1.6) return; // roads are full
  idle.lane = best.lane;
  idle.s = best.s;
  idle.speed = idle.v0 * 0.5;
  idle.active = true;
}

// --- traffic lights and crossings ------------------------------------------------

/** Pole + arm + signal housing, in local space facing +Z (towards the approaching cars). */
const SIGNAL_POLE = merge([
  part(new CylinderGeometry(0.06, 0.08, 2.0, 6), 0, 1.0, 0, '#5b5566'),
  part(new BoxGeometry(0.26, 0.72, 0.18), 0, 2.15, 0.02, '#2f2c38'),
  part(new BoxGeometry(0.3, 0.05, 0.22), 0, 2.53, 0.04, '#2f2c38'),
]);
const LAMP = new SphereGeometry(0.075, 8, 6);
const LAMP_Y = { red: 2.37, yellow: 2.15, green: 1.93 } as const;
const DIM = { red: new Color('#4a2228'), yellow: new Color('#4a4022'), green: new Color('#1f3d2c') };
const LIT = { red: new Color('#ff3b4d'), yellow: new Color('#ffc23d'), green: new Color('#3dff8f') };

/** Each junction gets two signals, one for each ring lane, standing at the kerb before the crossing. */
const SIGNALS = JUNCTIONS.flatMap((theta, k) =>
  LANES.map((lane) => {
    // On the kerb edge, clear of people walking along the sidewalk.
    const kerbR = lane.dir > 0 ? ROAD_OUTER + 0.12 : ROAD_INNER - 0.12;
    // Before the junction from this lane's point of view.
    const a = theta - (lane.dir * (JUNCTION_HALF + 0.2)) / kerbR;
    const x = Math.cos(a) * kerbR;
    const z = Math.sin(a) * kerbR;
    // Face oncoming traffic: opposite to the travel direction (tangent).
    const tx = -Math.sin(a) * lane.dir;
    const tz = Math.cos(a) * lane.dir;
    return { k, x, z, yaw: Math.atan2(-tx, -tz) };
  }),
);

export function TrafficLights() {
  const poles = useRef<InstancedMesh>(null);
  const lamps = useRef<Record<keyof typeof LAMP_Y, InstancedMesh | null>>({ red: null, yellow: null, green: null });
  const lampMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), []);
  const last = useRef<string>('');

  useLayoutEffect(() => {
    const p = poles.current;
    if (!p) return;
    SIGNALS.forEach((sg, i) => {
      _q.setFromAxisAngle(UP, sg.yaw);
      p.setMatrixAt(i, _m.compose(_p.set(sg.x, 0.04, sg.z), _q, _s.set(1, 1, 1)));
      for (const key of Object.keys(LAMP_Y) as (keyof typeof LAMP_Y)[]) {
        const m = lamps.current[key];
        if (!m) continue;
        // Lamp sits on the housing's front face.
        const off = new Vector3(0, LAMP_Y[key], 0.11).applyQuaternion(_q);
        m.setMatrixAt(i, _m.compose(_p.set(sg.x + off.x, 0.04 + off.y, sg.z + off.z), _q, _s.set(1, 1, 1)));
      }
    });
    p.instanceMatrix.needsUpdate = true;
    for (const m of Object.values(lamps.current)) if (m) m.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((frame) => {
    const pace = useGame.getState().flow === 'fastforward' ? 3 : 1;
    const t = frame.clock.elapsedTime * pace;
    const states = JUNCTIONS.map((_, k) => ringSignal(k, t));
    const key = states.join();
    if (key === last.current) return;
    last.current = key;
    SIGNALS.forEach((sg, i) => {
      const s = states[sg.k];
      for (const c of Object.keys(LAMP_Y) as (keyof typeof LAMP_Y)[]) lamps.current[c]?.setColorAt(i, s === c ? LIT[c] : DIM[c]);
    });
    for (const m of Object.values(lamps.current)) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={poles} args={[SIGNAL_POLE, undefined, SIGNALS.length]} castShadow raycast={noRaycast}>
        <meshLambertMaterial vertexColors flatShading />
      </instancedMesh>
      {(Object.keys(LAMP_Y) as (keyof typeof LAMP_Y)[]).map((c) => (
        <instancedMesh key={c} ref={(m) => void (lamps.current[c] = m)} args={[LAMP, lampMat, SIGNALS.length]} raycast={noRaycast} />
      ))}
    </group>
  );
}
