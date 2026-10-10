import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SECTORS } from '../data/sectors';
import { UNIT_BOX } from './Building';
import { merge, part } from './geom';
import type { CityLayout } from './layout';
import { DISTRICT_SIZE, LOT, toWorld } from './layout';

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();
const _c2 = new Color();
const _e = new Euler();
const UP = new Vector3(0, 1, 0);
const noRaycast = () => {};

/** Top of the lot pads: everything in a district stands on this. */
export const PAD_TOP = 0.28;

/** Lamp post with a curved arm and a lantern head (head is a separate glowing mesh). */
const LAMP_POLE = merge([
  part(new CylinderGeometry(0.05, 0.07, 1.6, 6), 0, 0.8, 0),
  part(new BoxGeometry(0.34, 0.04, 0.04), 0.15, 1.58, 0),
  part(new CylinderGeometry(0.1, 0.12, 0.08, 6), 0, 0.04, 0),
]);
const LAMP_HEAD = merge([part(new CylinderGeometry(0.06, 0.1, 0.14, 6), 0.3, 1.5, 0)]);

/** District blocks: a street-coloured base with one raised pad per lot, plus the sector sign. */
export function Districts({ layout, dark }: { layout: CityLayout; dark: boolean }) {
  const bases = useRef<InstancedMesh>(null);
  const pads = useRef<InstancedMesh>(null);
  const lamps = useRef<InstancedMesh>(null);
  const lampHeads = useRef<InstancedMesh>(null);
  const n = layout.districts.length;

  useLayoutEffect(() => {
    const b = bases.current;
    const p = pads.current;
    if (!b || !p) return;
    layout.districts.forEach((d, i) => {
      const meta = SECTORS[d.sector];
      _q.setFromAxisAngle(UP, d.rot);
      b.setMatrixAt(i, _m.compose(_p.set(d.x, 0.1, d.z), _q, _s.set(DISTRICT_SIZE, 0.2, DISTRICT_SIZE)));
      _c.set(dark ? '#4a475a' : '#dcd6e0').lerp(_c2.set(meta.color), 0.12);
      b.setColorAt(i, _c);
      for (let k = 0; k < 9; k++) {
        const gx = (k % 3) - 1;
        const gz = Math.floor(k / 3) - 1;
        const w = toWorld(d, gx * LOT, gz * LOT);
        _p.set(w.x, PAD_TOP / 2 + 0.1, w.z);
        p.setMatrixAt(i * 9 + k, _m.compose(_p, _q, _s.set(LOT - 0.9, PAD_TOP - 0.1, LOT - 0.9)));
        // Pocket parks are lawn-coloured pads (no extra layer to draw on top).
        const park = layout.parks.some((pk) => Math.abs(pk.x - _p.x) < 0.1 && Math.abs(pk.z - _p.z) < 0.1);
        _c.set(park ? '#a3d690' : meta.ground);
        if (k % 2 && !park) _c.offsetHSL(0, 0, -0.025);
        if (dark) _c.multiplyScalar(0.55);
        p.setColorAt(i * 9 + k, _c);
      }
    });
    // Street lamps where the district's lanes cross.
    const lp = lamps.current;
    const lh = lampHeads.current;
    if (lp && lh) {
      let n = 0;
      for (const d of layout.districts) {
        _q.setFromAxisAngle(UP, d.rot);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            // At the plot corner of each crossing, clear of people walking down the lanes.
            const w = toWorld(d, sx * (LOT / 2 + 0.4), sz * (LOT / 2 + 0.4));
            _m.compose(_p.set(w.x, 0.2, w.z), _q, _s.set(1, 1, 1));
            lp.setMatrixAt(n, _m);
            lh.setMatrixAt(n, _m);
            n++;
          }
        }
      }
      for (const m of [lp, lh]) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      }
    }
    for (const m of [b, p]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [layout, dark]);

  return (
    <group>
      <instancedMesh ref={bases} args={[UNIT_BOX, undefined, n]} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={pads} args={[UNIT_BOX, undefined, n * 9]} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[LAMP_POLE, undefined, n * 4]} raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#8c87a0' : '#6b6578'} flatShading />
      </instancedMesh>
      <instancedMesh ref={lampHeads} args={[LAMP_HEAD, undefined, n * 4]} raycast={noRaycast}>
        <meshBasicMaterial color={dark ? '#ffd68a' : '#fff6dc'} toneMapped={false} />
      </instancedMesh>
      {layout.districts.map((d) => {
        const meta = SECTORS[d.sector];
        // Sign on the district's outer edge, by the path out to the promenade.
        const at = toWorld(d, 0, -(DISTRICT_SIZE / 2 + 1.9));
        return (
          <Html
            key={d.sector}
            position={[at.x, 0.4, at.z]}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className="district-label" style={{ borderColor: meta.color }}>
              {meta.districtTh}
            </div>
          </Html>
        );
      })}
    </group>
  );
}

const ROOF_COLORS = ['#d9776a', '#c4695c', '#8193b8', '#9b7fa6', '#d0935f', '#6f9a8a'];

/** Gable-roof prism with the ridge along Z: base -0.5..0.5 in X, height 1, depth 1. */
function gableGeometry() {
  const shape = new Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
}

// House details in local space (front = +Z), pre-merged with vertex colours.
const WIN_GEO = new BoxGeometry(0.36, 0.38, 0.04);
const FRAME_GEO = merge([part(new BoxGeometry(0.46, 0.48, 0.03), 0, 0, -0.005, '#ffffff'), part(new BoxGeometry(0.52, 0.05, 0.1), 0, -0.25, 0.03, '#ffffff')]);
const FLOWER_BOX_GEO = merge([
  part(new BoxGeometry(0.44, 0.1, 0.12), 0, 0, 0, '#9a6b52'),
  ...[-0.15, -0.05, 0.05, 0.15].map((x, i) => part(new IcosahedronGeometry(0.055, 0), x, 0.08, 0, ['#ff8fb1', '#ffd36e', '#ff6f7d', '#b9a8ec'][i])),
]);
const PORCH_GEO = merge([
  part(new BoxGeometry(0.62, 0.08, 0.34), 0, 0.04, 0.17, '#e6dccb'),
  part(new BoxGeometry(0.66, 0.05, 0.38), 0, 0.82, 0.17, '#f6f2f8'),
  part(new BoxGeometry(0.04, 0.12, 0.3), -0.28, 0.75, 0.15, '#f6f2f8'),
  part(new BoxGeometry(0.04, 0.12, 0.3), 0.28, 0.75, 0.15, '#f6f2f8'),
  part(new SphereGeometry(0.05, 6, 4), 0.38, 0.62, 0.04, '#ffe6a8'),
]);
const PATH_GEO = new BoxGeometry(0.46, 0.02, 1).translate(0, 0.01, 0);
/** One fence panel, 1 unit long along X: two rails and four pickets. */
const FENCE_GEO = merge([
  part(new BoxGeometry(1, 0.035, 0.03), 0, 0.14, 0),
  part(new BoxGeometry(1, 0.035, 0.03), 0, 0.28, 0),
  ...[-0.375, -0.125, 0.125, 0.375].map((x) => part(new ConeGeometry(0.035, 0.42, 4).rotateY(Math.PI / 4), x, 0.21, 0)),
]);
const YARD_GEO = merge([
  // Small garden tree in the back corner.
  part(new CylinderGeometry(0.05, 0.07, 0.6, 5), -1.55, 0.3, -1.55, '#8a6a4f'),
  part(new IcosahedronGeometry(0.42, 0), -1.55, 0.85, -1.55, '#7fbf7a'),
  part(new IcosahedronGeometry(0.28, 0), -1.35, 1.05, -1.45, '#94cc86'),
  // Flower bed by the front fence.
  part(new BoxGeometry(0.9, 0.08, 0.36), -1.35, 0.04, 1.65, '#8a6a4f'),
  ...[-1.7, -1.5, -1.3, -1.1].map((x, i) => part(new IcosahedronGeometry(0.09, 0), x, 0.13, 1.65 + (i % 2) * 0.06, ['#ff8fb1', '#fff1b8', '#b9a8ec', '#ff9f7a'][i])),
  // Mailbox by the gate.
  part(new BoxGeometry(0.04, 0.38, 0.04), 1.3, 0.19, 1.95, '#6b5a4e'),
  part(new BoxGeometry(0.14, 0.12, 0.22), 1.3, 0.42, 1.95, '#e8505b'),
]);
/** Fence line, inset from the pad edge (pads are LOT - 0.9 wide). */
const FENCE_H = (LOT - 0.9) / 2 - 0.12;
const FENCE_TINTS = ['#ffffff', '#fff4e6', '#eef6ff', '#f1ffe9'];

/** Filler houses: pastel walls, gable roofs, chimneys, framed windows (lit at night), porches, fenced yards. */
export function Fillers({ layout, dark }: { layout: CityLayout; dark: boolean }) {
  const bodies = useRef<InstancedMesh>(null);
  const roofs = useRef<InstancedMesh>(null);
  const chimneys = useRef<InstancedMesh>(null);
  const windows = useRef<InstancedMesh>(null);
  const frames = useRef<InstancedMesh>(null);
  const flowerBoxes = useRef<InstancedMesh>(null);
  const doors = useRef<InstancedMesh>(null);
  const porches = useRef<InstancedMesh>(null);
  const paths = useRef<InstancedMesh>(null);
  const fences = useRef<InstancedMesh>(null);
  const yards = useRef<InstancedMesh>(null);
  const fillers = useMemo(() => layout.lots.filter((l) => !l.companyId), [layout]);
  const roofGeo = useMemo(() => gableGeometry(), []);
  const windowMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), []);
  windowMat.color.set(dark ? '#ffd98a' : '#a9c8e8');

  useLayoutEffect(() => {
    const [b, r, ch, w, fr, fb, dr] = [bodies.current, roofs.current, chimneys.current, windows.current, frames.current, flowerBoxes.current, doors.current];
    const [po, pa, fe, ya] = [porches.current, paths.current, fences.current, yards.current];
    if (!b || !r || !ch || !w || !fr || !fb || !dr || !po || !pa || !fe || !ya) return;
    let nw = 0;
    let nb = 0;
    let nf = 0;
    const qFront = new Quaternion();
    const qRight = new Quaternion().setFromAxisAngle(UP, Math.PI / 2);
    const qLeft = new Quaternion().setFromAxisAngle(UP, -Math.PI / 2);
    const one = new Vector3(1, 1, 1);
    // Everything below is laid out in plot space (front = +Z, towards the city centre); `place`
    // turns a plot-space transform into a world matrix with the plot's position and yaw.
    const plot = new Matrix4();
    const local = new Matrix4();
    const place = (x: number, y: number, z: number, q: Quaternion, s: Vector3) => _m.multiplyMatrices(plot, local.compose(_p.set(x, y, z), q, s));
    const putWindow = (x: number, y: number, z: number, q: Quaternion) => {
      place(x, y, z, q, one);
      w.setMatrixAt(nw, _m);
      fr.setMatrixAt(nw, _m);
      nw++;
    };
    const putFence = (x: number, z: number, len: number, q: Quaternion, tint: Color) => {
      if (len < 0.2) return;
      fe.setMatrixAt(nf, place(x, PAD_TOP, z, q, _s.set(len, 1, 1)));
      fe.setColorAt(nf, tint);
      nf++;
    };
    const ident = new Quaternion();
    fillers.forEach((l, i) => {
      plot.compose(_p.set(l.x, 0, l.z), _q.setFromAxisAngle(UP, l.rot), one);
      const lot = { x: 0, z: 0 }; // the plot's centre, in plot space
      const fw = l.fillerWidth;
      const fd = fw * 0.8;
      const fh = l.fillerHeight;
      const y0 = PAD_TOP;
      b.setMatrixAt(i, place(lot.x, y0 + fh / 2, lot.z, ident, _s.set(fw, fh, fd)));
      _c.set(SECTORS[l.sector].color).lerp(_c2.set(dark ? '#3a3a4a' : '#ffffff'), 0.55);
      b.setColorAt(i, _c);
      const roofH = 0.55 + fw * 0.22;
      r.setMatrixAt(i, place(lot.x, y0 + fh, lot.z, ident, _s.set(fw * 1.16, roofH, fd * 1.12)));
      _c.set(ROOF_COLORS[i % ROOF_COLORS.length]);
      if (dark) _c.multiplyScalar(0.6);
      r.setColorAt(i, _c);
      ch.setMatrixAt(i, place(lot.x + fw * 0.25, y0 + fh + roofH * 0.55, lot.z + fd * 0.2, ident, _s.set(0.3, roofH * 0.9, 0.3)));
      // Two windows per floor on the front, one on each side; flower boxes under the ground-floor ones.
      const floors = Math.max(1, Math.floor(fh / 1.1));
      for (let f = 0; f < floors; f++) {
        const wy = y0 + 0.55 + f * (fh / floors) + (f === 0 ? 0.1 : 0);
        for (const sx of [-0.27, 0.27]) {
          if (f === 0 && sx > 0) continue; // the door takes this spot
          putWindow(lot.x + sx * fw, wy, lot.z + fd / 2 + 0.01, qFront);
          if (f === 0) fb.setMatrixAt(nb++, place(lot.x + sx * fw, wy - 0.3, lot.z + fd / 2 + 0.08, qFront, one));
        }
        putWindow(lot.x + fw / 2 + 0.01, wy, lot.z, qRight);
        putWindow(lot.x - fw / 2 - 0.01, wy, lot.z, qLeft);
      }
      const doorX = lot.x + 0.27 * fw;
      dr.setMatrixAt(i, place(doorX, y0 + 0.34, lot.z + fd / 2 + 0.015, ident, _s.set(0.34, 0.68, 0.05)));
      po.setMatrixAt(i, place(doorX, y0, lot.z + fd / 2, ident, one));
      // Garden path from the porch to the gate.
      const pathStart = lot.z + fd / 2 + 0.34;
      const pathLen = lot.z + FENCE_H - pathStart;
      pa.setMatrixAt(i, place(doorX, y0 + 0.05, pathStart + pathLen / 2, ident, _s.set(1, 1, Math.max(0.01, pathLen))));
      ya.setMatrixAt(i, place(lot.x, y0, lot.z, ident, one));
      // Picket fence on all four sides, with a gate gap at the path.
      _c.set(FENCE_TINTS[i % FENCE_TINTS.length]);
      if (dark) _c.multiplyScalar(0.6);
      const H = FENCE_H;
      const gx = doorX - lot.x;
      putFence(lot.x, lot.z - H, H * 2, qFront, _c);
      putFence(lot.x - H, lot.z, H * 2, qRight, _c);
      putFence(lot.x + H, lot.z, H * 2, qRight, _c);
      putFence(lot.x + (-H + gx - 0.32) / 2, lot.z + H, gx - 0.32 + H, qFront, _c);
      putFence(lot.x + (gx + 0.32 + H) / 2, lot.z + H, H - gx - 0.32, qFront, _c);
    });
    for (const m of [b, r, ch, dr, po, pa, ya]) m.count = fillers.length;
    w.count = fr.count = nw;
    fb.count = nb;
    fe.count = nf;
    for (const m of [b, r, ch, w, fr, fb, dr, po, pa, fe, ya]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [fillers, dark]);

  const paint = dark ? '#8a8494' : '#ffffff';
  return (
    <group name="houses">
      <instancedMesh ref={bodies} args={[UNIT_BOX, undefined, 64]} castShadow receiveShadow raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[roofGeo, undefined, 64]} castShadow receiveShadow raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={chimneys} args={[UNIT_BOX, undefined, 64]} castShadow raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#6a5a5e' : '#b08a7a'} flatShading />
      </instancedMesh>
      <instancedMesh ref={windows} args={[WIN_GEO, windowMat, 64 * 12]} raycast={noRaycast} />
      <instancedMesh ref={frames} args={[FRAME_GEO, undefined, 64 * 12]} raycast={noRaycast}>
        <meshLambertMaterial vertexColors color={paint} flatShading />
      </instancedMesh>
      <instancedMesh ref={flowerBoxes} args={[FLOWER_BOX_GEO, undefined, 64]} raycast={noRaycast}>
        <meshLambertMaterial vertexColors color={paint} flatShading />
      </instancedMesh>
      <instancedMesh ref={doors} args={[UNIT_BOX, undefined, 64]} raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#5a4238' : '#9a6b52'} />
      </instancedMesh>
      <instancedMesh ref={porches} args={[PORCH_GEO, undefined, 64]} raycast={noRaycast}>
        <meshLambertMaterial vertexColors color={paint} flatShading />
      </instancedMesh>
      <instancedMesh ref={paths} args={[PATH_GEO, undefined, 64]} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#7d7688' : '#efe6d6'} />
      </instancedMesh>
      <instancedMesh ref={fences} args={[FENCE_GEO, undefined, 64 * 5]} raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={yards} name="house-yards" args={[YARD_GEO, undefined, 64]} castShadow raycast={noRaycast}>
        <meshLambertMaterial vertexColors color={paint} flatShading />
      </instancedMesh>
    </group>
  );
}

// Pocket park on an empty plot (pad-local, y = 0 is the pad top): lawn, cross paths, trees, benches and a pond.
const PARK_GEO = (() => {
  const W = LOT - 1.3;
  const bench = (x: number, z: number, ry: number) =>
    [
      part(new BoxGeometry(0.7, 0.05, 0.22).rotateY(ry), x, 0.24, z, '#b88c66'),
      part(new BoxGeometry(0.7, 0.2, 0.04).translate(0, 0, -0.11).rotateY(ry), x, 0.36, z, '#b88c66'),
      part(new BoxGeometry(0.62, 0.22, 0.16).rotateY(ry), x, 0.11, z, '#6b5a4e'),
    ];
  const tree = (x: number, z: number, s: number, tone: string) => [
    part(new CylinderGeometry(0.07 * s, 0.1 * s, 0.8 * s, 6), x, 0.4 * s, z, '#8a6a4f'),
    part(new IcosahedronGeometry(0.62 * s, 0), x, 1.15 * s, z, tone),
    part(new IcosahedronGeometry(0.42 * s, 0), x + 0.3 * s, 1.4 * s, z - 0.1 * s, tone),
  ];
  return merge([
    part(new BoxGeometry(W, 0.05, 0.56), 0, 0.025, 0, '#efe6d6'),
    part(new BoxGeometry(0.56, 0.05, W), 0, 0.025, 0, '#efe6d6'),
    part(new CylinderGeometry(0.75, 0.75, 0.055, 18), 0, 0.028, 0, '#e6dccb'),
    // Pond with a stone rim and lily pads.
    part(new CylinderGeometry(0.62, 0.62, 0.02, 16), -1.05, 0.06, 1.05, '#7cc6ea'),
    part(new TorusGeometry(0.62, 0.07, 4, 16).rotateX(Math.PI / 2), -1.05, 0.07, 1.05, '#d9d0c4'),
    part(new CylinderGeometry(0.1, 0.1, 0.01, 7), -1.2, 0.075, 1.0, '#6fb36f'),
    part(new CylinderGeometry(0.08, 0.08, 0.01, 7), -0.9, 0.075, 1.2, '#6fb36f'),
    ...tree(-1.15, -1.15, 1, '#8cc79a'),
    ...tree(1.2, 1.15, 0.85, '#f0b6c8'),
    part(new CylinderGeometry(0.06, 0.08, 0.3, 5), 1.2, 0.15, -1.2, '#8a6a4f'),
    part(new ConeGeometry(0.55, 1.1, 7), 1.2, 0.8, -1.2, '#5f9e74'),
    part(new ConeGeometry(0.4, 0.8, 7), 1.2, 1.3, -1.2, '#6dab7a'),
    ...bench(0, -1.05, 0),
    ...bench(1.05, 0, -Math.PI / 2),
    // Flower beds hugging the round centre.
    ...[0.6, 2.2, 3.8, 5.4].flatMap((a, i) =>
      [-0.18, 0, 0.18].map((da, k) => part(new IcosahedronGeometry(0.08, 0), Math.cos(a + da) * 0.95, 0.1, Math.sin(a + da) * 0.95, ['#ff8fb1', '#ffd36e', '#b9a8ec', '#ff9f7a'][(i + k) % 4])),
    ),
    // Lamp post.
    part(new CylinderGeometry(0.03, 0.04, 1.1, 5), 0.55, 0.55, 0.55, '#6b6578'),
    part(new SphereGeometry(0.09, 6, 4), 0.55, 1.14, 0.55, '#fff3d0'),
  ]);
})();

export function Parks({ layout, dark }: { layout: CityLayout; dark: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    layout.parks.forEach((p, i) => {
      _q.setFromAxisAngle(UP, p.rot);
      m.setMatrixAt(i, _m.compose(_p.set(p.x, PAD_TOP + 0.05, p.z), _q, _s.set(1, 1, 1)));
    });
    m.count = layout.parks.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [layout]);
  return (
    <instancedMesh ref={ref} name="parks" args={[PARK_GEO, undefined, 63]} castShadow receiveShadow raycast={noRaycast}>
      <meshLambertMaterial vertexColors color={dark ? '#7d8a86' : '#ffffff'} flatShading />
    </instancedMesh>
  );
}

const PINE_Y = 0.55;
const ROUND_Y = 1.25;

/** Two species: layered pines and rounded broadleaf trees, swaying gently. */
export function Trees({ trees, dark }: { trees: CityLayout['trees']; dark: boolean }) {
  const pines = useRef<InstancedMesh>(null);
  const rounds = useRef<InstancedMesh>(null);
  const trunks = useRef<InstancedMesh>(null);
  const pineGeo = useMemo(
    () =>
      mergeGeometries([
        new ConeGeometry(1.0, 1.3, 8).translate(0, 0.65, 0),
        new ConeGeometry(0.8, 1.15, 8).rotateY(0.4).translate(0, 1.3, 0),
        new ConeGeometry(0.56, 1.0, 8).rotateY(0.8).translate(0, 1.9, 0),
      ]),
    [],
  );
  const roundGeo = useMemo(
    () =>
      mergeGeometries([
        new IcosahedronGeometry(0.85, 0),
        new IcosahedronGeometry(0.6, 0).translate(0.45, 0.25, 0.1),
        new IcosahedronGeometry(0.55, 0).translate(-0.35, 0.35, -0.2),
        new IcosahedronGeometry(0.5, 0).translate(0.05, 0.62, 0.3),
        new IcosahedronGeometry(0.45, 0).translate(-0.2, -0.1, 0.5),
      ]),
    [],
  );
  const trunkGeo = useMemo(() => new CylinderGeometry(0.1, 0.16, 1, 6).translate(0, 0.5, 0), []);
  const split = useMemo(() => ({ pine: trees.filter((t) => t.kind === 0), round: trees.filter((t) => t.kind !== 0) }), [trees]);

  useLayoutEffect(() => {
    const [pm, rm, tm] = [pines.current, rounds.current, trunks.current];
    if (!pm || !rm || !tm) return;
    trees.forEach((t, i) => {
      _q.setFromAxisAngle(UP, t.x * 3.1);
      tm.setMatrixAt(i, _m.compose(_p.set(t.x, 0, t.z), _q, _s.set(t.s, t.s * (t.kind === 0 ? 0.7 : 1.3), t.s)));
    });
    split.pine.forEach((_, i) => {
      _c.set(i % 3 === 0 ? '#5f9e74' : i % 3 === 1 ? '#6dab7a' : '#558f6b');
      if (dark) _c.multiplyScalar(0.6);
      pm.setColorAt(i, _c);
    });
    split.round.forEach((_, i) => {
      _c.set(i % 4 === 0 ? '#a6d48c' : i % 4 === 1 ? '#8cc79a' : i % 4 === 2 ? '#b5d97c' : '#f0b6c8');
      if (dark) _c.multiplyScalar(0.6);
      rm.setColorAt(i, _c);
    });
    tm.count = trees.length;
    pm.count = split.pine.length;
    rm.count = split.round.length;
    for (const m of [pm, rm, tm]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    placeCrowns(pm, split.pine, PINE_Y, 0);
    placeCrowns(rm, split.round, ROUND_Y, 0);
  }, [trees, split, dark]);

  // Gentle sway in the wind (every other frame is plenty).
  const tick = useRef(0);
  useFrame((frame) => {
    if (++tick.current % 2) return;
    const t = frame.clock.elapsedTime;
    if (pines.current) placeCrowns(pines.current, split.pine, PINE_Y, t);
    if (rounds.current) placeCrowns(rounds.current, split.round, ROUND_Y, t);
  });

  return (
    <group>
      <instancedMesh ref={pines} args={[pineGeo, undefined, 200]} castShadow frustumCulled={false} raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={rounds} args={[roundGeo, undefined, 200]} castShadow frustumCulled={false} raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[trunkGeo, undefined, 200]} castShadow frustumCulled={false} raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#5e4a3c' : '#9c7a5d'} flatShading />
      </instancedMesh>
    </group>
  );
}

function placeCrowns(m: InstancedMesh, list: CityLayout['trees'], y: number, t: number) {
  list.forEach((tr, i) => {
    _e.set(Math.sin(t * 1.3 + tr.x) * 0.05, tr.x * 3.1, Math.cos(t * 1.1 + tr.z) * 0.05);
    _q.setFromEuler(_e);
    _p.set(tr.x, y * tr.s, tr.z);
    m.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(tr.s)));
  });
  m.instanceMatrix.needsUpdate = true;
}

const CLOUDS = Array.from({ length: 8 }, (_, i) => ({
  r: 62 + (i % 3) * 16,
  a: (i / 8) * Math.PI * 2,
  y: 24 + (i % 4) * 5,
  s: 1.5 + (i % 3) * 0.6,
  speed: 0.01 + (i % 2) * 0.008,
}));

const PUFFS: [number, number, number, number][] = [
  [0, 0, 0, 1.7],
  [1.7, -0.25, 0.3, 1.25],
  [-1.6, -0.3, -0.2, 1.15],
  [0.5, 0.75, -0.3, 1.1],
  [-0.6, 0.55, 0.5, 0.95],
  [2.8, -0.55, -0.1, 0.8],
  [-2.7, -0.6, 0.2, 0.75],
];

export function Clouds({ dark, stormy = false }: { dark: boolean; stormy?: boolean }) {
  const refs = useRef<(Group | null)[]>([]);
  // All puffs of a cloud merged into one geometry: one draw call per cloud.
  const geo = useMemo(
    () =>
      mergeGeometries([
        ...PUFFS.map(([x, y, z, s]) => new IcosahedronGeometry(1, 1).scale(s, s * 0.78, s).translate(x, y, z)),
        // flat underside (non-indexed to match the icosahedra)
        new BoxGeometry(5.2, 0.3, 1.9).toNonIndexed().translate(0, -0.75, 0),
      ])!,
    [],
  );
  const mats = useRef<(MeshLambertMaterial | null)[]>([]);
  useFrame(({ camera }, dt) => {
    // Clouds drift below the camera's height, so on the camera's side of the island they would
    // sit between it and the city: fade those out, whichever way the camera has been turned.
    const camA = Math.atan2(camera.position.z, camera.position.x);
    CLOUDS.forEach((c, i) => {
      c.a += c.speed * dt;
      const g = refs.current[i];
      if (g) g.position.set(Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r);
      const m = mats.current[i];
      if (m) {
        const off = Math.abs(Math.atan2(Math.sin(c.a - camA), Math.cos(c.a - camA)));
        const k = Math.min(1, Math.max(0, (off - 0.7) / 0.5));
        m.opacity = 0.94 * k * k * (3 - 2 * k);
        m.visible = m.opacity > 0.01;
      }
    });
  });
  const color = stormy ? (dark ? '#3d4052' : '#8e93a3') : dark ? '#5b5f7a' : '#ffffff';
  return (
    <group>
      {CLOUDS.map((c, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} scale={c.s}>
          <mesh geometry={geo} raycast={noRaycast}>
            <meshLambertMaterial ref={(m) => void (mats.current[i] = m)} color={color} flatShading transparent opacity={0.94} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Planter with a clipped shrub; four sit on each company plot's corners when the tower leaves room. */
const PLANTER_GEO = merge([
  part(new BoxGeometry(0.5, 0.26, 0.5), 0, 0.13, 0, '#e6dccb'),
  part(new IcosahedronGeometry(0.3, 0), 0, 0.42, 0, '#6fae78'),
  part(new IcosahedronGeometry(0.1, 0), 0.12, 0.62, 0.05, '#ff8fb1'),
]);

export function LotPlanters({ spots, dark }: { spots: { x: number; z: number; rot: number; width: number }[]; dark: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    let n = 0;
    const c = (LOT - 0.9) / 2 - 0.35;
    for (const s of spots) {
      // Room is checked against the tower footprint (width × 0.85 width) plus the planter.
      if (s.width / 2 > c - 0.35) continue;
      _q.setFromAxisAngle(UP, s.rot);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const w = toWorld(s, sx * c, sz * c);
          m.setMatrixAt(n++, _m.compose(_p.set(w.x, PAD_TOP + 0.05, w.z), _q, _s.set(1, 1, 1)));
        }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[PLANTER_GEO, undefined, 64 * 4]} raycast={noRaycast}>
      <meshLambertMaterial vertexColors color={dark ? '#7d8a86' : '#ffffff'} flatShading />
    </instancedMesh>
  );
}
