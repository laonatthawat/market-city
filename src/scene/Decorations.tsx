import { Gltf } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  IcosahedronGeometry,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { BufferGeometry, Group } from 'three';
import { useGame } from '../store/gameStore';
import type { DecoKind } from '../data/unlocks';
import { useModelOverride } from './assets';
import { merge, part } from './geom';

/**
 * Low-poly civic-building meshes (about 3×3 units at scale 1).
 * Kept as plain primitives so they can be swapped for CC0 .glb assets.
 */
export function DecoMesh(props: { kind: DecoKind; bloom?: number }) {
  const src = useModelOverride(props.kind);
  if (src) {
    return (
      <Suspense fallback={<PrimitiveDeco {...props} />}>
        <Gltf src={src} castShadow receiveShadow />
      </Suspense>
    );
  }
  return <PrimitiveDeco {...props} />;
}

const STONE = '#ece6dc';
const STONE_DARK = '#d6cdbf';
const WHITE = '#f6f2f8';
const DARK = '#4f4a5c';
const GOLD = '#ffcf5a';
const HEDGE = '#6fae78';

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string) => part(new BoxGeometry(w, h, d), x, y, z, c);
const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, c: string, seg = 12) => part(new CylinderGeometry(rt, rb, h, seg), x, y, z, c);

function gable(w: number, h: number, d: number) {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  return new ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}

/** Painted body (lit) and gold/glass accents (emissive) for each civic building, in local space (front = +Z). */
const DECO_GEO: Record<Exclude<DecoKind, 'garden'>, { body: BufferGeometry; glow: BufferGeometry }> = {
  // Winner's statue: stepped round plinth, pedestal with plaque, a gold figure raising a coin; hedges and lamps around.
  statue: {
    body: merge([
      cyl(1.55, 1.6, 0.12, 0, 0.06, 0, STONE_DARK, 20),
      cyl(1.2, 1.25, 0.14, 0, 0.19, 0, STONE, 20),
      cyl(0.9, 0.95, 0.14, 0, 0.33, 0, STONE_DARK, 16),
      box(0.8, 0.95, 0.8, 0, 0.88, 0, STONE),
      box(0.92, 0.1, 0.92, 0, 1.4, 0, STONE_DARK),
      box(0.92, 0.1, 0.92, 0, 0.45, 0, STONE_DARK),
      box(0.45, 0.25, 0.03, 0, 0.9, 0.41, DARK),
      ...[0.5, 1.6, 2.7, 3.8, 4.9, 5.9].map((a) => part(new IcosahedronGeometry(0.22, 0).scale(1, 0.75, 1), Math.cos(a) * 1.35, 0.32, Math.sin(a) * 1.35, HEDGE)),
      ...[-1, 1].flatMap((s) => [cyl(0.03, 0.04, 1.2, s * 1.05, 0.72, 1.05, DARK, 6), box(0.12, 0.05, 0.12, s * 1.05, 1.34, 1.05, DARK)]),
    ]),
    glow: merge([
      // Figure: legs, torso, head, raised arm with a coin.
      cyl(0.11, 0.14, 0.5, 0, 1.7, 0, GOLD, 8),
      cyl(0.15, 0.12, 0.45, 0, 2.17, 0, GOLD, 8),
      part(new SphereGeometry(0.13, 10, 8), 0, 2.53, 0, GOLD),
      part(new CylinderGeometry(0.04, 0.045, 0.5, 6).rotateZ(-0.5), 0.27, 2.55, 0, GOLD),
      part(new CylinderGeometry(0.17, 0.17, 0.04, 14).rotateX(Math.PI / 2), 0.42, 2.85, 0, GOLD),
      part(new CylinderGeometry(0.035, 0.04, 0.4, 6).rotateZ(0.35), -0.2, 2.12, 0, GOLD),
      ...[-1, 1].map((s) => part(new SphereGeometry(0.08, 8, 6), s * 1.05, 1.42, 1.05, '#fff3d0')),
    ]),
  },
  // Library: cream stone hall on a stepped base, six-column portico, pediment with an open book,
  // blue roof with a cupola, lower side wings, planters and lamps.
  library: {
    body: merge([
      box(3.7, 0.1, 3.1, 0, 0.05, 0.1, STONE_DARK),
      box(3.45, 0.1, 2.85, 0, 0.15, 0.1, STONE),
      box(3.2, 0.1, 2.6, 0, 0.25, 0.1, STONE_DARK),
      // Main hall and wings.
      box(2.5, 1.5, 1.7, 0, 1.05, -0.2, '#efe6d6'),
      box(0.75, 1.1, 1.45, -1.62, 0.85, -0.25, '#e6dccb'),
      box(0.75, 1.1, 1.45, 1.62, 0.85, -0.25, '#e6dccb'),
      box(0.85, 0.08, 1.55, -1.62, 1.44, -0.25, STONE_DARK),
      box(0.85, 0.08, 1.55, 1.62, 1.44, -0.25, STONE_DARK),
      // Portico: floor, six columns with bases and capitals, entablature and pediment.
      box(2.6, 0.06, 0.8, 0, 0.33, 0.95, STONE),
      ...[-1.05, -0.63, -0.21, 0.21, 0.63, 1.05].flatMap((x) => [
        box(0.22, 0.08, 0.22, x, 0.4, 1.12, STONE_DARK),
        cyl(0.075, 0.085, 1.2, x, 1.04, 1.12, WHITE, 10),
        box(0.24, 0.08, 0.24, x, 1.68, 1.12, STONE_DARK),
      ]),
      box(2.7, 0.22, 0.95, 0, 1.83, 0.9, STONE),
      part(gable(2.8, 0.6, 0.3), 0, 1.94, 1.2, STONE),
      part(gable(2.75, 0.72, 1.8), 0, 1.8, -0.2, '#7f97cf'),
      // Cupola on the roof.
      cyl(0.28, 0.3, 0.38, 0, 2.62, -0.2, WHITE, 8),
      part(new SphereGeometry(0.31, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.81, -0.2, '#7f97cf'),
      // Door, windows (main hall front, wings front and sides).
      box(0.5, 0.82, 0.03, 0, 0.75, 0.66, '#6b4a3a'),
      ...[-0.78, 0.78].map((x) => box(0.3, 0.6, 0.03, x, 1.05, 0.66, '#5e6f99')),
      ...[-1.62, 1.62].map((x) => box(0.36, 0.5, 0.03, x, 0.9, 0.48, '#5e6f99')),
      ...[-1, 1].map((sx) => box(0.03, 0.5, 0.36, sx * 2.0, 0.9, -0.25, '#5e6f99')),
      // Planters with topiary and lamp posts at the foot of the steps.
      ...[-1, 1].flatMap((sx) => [
        cyl(0.18, 0.2, 0.26, sx * 1.4, 0.43, 1.25, STONE_DARK, 8),
        part(new IcosahedronGeometry(0.24, 0), sx * 1.4, 0.75, 1.25, HEDGE),
        cyl(0.03, 0.04, 1.0, sx * 1.95, 0.5, 1.45, DARK, 6),
      ]),
    ]),
    glow: merge([
      // Open book in the pediment, gold frieze line, cupola finial and lamp heads.
      part(new BoxGeometry(0.28, 0.2, 0.03).rotateY(0.35), -0.13, 2.15, 1.36, '#fff3d0'),
      part(new BoxGeometry(0.28, 0.2, 0.03).rotateY(-0.35), 0.13, 2.15, 1.36, '#fff3d0'),
      box(2.72, 0.05, 0.02, 0, 1.76, 1.38, GOLD),
      part(new SphereGeometry(0.07, 8, 6), 0, 3.16, -0.2, GOLD),
      ...[-1, 1].map((sx) => part(new SphereGeometry(0.08, 8, 6), sx * 1.95, 1.05, 1.45, '#fff3d0')),
    ]),
  },
  // Lighthouse: octagonal stone foundation among a few rocks, a slim tower in seven red/white bands,
  // gallery with railing, a tall glass lantern under a red cap and weathervane, and the keeper's
  // cottage on the landward side. The beam sweeps (see <Beam>); the pier and boat are in Landmarks.
  lighthouse: {
    body: merge([
      ...[
        [1.25, 0.2, 0.75, 0.55],
        [-0.55, 0.15, -1.2, 0.5],
        [0.95, 0.1, -0.95, 0.42],
        [-1.45, 0.08, 1.05, 0.36],
      ].map(([x, y, z, r]) => part(new IcosahedronGeometry(r, 0).scale(1, 0.65, 1), x, y, z, '#aaa2ae')),
      part(new CylinderGeometry(1.05, 1.15, 0.36, 8).rotateY(Math.PI / 8), 0, 0.18, 0, '#cfc6bd'),
      part(new CylinderGeometry(0.88, 0.95, 0.2, 8).rotateY(Math.PI / 8), 0, 0.46, 0, STONE),
      // Tower: seven slim tapering bands.
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const rb = 0.62 - i * 0.045;
        return cyl(rb - 0.045, rb, 0.7, 0, 0.56 + (i + 0.5) * 0.7, 0, i % 2 ? WHITE : '#e8505b', 18);
      }),
      // Door with a step, and small windows climbing the tower.
      box(0.28, 0.5, 0.04, 0, 0.82, 0.61, DARK),
      box(0.45, 0.07, 0.22, 0, 0.6, 0.76, STONE_DARK),
      ...[1.9, 2.9, 3.9, 4.8].map((y, i) => box(0.14, 0.22, 0.04, (i % 2 ? 1 : -1) * 0.1, y, 0.59 - i * 0.045, '#5e6f99')),
      // Gallery: deck, railing posts and top rail.
      cyl(0.62, 0.5, 0.12, 0, 5.52, 0, DARK, 18),
      ...Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2).map((a) => box(0.022, 0.32, 0.022, Math.cos(a) * 0.58, 5.74, Math.sin(a) * 0.58, DARK)),
      part(new TorusGeometry(0.58, 0.02, 4, 32).rotateX(Math.PI / 2), 0, 5.9, 0, DARK),
      // Lantern mullions, cap, ventilator ball and weathervane.
      ...[0, 1, 2, 3, 4, 5].map((i) => box(0.035, 0.62, 0.035, Math.cos((i * Math.PI) / 3) * 0.32, 5.9, Math.sin((i * Math.PI) / 3) * 0.32, DARK)),
      cyl(0.38, 0.38, 0.05, 0, 6.23, 0, DARK, 16),
      part(new ConeGeometry(0.44, 0.46, 16), 0, 6.48, 0, '#e8505b'),
      part(new SphereGeometry(0.065, 8, 6), 0, 6.75, 0, DARK),
      box(0.02, 0.22, 0.02, 0, 6.9, 0, DARK),
      box(0.26, 0.02, 0.05, 0.04, 6.98, 0, DARK),
      // Keeper's cottage on the landward side, with a chimney, door and windows.
      box(1.05, 0.72, 0.85, -1.35, 0.36, -0.55, WHITE),
      part(gable(1.18, 0.46, 0.97), -1.35, 0.72, -0.55, '#d9776a'),
      box(0.14, 0.32, 0.14, -1.6, 1.02, -0.7, '#b08a7a'),
      box(0.22, 0.4, 0.03, -1.15, 0.2, -0.11, '#9a6b52'),
      box(0.2, 0.2, 0.03, -1.55, 0.45, -0.11, '#5e6f99'),
      box(0.03, 0.2, 0.2, -1.88, 0.45, -0.55, '#5e6f99'),
    ]),
    glow: merge([cyl(0.3, 0.3, 0.6, 0, 5.9, 0, '#fff3a6', 12)]),
  },
  // Observatory: stone podium, windowed drum with pilasters and a cornice, a purple ribbed dome that
  // slowly turns with its telescope (see <SpinningDome>), and an annex with a radio dish.
  observatory: {
    body: merge([
      cyl(1.62, 1.72, 0.14, 0, 0.07, 0, STONE_DARK, 24),
      box(0.95, 0.1, 0.36, 0, 0.05, 1.78, STONE),
      cyl(1.34, 1.36, 0.2, 0, 0.24, 0, '#d9cfe6', 22),
      cyl(1.25, 1.28, 1.3, 0, 0.99, 0, '#ece6f4', 22),
      cyl(1.36, 1.3, 0.14, 0, 1.6, 0, '#d9cfe6', 22),
      // Pilasters and windows round the drum (the door takes the front).
      ...Array.from({ length: 8 }, (_, i) => ((i + 0.5) / 8) * Math.PI * 2).map((a) =>
        part(new BoxGeometry(0.1, 1.3, 0.08).rotateY(-a + Math.PI / 2), Math.cos(a) * 1.28, 0.99, Math.sin(a) * 1.28, '#d9cfe6'),
      ),
      ...Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2)
        .filter((a) => Math.abs(a - Math.PI / 2) > 0.1)
        .map((a) => part(new BoxGeometry(0.24, 0.48, 0.04).rotateY(-a + Math.PI / 2), Math.cos(a) * 1.27, 1.0, Math.sin(a) * 1.27, '#4a5878')),
      box(0.44, 0.72, 0.04, 0, 0.6, 1.27, '#6b4a3a'),
      box(0.62, 0.05, 0.28, 0, 1.0, 1.36, WHITE),
      // Annex with a flat roof and a radio dish.
      box(1.1, 0.72, 0.95, 1.6, 0.42, -0.45, '#e9e2f2'),
      box(1.2, 0.06, 1.05, 1.6, 0.81, -0.45, '#d9cfe6'),
      box(0.26, 0.42, 0.03, 1.6, 0.27, 0.04, '#6b4a3a'),
      cyl(0.04, 0.05, 0.4, 1.6, 1.04, -0.45, DARK, 6),
      part(new SphereGeometry(0.45, 12, 4, 0, Math.PI * 2, 0, Math.PI / 3.2).rotateX(Math.PI + 0.6), 1.6, 1.45, -0.4, WHITE),
      part(new IcosahedronGeometry(0.32, 0), -1.55, 0.35, 1.0, HEDGE),
      part(new IcosahedronGeometry(0.24, 0), -1.75, 0.28, 0.55, '#86c07a'),
    ]),
    glow: merge([part(new SphereGeometry(0.05, 6, 4), 1.6, 1.32, -0.4, '#ff5a6e'), box(0.3, 0.07, 0.02, 0, 0.98, 1.38, '#fff3d0')]),
  },
  // Hall of fame: colonnaded rotunda on a stepped base with a gold-tipped obelisk rising from it.
  landmark: {
    body: merge([
      box(2.7, 0.14, 2.7, 0, 0.07, 0, STONE_DARK),
      box(2.35, 0.14, 2.35, 0, 0.21, 0, STONE),
      cyl(1.0, 1.0, 0.1, 0, 0.33, 0, STONE_DARK, 16),
      ...Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2).map((a) => cyl(0.07, 0.08, 1.2, Math.cos(a) * 0.85, 0.98, Math.sin(a) * 0.85, WHITE, 8)),
      cyl(1.0, 1.0, 0.16, 0, 1.66, 0, STONE, 16),
      part(new CylinderGeometry(0.4, 0.62, 5.0, 4).rotateY(Math.PI / 4), 0, 4.2, 0, '#d8c19c'),
      ...[1.8, 3.2, 4.6].map((y) => part(new CylinderGeometry(0.64 - (y - 1.8) * 0.045, 0.66 - (y - 1.8) * 0.045, 0.1, 4).rotateY(Math.PI / 4), 0, y, 0, STONE)),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.22, 0.4, 0.22, sx * 1.1, 0.48, sz * 1.1, STONE))),
    ]),
    glow: merge([
      part(new ConeGeometry(0.42, 0.65, 4).rotateY(Math.PI / 4), 0, 7.02, 0, GOLD),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(new SphereGeometry(0.1, 8, 6), sx * 1.1, 0.78, sz * 1.1, '#fff3d0'))),
    ]),
  },
};

const BODY_MAT = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
const GLOW_MAT = new MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#e7a52e', emissiveIntensity: 0.35 });

function PrimitiveDeco({ kind, bloom = 0 }: { kind: DecoKind; bloom?: number }) {
  if (kind === 'garden') return <Garden bloom={bloom} />;
  const g = DECO_GEO[kind];
  return (
    <group>
      <mesh geometry={g.body} material={BODY_MAT} castShadow receiveShadow />
      <mesh geometry={g.glow} material={GLOW_MAT} castShadow />
      {kind === 'observatory' && <SpinningDome />}
      {kind === 'lighthouse' && <Beam />}
    </group>
  );
}

// --- Moving parts ------------------------------------------------------------------

const DOME_Y = 1.67;
/** Observatory dome with ribs, the open slit and the telescope poking out of it; turns slowly. */
const DOME_GEO = merge([
  part(new SphereGeometry(1.22, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, DOME_Y, 0, '#b9a8ec'),
  ...[0, 1, 2, 3].map((i) => part(new TorusGeometry(1.235, 0.025, 4, 28, Math.PI).rotateY((i * Math.PI) / 4), 0, DOME_Y, 0, '#9483c9')),
  part(new BoxGeometry(0.4, 1.15, 0.12).rotateX(-Math.PI / 4), 0, DOME_Y + 0.87, 0.87, '#2f3446'),
  part(new CylinderGeometry(0.12, 0.16, 1.4, 10).rotateX(Math.PI / 4), 0, DOME_Y + 1.05, 1.05, '#5b5566'),
]);
const LENS_GEO = merge([part(new CylinderGeometry(0.13, 0.13, 0.04, 10).rotateX(Math.PI / 4), 0, DOME_Y + 1.54, 1.54, '#9fd8ff')]);

function SpinningDome() {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.12;
  });
  return (
    <group ref={ref}>
      <mesh geometry={DOME_GEO} material={BODY_MAT} castShadow />
      <mesh geometry={LENS_GEO} material={GLOW_MAT} />
    </group>
  );
}

/** Two light beams sweeping round from the lighthouse lantern (brighter at night). */
const BEAM_GEO = merge([
  new ConeGeometry(0.75, 7, 14, 1, true).translate(0, -3.5, 0).rotateZ(Math.PI / 2),
  new ConeGeometry(0.75, 7, 14, 1, true).translate(0, -3.5, 0).rotateZ(Math.PI / 2).rotateY(Math.PI),
]);

function Beam() {
  const ref = useRef<Group>(null);
  const dark = useGame((s) => s.theme === 'dark');
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#fff3b0', transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }), []);
  mat.opacity = dark ? 0.3 : 0.08;
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.7;
  });
  return (
    <group ref={ref} position-y={5.9}>
      <mesh geometry={BEAM_GEO} material={mat} raycast={() => {}} />
    </group>
  );
}

// --- Dividend garden -----------------------------------------------------------
// A round formal garden around a "money tree". Flower clusters grow and gold coins appear on the
// tree as the portfolio's dividend yield rises. Pre-merged with vertex colours (a few draw calls).

const BED_CENTERS: [number, number][] = [
  [0.78, 0.78],
  [-0.78, 0.78],
  [0.78, -0.78],
  [-0.78, -0.78],
];
const BED_COLORS = [
  ['#ff8fb1', '#ffc2d4'],
  ['#ffd36e', '#fff1b8'],
  ['#b9a8ec', '#e4dcff'],
  ['#ff9f7a', '#ffffff'],
];

const GARDEN = {
  base: merge([
    // Lawn disc, cross-shaped stone paths and a round centre plaza.
    part(new CylinderGeometry(1.55, 1.6, 0.14, 32), 0, 0.07, 0, '#9fd68c'),
    part(new BoxGeometry(3.1, 0.03, 0.34), 0, 0.155, 0, '#efe6d6'),
    part(new BoxGeometry(0.34, 0.03, 3.1), 0, 0.155, 0, '#efe6d6'),
    part(new CylinderGeometry(0.42, 0.42, 0.035, 20), 0, 0.16, 0, '#e6dccb'),
    // Low hedge ring with gaps where the paths leave.
    ...Array.from({ length: 24 }, (_, i) => ((i + 0.5) / 24) * Math.PI * 2)
      .filter((a) => Math.min(...[0, 0.5, 1, 1.5, 2].map((q) => Math.abs(a - q * Math.PI))) > 0.2)
      .map((a) => part(new BoxGeometry(0.36, 0.22, 0.18).rotateY(-a + Math.PI / 2), Math.cos(a) * 1.42, 0.25, Math.sin(a) * 1.42, '#5f9e6a')),
    // Flower bed rims (soil inside).
    ...BED_CENTERS.flatMap(([x, z]) => [part(new CylinderGeometry(0.42, 0.44, 0.12, 14), x, 0.2, z, '#d9c7ae'), part(new CylinderGeometry(0.36, 0.36, 0.13, 14), x, 0.21, z, '#8a6a4f')]),
    // Money tree: trunk and round canopy.
    part(new CylinderGeometry(0.06, 0.1, 0.75, 7), 0, 0.53, 0, '#8a6a4f'),
    part(new IcosahedronGeometry(0.42, 1), 0, 1.1, 0, '#6fb582'),
    part(new IcosahedronGeometry(0.28, 1), 0.22, 1.32, 0.08, '#7fc48f'),
    // Two benches on the paths.
    ...[0.62, -0.62].flatMap((x) => [part(new BoxGeometry(0.34, 0.04, 0.12), x, 0.3, 0.3, '#b88c66'), part(new BoxGeometry(0.3, 0.12, 0.08), x, 0.22, 0.3, '#6b5a4e')]),
  ]),
  // One flower cluster per bed, centred on the origin so each can be scaled with the yield.
  flowers: BED_COLORS.map(([a, b]) =>
    merge(
      Array.from({ length: 9 }, (_, i) => {
        const ang = (i / 8) * Math.PI * 2;
        const r = i === 0 ? 0 : 0.2;
        return part(new IcosahedronGeometry(i === 0 ? 0.11 : 0.09, 0), Math.cos(ang) * r, 0.08 + (i % 2) * 0.04, Math.sin(ang) * r, i % 3 ? a : b);
      }),
    ),
  ),
  coins: merge(
    Array.from({ length: 8 }, (_, i) => {
      const ang = (i / 8) * Math.PI * 2;
      return part(new CylinderGeometry(0.06, 0.06, 0.02, 10).rotateX(Math.PI / 2).rotateY(-ang), Math.cos(ang) * 0.4, 0.95 + (i % 3) * 0.12, Math.sin(ang) * 0.4, '#ffd36e');
    }),
  ),
};

function Garden({ bloom }: { bloom: number }) {
  const s = 0.35 + bloom * 0.9;
  return (
    <group>
      <mesh geometry={GARDEN.base} material={PAINTED} castShadow receiveShadow />
      {BED_CENTERS.map(([x, z], i) => (
        <mesh key={i} geometry={GARDEN.flowers[i]} material={PAINTED} position={[x, 0.27, z]} scale={s} />
      ))}
      {bloom > 0.05 && (
        <mesh geometry={GARDEN.coins}>
          <meshLambertMaterial vertexColors emissive="#e7a52e" emissiveIntensity={0.25 + bloom * 0.4} flatShading />
        </mesh>
      )}
    </group>
  );
}

const PAINTED = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
