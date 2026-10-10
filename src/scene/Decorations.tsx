import { Gltf } from '@react-three/drei';
import { Suspense } from 'react';
import { BoxGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, IcosahedronGeometry, MeshLambertMaterial, Shape, SphereGeometry } from 'three';
import type { BufferGeometry } from 'three';
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
  // Library: classical hall with steps, columns, pediment, tall windows and an open book over the door.
  library: {
    body: merge([
      box(3.0, 0.14, 2.7, 0, 0.07, 0.1, STONE_DARK),
      box(2.8, 0.14, 2.5, 0, 0.21, 0.1, STONE),
      box(2.6, 1.7, 1.9, 0, 1.13, -0.15, '#a9c0ec'),
      box(2.7, 0.18, 2.1, 0, 2.05, -0.05, STONE),
      ...[-1.05, -0.63, -0.21, 0.21, 0.63, 1.05].map((x) => cyl(0.09, 0.1, 1.72, x, 1.14, 0.98, WHITE, 8)),
      box(2.6, 0.12, 0.3, 0, 0.34, 1.0, STONE),
      part(gable(2.9, 0.75, 2.3), 0, 2.14, -0.05, '#7f97cf'),
      part(gable(2.75, 0.62, 0.12), 0, 2.16, 1.04, STONE),
      box(0.42, 0.85, 0.04, 0, 0.71, 0.82, DARK),
      ...[-0.85, -0.45, 0.45, 0.85].map((x) => box(0.26, 0.75, 0.04, x, 1.15, 0.82, '#5e6f99')),
      ...[-1, 1].map((s) => box(0.04, 0.75, 0.3, s * 1.31, 1.15, -0.2, '#5e6f99')),
      ...[-1.25, 1.25].map((x) => part(new IcosahedronGeometry(0.3, 0), x, 0.5, 1.3, HEDGE)),
    ]),
    glow: merge([
      // Open book emblem in the pediment.
      part(new BoxGeometry(0.28, 0.2, 0.03).rotateY(0.35), -0.13, 2.45, 1.12, '#fff3d0'),
      part(new BoxGeometry(0.28, 0.2, 0.03).rotateY(-0.35), 0.13, 2.45, 1.12, '#fff3d0'),
    ]),
  },
  // Lighthouse on rocks: banded tower, gallery with railing, glowing lantern and a keeper's cottage.
  lighthouse: {
    body: merge([
      part(new IcosahedronGeometry(1.2, 0).scale(1.3, 0.45, 1.2), 0, 0.15, 0, '#b5adb9'),
      part(new IcosahedronGeometry(0.6, 0).scale(1, 0.6, 1), 1.0, 0.2, 0.7, '#c9c2cc'),
      ...[0, 1, 2, 3, 4].map((i) => cyl(0.78 - (i + 1) * 0.09, 0.78 - i * 0.09, 0.9, 0, 0.75 + i * 0.9, 0, i % 2 ? WHITE : '#ef6b6b', 14)),
      cyl(0.62, 0.62, 0.08, 0, 5.1, 0, DARK, 16),
      ...Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2).map((a) => box(0.03, 0.3, 0.03, Math.cos(a) * 0.58, 5.29, Math.sin(a) * 0.58, DARK)),
      cyl(0.6, 0.6, 0.03, 0, 5.44, 0, DARK, 16),
      ...[0, 1, 2, 3].map((i) => box(0.04, 0.55, 0.04, Math.cos((i * Math.PI) / 2 + 0.78) * 0.36, 5.44, Math.sin((i * Math.PI) / 2 + 0.78) * 0.36, DARK)),
      part(new ConeGeometry(0.52, 0.55, 12), 0, 5.98, 0, '#ef6b6b'),
      part(new SphereGeometry(0.08, 6, 4), 0, 6.3, 0, DARK),
      box(0.3, 0.5, 0.04, 0, 0.9, 0.7, DARK),
      ...[1.6, 2.6, 3.5].map((y, i) => box(0.18, 0.28, 0.04, 0, y, 0.7 - (i + 1) * 0.08, '#5e6f99')),
      // Keeper's cottage.
      box(1.0, 0.7, 0.8, -1.05, 0.62, 0.55, WHITE),
      part(gable(1.12, 0.45, 0.9), -1.05, 0.97, 0.55, '#ef6b6b'),
      box(0.22, 0.4, 0.03, -1.05, 0.47, 0.96, '#9a6b52'),
    ]),
    glow: merge([cyl(0.36, 0.36, 0.52, 0, 5.43, 0, '#fff3a6', 12)]),
  },
  // Observatory: drum with windows, dome with an open slit and a telescope, stairs and an antenna.
  observatory: {
    body: merge([
      cyl(1.45, 1.5, 0.14, 0, 0.07, 0, STONE_DARK, 20),
      cyl(1.2, 1.25, 1.7, 0, 0.99, 0, '#e9e2f2', 18),
      cyl(1.27, 1.27, 0.12, 0, 1.86, 0, '#cfc4e4', 18),
      part(new SphereGeometry(1.18, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.92, 0, '#b9a8ec'),
      // Dome slit (dark) and the telescope tube poking out.
      part(new BoxGeometry(0.36, 1.05, 0.08).rotateX(-Math.PI / 4), 0, 1.92 + 0.86, 0.86, DARK),
      part(new CylinderGeometry(0.12, 0.16, 1.3, 10).rotateX(Math.PI / 4), 0, 1.92 + 1.05, 1.05, '#5b5566'),
      ...Array.from({ length: 6 }, (_, i) => ((i + 0.5) / 6) * Math.PI * 2).map((a) => part(new BoxGeometry(0.28, 0.5, 0.04).rotateY(-a + Math.PI / 2), Math.cos(a) * 1.22, 1.15, Math.sin(a) * 1.22, '#5e6f99')),
      box(0.4, 0.75, 0.05, 0, 0.52, 1.22, DARK),
      box(0.8, 0.1, 0.4, 0, 0.05, 1.45, STONE),
      cyl(0.02, 0.025, 0.9, -0.85, 2.6, -0.5, DARK, 5),
      part(new SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), -0.85, 3.05, -0.5, WHITE),
    ]),
    glow: merge([part(new SphereGeometry(0.05, 6, 4), -0.85, 3.08, -0.5, '#ff5a6e'), part(new BoxGeometry(0.3, 0.08, 0.02), 0, 0.98, 1.25, '#fff3d0')]),
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
