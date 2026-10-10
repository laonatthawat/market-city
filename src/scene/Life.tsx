import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { useGame } from '../store/gameStore';
import { merge, part } from './geom';
import type { CityLayout, Lot } from './layout';
import { toWorld } from './layout';
import { buildWalkGraph } from './Paths';
import { ringRedLeft } from './Traffic';
import { PAD_TOP } from './World';

/**
 * Lightweight animated life: everything is instanced and updated in place (no per-frame allocations).
 * Activity follows the market mood: busy streets in good times, quiet ones in bad.
 */

const _o = new Object3D();
const _c = new Color();
const noRaycast = () => {};

function seeded(n: number) {
  let s = n * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

const PEOPLE_COLORS = ['#ff8fb1', '#7c6ce0', '#23a77a', '#f2a03d', '#5fb4e6', '#e0566e', '#3b3346', '#f3eee6', '#ffd36e', '#8fd0b8'];
const PANTS = ['#3e4a66', '#55525f', '#6b5a4e', '#2f3a55', '#8a7f8f', '#c9b8a6'];
const SKIN = ['#f1c9a5', '#d9a07a', '#a8714f', '#f6d9be', '#7d5238'];
const HAIR = ['#3b2a22', '#1f1b24', '#6b4a32', '#c9974f', '#8a3b2a', '#d8d2cc'];

// Body parts with their pivots at the origin (limbs hang down from the hip/shoulder joint).
const TORSO = merge([part(new CylinderGeometry(0.1, 0.12, 0.32, 6), 0, 0.42, 0), part(new CylinderGeometry(0.06, 0.1, 0.06, 6), 0, 0.61, 0)]);
const LEG = merge([part(new CylinderGeometry(0.045, 0.04, 0.24, 5), 0, -0.12, 0, '#ffffff'), part(new BoxGeometry(0.07, 0.04, 0.12), 0, -0.25, 0.02, '#4a4552')]);
const ARM = merge([part(new CylinderGeometry(0.034, 0.03, 0.25, 5), 0, -0.12, 0, '#ffffff'), part(new OctahedronGeometry(0.035, 0), 0, -0.26, 0, '#f1c9a5')]);
const HEAD = new IcosahedronGeometry(0.1, 0).translate(0, 0.7, 0);
const HAIR_GEO = new SphereGeometry(0.108, 6, 3, 0, Math.PI * 2, 0, Math.PI / 1.9).translate(0, 0.715, -0.01);

const HIP_Y = 0.27;
const SHOULDER_Y = 0.55;

interface Person {
  /** Current edge, travel direction along it (+1 = a→b) and distance travelled on it. */
  e: number;
  dir: 1 | -1;
  s: number;
  /** Edge to take once the ring-road light turns red (waiting at a crossing). */
  pending: number;
  pendingDir: 1 | -1;
  speed: number;
  /** Keeps to this side of the path (right of travel), so opposite flows pass each other. */
  offset: number;
  phase: number;
  size: number;
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
}

const _base = new Matrix4();
const _limb = new Matrix4();
const _rot = new Matrix4();
const _t = new Matrix4();
const _a = new Vector3();
const _b = new Vector3();

/** A crossing over the ring road takes ~2.5 s at a brisk pace: start only with at least this much red left. */
const CROSS_MIN_RED = 2.8;
const CROSS_PACE = 1.6;
/** 3.2-unit crossing in under CROSS_MIN_RED seconds. */
const CROSS_MIN_SPEED = 1.35;
const WALKERS = 170;

/**
 * Everyone walking in the city, on the connected pedestrian network (Paths.tsx): plaza, sidewalks,
 * ring-road crossings (on red only), avenues, district walkways and lanes, and the coastal promenade.
 * Walkers pick a random way at every junction. `activity` (0..1) controls how many are out.
 */
export function Crowd({ districts, activity }: { districts: CityLayout['districts']; activity: number }) {
  const torsos = useRef<InstancedMesh>(null);
  const arms = useRef<InstancedMesh>(null);
  const legs = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const hairs = useRef<InstancedMesh>(null);
  const mats = useMemo(
    () => ({
      cloth: new MeshLambertMaterial({ flatShading: true }),
      limb: new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      skin: new MeshLambertMaterial({ flatShading: true }),
      hair: new MeshLambertMaterial({ flatShading: true }),
    }),
    [],
  );
  const graph = useMemo(() => buildWalkGraph(districts), [districts]);
  const people = useMemo(() => {
    const r = seeded(7);
    const total = graph.edges.reduce((a, e) => a + e.len, 0);
    // Spread people over the network in proportion to path length.
    const pickEdge = () => {
      let x = r() * total;
      for (let i = 0; i < graph.edges.length; i++) {
        x -= graph.edges[i].len;
        if (x <= 0) return i;
      }
      return 0;
    };
    return Array.from({ length: WALKERS }, (): Person => {
      const e = pickEdge();
      return {
        e,
        dir: r() < 0.5 ? 1 : -1,
        s: r() * graph.edges[e].len,
        pending: -1,
        pendingDir: 1,
        speed: 0.5 + r() * 0.3,
        offset: 0.1 + r() * 0.2,
        phase: r() * 10,
        size: 0.9 + r() * 0.2,
        shirt: PEOPLE_COLORS[Math.floor(r() * PEOPLE_COLORS.length)],
        pants: PANTS[Math.floor(r() * PANTS.length)],
        skin: SKIN[Math.floor(r() * SKIN.length)],
        hair: HAIR[Math.floor(r() * HAIR.length)],
      };
    });
  }, [graph]);
  const rand = useMemo(() => seeded(19), []);
  const colorsSet = useRef(false);
  const act = useRef(activity);
  act.current = activity;

  useFrame((frame, rawDt) => {
    const [tm, am, lm, hm, hr] = [torsos.current, arms.current, legs.current, heads.current, hairs.current];
    if (!tm || !am || !lm || !hm || !hr) return;
    if (!colorsSet.current) {
      people.forEach((p, i) => {
        tm.setColorAt(i, _c.set(p.shirt));
        am.setColorAt(i * 2, _c);
        am.setColorAt(i * 2 + 1, _c);
        lm.setColorAt(i * 2, _c.set(p.pants));
        lm.setColorAt(i * 2 + 1, _c);
        hm.setColorAt(i, _c.set(p.skin));
        hr.setColorAt(i, _c.set(p.hair));
      });
      for (const m of [tm, am, lm, hm, hr]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
      colorsSet.current = true;
    }
    // Same clock as the traffic lights (they run faster while the game fast-forwards).
    const pace = useGame.getState().flow === 'fastforward' ? 3 : 1;
    const tLights = frame.clock.elapsedTime * pace;
    const step = Math.min(rawDt, 0.1) * pace;
    const t = frame.clock.elapsedTime;
    const count = Math.round(Math.max(0, Math.min(1, act.current)) * people.length);
    const { edges, adj } = graph;

    for (let i = 0; i < count; i++) {
      const p = people[i];
      let walking = true;
      if (p.pending >= 0) {
        // Waiting at the kerb for the ring road's red light.
        if (ringRedLeft(edges[p.pending].junction!, tLights) >= CROSS_MIN_RED) {
          p.e = p.pending;
          p.dir = p.pendingDir;
          p.s = 0;
          p.pending = -1;
        } else walking = false;
      }
      if (walking) {
        const e = edges[p.e];
        // Crossings are walked briskly so everyone is over before the ring's light turns green.
        p.s += (e.junction !== undefined ? Math.max(p.speed * CROSS_PACE, CROSS_MIN_SPEED) : p.speed) * step;
        if (p.s >= e.len) {
          const node = p.dir > 0 ? e.b : e.a;
          const options = adj[node].filter((x) => x !== p.e);
          const next = options.length ? options[Math.floor(rand() * options.length)] : p.e;
          const nextDir: 1 | -1 = edges[next].a === node ? 1 : -1;
          if (edges[next].junction !== undefined && ringRedLeft(edges[next].junction!, tLights) < CROSS_MIN_RED) {
            p.pending = next;
            p.pendingDir = nextDir;
            p.s = e.len;
            walking = false;
          } else {
            p.s -= e.len;
            p.e = next;
            p.dir = nextDir;
          }
        }
      }

      // Position along the polyline, offset to the right of the direction of travel.
      const e = edges[p.e];
      const u = Math.min(e.len, Math.max(0, p.dir > 0 ? p.s : e.len - p.s));
      let k = 1;
      while (k < e.cum.length - 1 && e.cum[k] < u) k++;
      const segLen = e.cum[k] - e.cum[k - 1] || 1;
      const f = (u - e.cum[k - 1]) / segLen;
      _a.copy(e.pts[k - 1]);
      _b.copy(e.pts[k]);
      _o.position.lerpVectors(_a, _b, f);
      let hx = (_b.x - _a.x) * p.dir;
      let hz = (_b.z - _a.z) * p.dir;
      const hl = Math.hypot(hx, hz) || 1;
      hx /= hl;
      hz /= hl;
      const off = e.maxOff !== undefined ? Math.min(p.offset, e.maxOff) : p.offset;
      _o.position.x += -hz * off;
      _o.position.z += hx * off;
      const stride = walking ? Math.sin(t * 7 + p.phase) : 0;
      _o.position.y += 0.01 + Math.abs(stride) * 0.03;
      _o.rotation.set(0, Math.atan2(hx, hz), 0);
      _o.scale.setScalar(p.size);
      _o.updateMatrix();
      _base.copy(_o.matrix);
      tm.setMatrixAt(i, _base);
      hm.setMatrixAt(i, _base);
      hr.setMatrixAt(i, _base);
      for (const side of [-1, 1]) {
        const j = i * 2 + (side > 0 ? 1 : 0);
        _rot.makeRotationX(stride * 0.5 * side);
        lm.setMatrixAt(j, _limb.multiplyMatrices(_base, _t.makeTranslation(side * 0.055, HIP_Y, 0)).multiply(_rot));
        _rot.makeRotationX(-stride * 0.45 * side);
        am.setMatrixAt(j, _limb.multiplyMatrices(_base, _t.makeTranslation(side * 0.14, SHOULDER_Y, 0)).multiply(_rot));
      }
    }
    tm.count = hm.count = hr.count = count;
    am.count = lm.count = count * 2;
    for (const m of [tm, am, lm, hm, hr]) m.instanceMatrix.needsUpdate = true;
  });

  const max = people.length;
  return (
    <group name="crowd">
      <instancedMesh ref={torsos} args={[TORSO, mats.cloth, max]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={arms} args={[ARM, mats.limb, max * 2]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={legs} args={[LEG, mats.limb, max * 2]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={heads} args={[HEAD, mats.skin, max]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={hairs} args={[HAIR_GEO, mats.hair, max]} frustumCulled={false} raycast={noRaycast} />
    </group>
  );
}

/** People in the market city: busier when the market mood is good. */
export function CityWalkers({ districts }: { districts: CityLayout['districts'] }) {
  const score = useGame((s) => (s.phase === 'playing' ? Math.round(s.weatherScore / 10) : 6));
  return <Crowd districts={districts} activity={0.3 + (score / 10) * 0.7} />;
}

const BIRDS = 7;

/** A small flock circling high above; they stay away in bad weather. */
export function Birds() {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new PlaneGeometry(0.9, 0.3), []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#5b5566', side: 2 }), []);
  const q = useMemo(() => new Quaternion(), []);
  const v = useMemo(() => new Vector3(), []);
  const s3 = useMemo(() => new Vector3(1, 1, 1), []);
  const m4 = useMemo(() => new Matrix4(), []);
  const show = useRef(1);

  useFrame((frame, dt) => {
    const m = ref.current;
    if (!m) return;
    const st = useGame.getState();
    const bad = st.weather === 'rain' || st.weather === 'storm';
    show.current += ((bad ? 0 : 1) - show.current) * Math.min(1, dt);
    const t = frame.clock.elapsedTime;
    for (let i = 0; i < BIRDS; i++) {
      const a = t * 0.12 + i * 0.35;
      const r = 30 + (i % 3) * 3;
      v.set(Math.cos(a) * r, 26 + Math.sin(t + i) * 1.2 + (1 - show.current) * 40, Math.sin(a) * r);
      q.setFromAxisAngle(_o.up, -a);
      // Flap: squash the wing plane on Y.
      s3.set(1, 0.3 + Math.abs(Math.sin(t * 8 + i)) * 0.9, 1);
      m.setMatrixAt(i, m4.compose(v, q, s3));
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, BIRDS]} frustumCulled={false} raycast={noRaycast} />;
}

const PUFFS = 4;

/** Chimney smoke rising from a few filler houses. */
export function Smoke({ lots }: { lots: readonly Lot[] }) {
  const sources = useMemo(() => lots.filter((l) => !l.companyId).filter((_, i) => i % 3 === 0).slice(0, 8), [lots]);
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new IcosahedronGeometry(0.35, 0), []);
  const mat = useMemo(() => new MeshLambertMaterial({ color: '#efeae6', transparent: true, opacity: 0.75, flatShading: true }), []);

  useFrame((frame) => {
    const m = ref.current;
    if (!m) return;
    const t = frame.clock.elapsedTime;
    let n = 0;
    sources.forEach((l, si) => {
      for (let k = 0; k < PUFFS; k++) {
        const life = (t * 0.35 + k / PUFFS + si * 0.13) % 1;
        // Rises from the chimney placed by <Fillers> (World.tsx).
        const top = PAD_TOP + l.fillerHeight + 0.55 + l.fillerWidth * 0.22;
        const w = toWorld(l, l.fillerWidth * 0.25 + Math.sin(life * 3 + si) * 0.3, l.fillerWidth * 0.16);
        _o.position.set(w.x, top + 0.2 + life * 3.2, w.z);
        _o.scale.setScalar(0.4 + life * 1.1);
        _o.rotation.set(0, 0, 0);
        _o.updateMatrix();
        m.setMatrixAt(n++, _o.matrix);
      }
    });
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, 8 * PUFFS]} frustumCulled={false} raycast={noRaycast} />;
}
