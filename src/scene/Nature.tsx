import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry, Group, InstancedMesh } from 'three';
import { useGame } from '../store/gameStore';
import { merge, part } from './geom';
import type { CityLayout } from './layout';
import { ISLAND_RADIUS, LIGHTHOUSE_SPOT } from './layout';

/**
 * Natural detail around the city: wild flowers, grass tufts, boulders, beach palms and coastal rocks,
 * plus a little movement (sailboats, butterflies, hot-air balloons). Everything is instanced or
 * pre-merged, small props skip shadows, and nothing allocates per frame.
 */

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _s = new Vector3();
const _c = new Color();
const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const noRaycast = () => {};

/** Beach level (top of the sand ring in Environment.tsx). */
const BEACH_Y = -0.4;
const SEA_Y = -1.45;

function seeded(n: number) {
  let s = n * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

const FLOWER_TONES = ['#ff8fb1', '#ffd36e', '#b9a8ec', '#ffffff', '#ff9f7a', '#8fc8ff'];

// Wild flower clump: leaves (green, fixed) + blossoms (white, tinted per instance).
const CLUMP_LEAVES = merge(
  [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    return part(new ConeGeometry(0.06, 0.34, 3).rotateZ(Math.cos(a) * 0.35).rotateX(Math.sin(a) * 0.35), Math.cos(a) * 0.1, 0.16, Math.sin(a) * 0.1, '#6fb36f');
  }),
);
const CLUMP_BLOOMS = merge(
  [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = i % 2 ? 0.16 : 0.08;
    return part(new OctahedronGeometry(0.08, 0), Math.cos(a) * r, 0.3 + (i % 3) * 0.05, Math.sin(a) * r, '#ffffff');
  }),
);
const TUFT = merge(
  [-0.5, 0, 0.5, 1.2].map((lean, i) => part(new ConeGeometry(0.045, 0.42 - i * 0.04, 3).rotateZ(lean * 0.4).rotateY(i * 1.7), lean * 0.06, 0.19, (i % 2) * 0.05)),
);

function rockGeometry(seed: number) {
  const g = new IcosahedronGeometry(1, 0);
  const pos = g.attributes.position;
  // The icosahedron is non-indexed: jitter by corner position (not vertex index) so the rock stays closed.
  const jitter = new Map<string, number>();
  const r = seeded(seed);
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, 0.78 + r() * 0.44);
    const k = jitter.get(key)!;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Wild flowers, grass tufts and boulders scattered over the open land. */
export function Meadow({ layout, dark }: { layout: CityLayout; dark: boolean }) {
  const leaves = useRef<InstancedMesh>(null);
  const blooms = useRef<InstancedMesh>(null);
  const tufts = useRef<InstancedMesh>(null);
  const rocks = useRef<InstancedMesh>(null);
  const rockGeo = useMemo(() => rockGeometry(7).scale(1, 0.62, 0.9), []);

  useLayoutEffect(() => {
    const [lm, bm, tm, rm] = [leaves.current, blooms.current, tufts.current, rocks.current];
    if (!lm || !bm || !tm || !rm) return;
    layout.flowers.forEach((f, i) => {
      _q.setFromAxisAngle(UP, f.x * 2.7);
      _m.compose(_p.set(f.x, 0, f.z), _q, _s.setScalar(f.s));
      lm.setMatrixAt(i, _m);
      bm.setMatrixAt(i, _m);
      _c.set(FLOWER_TONES[Math.floor(f.tone * FLOWER_TONES.length)]);
      if (dark) _c.multiplyScalar(0.6);
      bm.setColorAt(i, _c);
    });
    layout.tufts.forEach((t, i) => {
      _q.setFromAxisAngle(UP, t.z * 3.3);
      tm.setMatrixAt(i, _m.compose(_p.set(t.x, 0, t.z), _q, _s.setScalar(t.s)));
      _c.set(i % 3 === 0 ? '#7fbf6a' : i % 3 === 1 ? '#94cc72' : '#6aa864');
      if (dark) _c.multiplyScalar(0.55);
      tm.setColorAt(i, _c);
    });
    layout.rocks.forEach((r, i) => {
      _q.setFromAxisAngle(UP, r.x * 1.9);
      rm.setMatrixAt(i, _m.compose(_p.set(r.x, r.s * 0.25, r.z), _q, _s.set(r.s, r.s, r.s * 0.85)));
      _c.set(i % 2 ? '#c9c2cc' : '#b5adb9');
      if (dark) _c.multiplyScalar(0.6);
      rm.setColorAt(i, _c);
    });
    lm.count = bm.count = layout.flowers.length;
    tm.count = layout.tufts.length;
    rm.count = layout.rocks.length;
    for (const m of [lm, bm, tm, rm]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [layout, dark]);

  return (
    <group name="meadow">
      <instancedMesh ref={leaves} args={[CLUMP_LEAVES, undefined, 200]} raycast={noRaycast}>
        <meshLambertMaterial vertexColors flatShading color={dark ? '#8c9a8c' : '#ffffff'} />
      </instancedMesh>
      <instancedMesh ref={blooms} args={[CLUMP_BLOOMS, undefined, 200]} raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={tufts} args={[TUFT, undefined, 360]} raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={rocks} args={[rockGeo, undefined, 40]} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
    </group>
  );
}

// --- Beach: palms and coastal rocks ---------------------------------------------------------

const PALM_TRUNK = merge(
  Array.from({ length: 7 }, (_, i) => {
    const y = i * 0.42;
    const lean = (i / 6) ** 1.6 * 0.55;
    return part(new CylinderGeometry(0.1 - i * 0.006, 0.13 - i * 0.006, 0.44, 7).rotateZ(-0.08 - i * 0.02), lean, y + 0.21, 0, i % 2 ? '#a07a58' : '#8d6a4c');
  }),
);
const PALM_TOP = (() => {
  const top = new Vector3(0.55, 2.98, 0);
  const fronds = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    // A long flat leaf pointing out (+X) and drooping, then turned around the crown.
    const g = new ConeGeometry(0.26, 1.7, 4).rotateZ(-Math.PI / 2).scale(1, 0.18, 1).translate(0.85, 0, 0);
    g.rotateZ(-0.38 - (i % 2) * 0.18).rotateY(a);
    return part(g, top.x, top.y, top.z, i % 2 ? '#5fae6a' : '#6fbf73');
  });
  const nuts = [0, 1, 2].map((i) => part(new SphereGeometry(0.1, 6, 5), top.x + Math.cos(i * 2.1) * 0.13, top.y - 0.12, Math.sin(i * 2.1) * 0.13, '#7a5a3a'));
  return merge([...fronds, ...nuts, part(new IcosahedronGeometry(0.14, 0), top.x, top.y, top.z, '#6b8f4e')]);
})();

const PALMS = (() => {
  const r = seeded(21);
  return Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2 + (r() - 0.5) * 0.18;
    const rad = ISLAND_RADIUS + 1.4 + r() * 1.1;
    return { x: Math.cos(a) * rad, z: Math.sin(a) * rad, rot: -a + (r() - 0.5) * 0.8, s: 0.85 + r() * 0.4, ph: r() * 6 };
  }).filter((p) => Math.hypot(p.x - LIGHTHOUSE_SPOT.x, p.z - LIGHTHOUSE_SPOT.z) > 4.5);
})();

const COAST_ROCKS = (() => {
  const r = seeded(33);
  return Array.from({ length: 26 }, () => {
    const a = r() * Math.PI * 2;
    const rad = ISLAND_RADIUS + 2.6 + r() * 3.6;
    return { x: Math.cos(a) * rad, z: Math.sin(a) * rad, s: 0.4 + r() * 1.0, rot: r() * 6, y: rad > ISLAND_RADIUS + 4 ? SEA_Y + 0.05 : BEACH_Y - 0.35 };
  });
})();

/** Paints alternating segments around the Y axis (non-indexed geometry, per face). */
function stripes(g: BufferGeometry, a: string, b: string, n: number): BufferGeometry {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const ca = new Color(a);
  const cb = new Color(b);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const c = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * n) % 2 ? ca : cb;
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/** Beach umbrella with a towel and a cool box; three colourways. */
const UMBRELLAS = [
  ['#ff8fb1', '#ffffff', '#7cc6ea'],
  ['#ffd36e', '#ffffff', '#ff9f7a'],
  ['#7cc6ea', '#ffffff', '#b9a8ec'],
].map(([a, b, towel]) =>
  merge([
    stripes(part(new ConeGeometry(0.95, 0.38, 10), 0, 1.75, 0), a, b, 10),
    part(new CylinderGeometry(0.03, 0.03, 1.8, 5), 0, 0.9, 0, '#f6f2f8'),
    part(new BoxGeometry(0.62, 0.02, 1.25), 0.55, 0.01, 0.15, towel),
    part(new BoxGeometry(0.3, 0.22, 0.22), -0.45, 0.11, 0.35, '#5fb4e6'),
    part(new BoxGeometry(0.32, 0.04, 0.24), -0.45, 0.24, 0.35, '#f6f2f8'),
  ]),
);
const UMBRELLA_SPOTS = (() => {
  const r = seeded(41);
  return Array.from({ length: 9 }, (_, i) => {
    const a = ((i + 0.25) / 9) * Math.PI * 2 + (r() - 0.5) * 0.08;
    const rad = ISLAND_RADIUS + 1.6 + r() * 0.6;
    return { x: Math.cos(a) * rad, z: Math.sin(a) * rad, rot: r() * 6, tilt: (r() - 0.5) * 0.2 };
  });
})();

/** Coastal rocks that keep clear of the palms and beach umbrellas (and of each other). */
const BEACH_ROCKS = COAST_ROCKS.filter((k, i) => {
  const clear = (x: number, z: number, r: number) => Math.hypot(k.x - x, k.z - z) > r + k.s;
  return clear(LIGHTHOUSE_SPOT.x, LIGHTHOUSE_SPOT.z, 3.6) && PALMS.every((p) => clear(p.x, p.z, 0.9)) && UMBRELLA_SPOTS.every((u) => clear(u.x, u.z, 1.5)) && COAST_ROCKS.slice(0, i).every((o) => clear(o.x, o.z, o.s));
});

function Umbrellas({ geo, spots, dark }: { geo: BufferGeometry; spots: typeof UMBRELLA_SPOTS; dark: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    spots.forEach((u, i) => {
      _q.setFromAxisAngle(UP, u.rot);
      _q2.setFromAxisAngle(X_AXIS, u.tilt);
      m.setMatrixAt(i, _m.compose(_p.set(u.x, BEACH_Y, u.z), _q.multiply(_q2), _s.set(1, 1, 1)));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, spots.length]} castShadow raycast={noRaycast}>
      <meshLambertMaterial vertexColors flatShading color={dark ? '#8a8494' : '#ffffff'} />
    </instancedMesh>
  );
}

/** Leaning palms on the beach (they sway a little) and rocks along the waterline. */
export function Beach({ dark }: { dark: boolean }) {
  const trunks = useRef<InstancedMesh>(null);
  const tops = useRef<InstancedMesh>(null);
  const rocks = useRef<InstancedMesh>(null);
  const rockGeo = useMemo(() => rockGeometry(4).scale(1, 0.7, 1), []);

  useLayoutEffect(() => {
    const [tm, rm] = [trunks.current, rocks.current];
    if (!tm || !rm) return;
    PALMS.forEach((p, i) => {
      _q.setFromAxisAngle(UP, p.rot);
      tm.setMatrixAt(i, _m.compose(_p.set(p.x, BEACH_Y, p.z), _q, _s.setScalar(p.s)));
    });
    BEACH_ROCKS.forEach((k, i) => {
      _q.setFromAxisAngle(UP, k.rot);
      rm.setMatrixAt(i, _m.compose(_p.set(k.x, k.y, k.z), _q, _s.set(k.s, k.s, k.s * 0.9)));
      _c.set(i % 3 ? '#bdb5bf' : '#a79fae');
      if (dark) _c.multiplyScalar(0.6);
      rm.setColorAt(i, _c);
    });
    tm.instanceMatrix.needsUpdate = true;
    rm.instanceMatrix.needsUpdate = true;
    if (rm.instanceColor) rm.instanceColor.needsUpdate = true;
    for (const m of [tm, rm]) m.computeBoundingSphere();
  }, [dark]);

  const tick = useRef(0);
  useFrame(({ clock }) => {
    const m = tops.current;
    if (!m || ++tick.current % 2) return;
    const t = clock.elapsedTime;
    PALMS.forEach((p, i) => {
      // Fronds sit on the bent trunk's tip; they rock gently in the sea breeze.
      _q.setFromAxisAngle(UP, p.rot);
      _q2.setFromAxisAngle(Z_AXIS, Math.sin(t * 1.1 + p.ph) * 0.06);
      _q.multiply(_q2);
      m.setMatrixAt(i, _m.compose(_p.set(p.x, BEACH_Y, p.z), _q, _s.setScalar(p.s)));
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="beach">
      <instancedMesh ref={trunks} args={[PALM_TRUNK, undefined, PALMS.length]} raycast={noRaycast}>
        <meshLambertMaterial vertexColors flatShading color={dark ? '#8a8494' : '#ffffff'} />
      </instancedMesh>
      <instancedMesh ref={tops} args={[PALM_TOP, undefined, PALMS.length]} castShadow frustumCulled={false} raycast={noRaycast}>
        <meshLambertMaterial vertexColors flatShading color={dark ? '#8a9a8e' : '#ffffff'} side={DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={rocks} args={[rockGeo, undefined, BEACH_ROCKS.length]} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
      {UMBRELLAS.map((geo, k) => (
        <Umbrellas key={k} geo={geo} spots={UMBRELLA_SPOTS.filter((_, i) => i % 3 === k)} dark={dark} />
      ))}
    </group>
  );
}

// --- Sailboats ---------------------------------------------------------------------------

function triangle(w: number, h: number) {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(w, 0);
  s.lineTo(0, h);
  s.closePath();
  return new ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
}

const HULL = merge([
  part(new CylinderGeometry(0.55, 0.34, 2.6, 6, 1).rotateX(Math.PI / 2).scale(1, 0.55, 1), 0, 0.12, 0, '#f6f2f8'),
  part(new ConeGeometry(0.55, 0.8, 6).rotateX(Math.PI / 2).scale(1, 0.55, 1), 0, 0.12, 1.7, '#f6f2f8'),
  part(new BoxGeometry(0.9, 0.06, 2.2), 0, 0.32, -0.1, '#c49a6c'),
  part(new BoxGeometry(1.12, 0.1, 2.7), 0, 0.02, 0.05, '#4f78b8'),
  part(new BoxGeometry(0.5, 0.3, 0.6), 0, 0.48, -0.6, '#f6f2f8'),
  part(new CylinderGeometry(0.035, 0.045, 3.2, 5), 0, 1.9, 0.25, '#8a8494'),
  part(new BoxGeometry(0.22, 0.12, 0.02), 0.12, 3.45, 0.25, '#ff5a6e'),
]);
// Main sail behind the mast and a jib in front, white (tinted per boat).
const SAILS = merge([part(triangle(1.5, 2.7).rotateY(Math.PI / 2), 0.015, 0.55, 0.15), part(triangle(1.1, 2.3).rotateY(-Math.PI / 2), -0.015, 0.6, 0.35)]);
const SAIL_TINTS = ['#ffffff', '#ffe3ec', '#e6f0ff', '#fff3d6', '#ffffff'];

const BOATS = [
  { r: 66, a: 0.4, speed: 0.02, s: 1.1 },
  { r: 74, a: 2.1, speed: -0.016, s: 1.3 },
  { r: 62, a: 3.6, speed: 0.024, s: 0.9 },
  { r: 82, a: 5.0, speed: 0.013, s: 1.4 },
  { r: 70, a: 4.3, speed: -0.019, s: 1.0 },
];

export function Sailboats({ dark }: { dark: boolean }) {
  const hulls = useRef<InstancedMesh>(null);
  const sails = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = sails.current;
    if (!m) return;
    BOATS.forEach((_, i) => m.setColorAt(i, _c.set(SAIL_TINTS[i % SAIL_TINTS.length]).multiplyScalar(dark ? 0.7 : 1)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [dark]);
  useFrame(({ clock }, dt) => {
    const [hm, sm] = [hulls.current, sails.current];
    if (!hm || !sm) return;
    const t = clock.elapsedTime;
    BOATS.forEach((b, i) => {
      b.a += b.speed * Math.min(dt, 0.1);
      // Head along the circle (bow is +Z), bob and roll on the swell.
      _q.setFromAxisAngle(UP, -b.a + (b.speed > 0 ? 0 : Math.PI));
      _q2.setFromAxisAngle(Z_AXIS, Math.sin(t * 0.9 + i) * 0.06);
      _q.multiply(_q2);
      _q2.setFromAxisAngle(X_AXIS, Math.sin(t * 0.7 + i * 2) * 0.04);
      _q.multiply(_q2);
      _m.compose(_p.set(Math.cos(b.a) * b.r, SEA_Y + Math.sin(t * 1.1 + i) * 0.08, Math.sin(b.a) * b.r), _q, _s.setScalar(b.s));
      hm.setMatrixAt(i, _m);
      sm.setMatrixAt(i, _m);
    });
    hm.instanceMatrix.needsUpdate = true;
    sm.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="boats">
      <instancedMesh ref={hulls} args={[HULL, undefined, BOATS.length]} frustumCulled={false} raycast={noRaycast}>
        <meshLambertMaterial vertexColors flatShading color={dark ? '#8a8494' : '#ffffff'} />
      </instancedMesh>
      <instancedMesh ref={sails} args={[SAILS, undefined, BOATS.length]} frustumCulled={false} raycast={noRaycast}>
        <meshLambertMaterial flatShading side={DoubleSide} />
      </instancedMesh>
    </group>
  );
}

// --- Butterflies -------------------------------------------------------------------------

const BUTTERFLIES = 16;
const WINGS = merge([part(new PlaneGeometry(0.16, 0.13).rotateX(-Math.PI / 2), 0.085, 0, 0), part(new PlaneGeometry(0.16, 0.13).rotateX(-Math.PI / 2), -0.085, 0, 0)]);
const WING_TONES = ['#ffb3c9', '#ffd36e', '#c9b8ff', '#ffffff', '#ff9f7a', '#9fd8ff'];

/** Butterflies flutter around the wild flowers on fine days. */
export function Butterflies({ layout, dark }: { layout: CityLayout; dark: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const mat = useMemo(() => new MeshBasicMaterial({ side: DoubleSide }), []);
  const anchors = useMemo(() => layout.flowers.filter((_, i) => i % 9 === 0).slice(0, BUTTERFLIES), [layout]);
  const shown = useRef(0);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    anchors.forEach((_, i) => m.setColorAt(i, _c.set(WING_TONES[i % WING_TONES.length])));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [anchors]);
  useFrame(({ clock }, dt) => {
    const m = ref.current;
    if (!m) return;
    const st = useGame.getState();
    const fine = !dark && st.weather !== 'rain' && st.weather !== 'storm';
    shown.current += ((fine ? 1 : 0) - shown.current) * Math.min(1, dt * 1.5);
    const t = clock.elapsedTime;
    anchors.forEach((a, i) => {
      const x = a.x + Math.sin(t * 0.6 + i) * 1.1 + Math.sin(t * 1.7 + i * 3) * 0.25;
      const z = a.z + Math.cos(t * 0.47 + i * 2) * 1.1;
      const y = 0.55 + Math.sin(t * 2.3 + i) * 0.22 + Math.abs(Math.sin(t * 9 + i)) * 0.05;
      _q.setFromAxisAngle(UP, Math.atan2(Math.cos(t * 0.6 + i), -Math.sin(t * 0.47 + i * 2)));
      const flap = 0.15 + Math.abs(Math.sin(t * 14 + i * 1.3)) * 0.85;
      m.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(flap * shown.current, 1, shown.current)));
    });
    m.count = anchors.length;
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[WINGS, mat, BUTTERFLIES]} frustumCulled={false} raycast={noRaycast} />;
}

// --- Hot-air balloons --------------------------------------------------------------------

function balloonGeometry(a: string, b: string): BufferGeometry {
  const pts = [
    [0.02, -1.0],
    [0.45, -0.85],
    [0.95, -0.2],
    [1.25, 0.45],
    [1.3, 1.0],
    [1.15, 1.5],
    [0.75, 1.9],
    [0.02, 2.05],
  ].map(([x, y]) => new Vector2(x, y));
  const env = part(new LatheGeometry(pts, 12), 0, 0, 0);
  // Paint alternating vertical gores.
  const pos = env.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const ca = new Color(a);
  const cb = new Color(b);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const gore = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 12) % 2;
    const c = gore ? ca : cb;
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  env.setAttribute('color', new Float32BufferAttribute(col, 3));
  return merge([
    env,
    part(new BoxGeometry(0.42, 0.34, 0.42), 0, -1.75, 0, '#a77d55'),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(new BoxGeometry(0.02, 0.62, 0.02), sx * 0.19, -1.32, sz * 0.19, '#5b5566'))),
  ]);
}

const BALLOONS = [
  { geo: balloonGeometry('#ff8fb1', '#fff3f7'), r: 52, a: 1.0, y: 30, speed: 0.022, s: 1.6 },
  { geo: balloonGeometry('#ffd36e', '#7cc6ea'), r: 64, a: 3.9, y: 36, speed: -0.016, s: 1.9 },
];

export function Balloons({ dark }: { dark: boolean }) {
  const refs = useRef<(Group | null)[]>([]);
  const mat = useMemo(() => new MeshLambertMaterial({ vertexColors: true, flatShading: true }), []);
  mat.color.set(dark ? '#8a8494' : '#ffffff');
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    BALLOONS.forEach((b, i) => {
      b.a += b.speed * Math.min(dt, 0.1);
      // Drift back and forth over the far half of the island so they never fill the home view.
      const ang = -Math.PI / 2 + Math.sin(b.a) * 1.1;
      const g = refs.current[i];
      if (g) g.position.set(Math.cos(ang) * b.r, b.y + Math.sin(t * 0.4 + i * 2) * 1.2, Math.sin(ang) * b.r);
    });
  });
  return (
    <group name="balloons">
      {BALLOONS.map((b, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} scale={b.s}>
          <mesh geometry={b.geo} material={mat} castShadow raycast={noRaycast} />
        </group>
      ))}
    </group>
  );
}
