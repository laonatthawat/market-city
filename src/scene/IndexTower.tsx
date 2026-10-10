import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, Color, ConeGeometry, DoubleSide, CylinderGeometry, IcosahedronGeometry, LatheGeometry, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, RingGeometry, TorusGeometry, Vector2 } from 'three';
import type { Group, Mesh } from 'three';
import { pct } from '../lib/format';
import { merge, part } from './geom';
import { windowColor } from './visuals';

/**
 * The plaza monument. Meaning is unchanged: the shaft's height follows the city index relative to the
 * run start, and its light strips glow with the index's 20-day momentum (bright = rising, dim = falling).
 * Base, pool and crown are pre-merged with vertex colours; the crown rides on top of the scaled shaft.
 */

const STONE = '#efe6f7';
const STONE_2 = '#e3d7f1';
const LILAC = '#cdbce8';
const LILAC_DARK = '#b5a2d9';
const SHAFT_H = 10;
const SHAFT_Y = 1.4;

const v = (x: number, y: number) => new Vector2(x, y);
const oct = (rt: number, rb: number, h: number, y: number, c: string) => part(new CylinderGeometry(rt, rb, h, 8).rotateY(Math.PI / 8), 0, y, 0, c);

/** Stepped plinth with a reflecting-pool channel, an upper drum and four lanterns. */
const BASE_GEO = merge([
  // Lower tier: outer wall, rim, the pool channel (water sits below both rims) and the inner rim.
  part(new LatheGeometry([v(4.5, 0), v(4.5, 0.42), v(4.36, 0.52), v(3.98, 0.52), v(3.96, 0.36), v(3.32, 0.36), v(3.3, 0.6), v(0.01, 0.6)], 32), 0, 0, 0, STONE),
  // Steps on the four sides.
  ...[0, 1, 2, 3].map((i) => part(new BoxGeometry(1.6, 0.22, 0.5).translate(0, 0.11, 4.62).rotateY((i * Math.PI) / 2), 0, 0, 0, STONE_2)),
  // Upper drum with a cornice.
  oct(2.75, 2.95, 0.7, 0.95, STONE_2),
  oct(3.05, 3.05, 0.12, 1.34, LILAC),
  // Lantern posts on the lower tier's corners.
  ...[1, 3, 5, 7].map((i) => {
    const a = (i * Math.PI) / 4;
    return part(new CylinderGeometry(0.06, 0.08, 0.9, 6), Math.cos(a) * 4.18, 0.97, Math.sin(a) * 4.18, '#6b6578');
  }),
]);
const GOLD_GEO = merge([
  oct(4.52, 4.52, 0.05, 0.43, '#ffd36e'),
  part(new LatheGeometry([v(2.92, 1.47), v(3.08, 1.47), v(3.08, 1.37)], 8).rotateY(Math.PI / 8), 0, 0, 0, '#ffd36e'),
  ...[1, 3, 5, 7].map((i) => {
    const a = (i * Math.PI) / 4;
    return part(new IcosahedronGeometry(0.16, 0), Math.cos(a) * 4.18, 1.5, Math.sin(a) * 4.18, '#fff3c4');
  }),
]);
const POOL_GEO = new RingGeometry(3.32, 3.98, 40).rotateX(-Math.PI / 2).translate(0, 0.46, 0);

/** Shaft in three set-back sections, in unit height (scaled by the index ratio). */
const SECTIONS: [number, number, number][] = [
  // radius, from, to (fractions of SHAFT_H)
  [1.45, 0, 0.36],
  [1.15, 0.36, 0.7],
  [0.85, 0.7, 1],
];
const SHAFT_GEO = merge([
  ...SECTIONS.map(([r, a, b], i) => oct(r * 0.96, r, (b - a) * SHAFT_H, ((a + b) / 2) * SHAFT_H, i % 2 ? LILAC : LILAC_DARK)),
  // Ledges between the sections.
  ...SECTIONS.slice(1).map(([, a], i) => oct(SECTIONS[i][0] + 0.1, SECTIONS[i][0] + 0.1, 0.16, a * SHAFT_H, STONE)),
  oct(0.95, 0.95, 0.16, SHAFT_H, STONE),
]);
/** Vertical light strips on alternate faces of every section: the momentum glow. */
const STRIPS_GEO = merge(
  SECTIONS.flatMap(([r, a, b]) =>
    [0, 1, 2, 3].map((i) => {
      const ang = (i * Math.PI) / 2;
      const d = r * Math.cos(Math.PI / 8) + 0.01;
      const h = (b - a) * SHAFT_H - 0.6;
      return part(new BoxGeometry(0.24, h, 0.04).rotateY(-ang + Math.PI / 2), Math.cos(ang) * d, ((a + b) / 2) * SHAFT_H, Math.sin(ang) * d, '#ffffff');
    }),
  ),
);
/** Crown: gold cap and spire; the diamond and halo spin above it. */
const CROWN_GEO = merge([oct(0.55, 0.95, 0.5, 0.25, '#ffd36e'), part(new ConeGeometry(0.16, 1.1, 8), 0, 1.0, 0, '#ffd36e')]);
const DIAMOND_GEO = new OctahedronGeometry(0.7, 0).scale(1, 1.35, 1);
const HALO_GEO = new TorusGeometry(1.3, 0.05, 6, 40);

export function IndexTower({ ratio, momentum, onSelect }: { ratio: number; momentum: number; onSelect?: () => void }) {
  const shaft = useRef<Group>(null);
  const crown = useRef<Group>(null);
  const diamond = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const cur = useRef(1);
  const target = Math.max(0.3, Math.min(3, ratio));
  const glow = useMemo(() => new MeshBasicMaterial({ color: '#fff3a6', toneMapped: false }), []);
  const body = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, side: DoubleSide }), []);
  const gold = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: '#ffb84d', emissiveIntensity: 0.45, metalness: 0.4, roughness: 0.35 }), []);
  const glowTarget = useMemo(() => new Color(), []);
  windowColor(momentum, glowTarget);

  useFrame(({ clock }, dt) => {
    cur.current += (target - cur.current) * Math.min(1, dt * 3);
    if (shaft.current) shaft.current.scale.set(1, cur.current, 1);
    if (crown.current) crown.current.position.y = SHAFT_Y + SHAFT_H * cur.current;
    const t = clock.elapsedTime;
    if (diamond.current) {
      diamond.current.rotation.y = t * 0.8;
      diamond.current.position.y = 2.25 + Math.sin(t * 1.6) * 0.12;
    }
    if (halo.current) {
      halo.current.rotation.set(Math.PI / 2 + Math.sin(t * 0.7) * 0.18, 0, t * 0.5);
    }
    glow.color.lerp(glowTarget, Math.min(1, dt * 3));
  });

  return (
    <group>
      <mesh geometry={BASE_GEO} material={body} castShadow receiveShadow />
      <mesh geometry={GOLD_GEO} material={gold} />
      <mesh geometry={POOL_GEO}>
        <meshStandardMaterial color="#8fd0f0" emissive="#5fb4e6" emissiveIntensity={0.3} roughness={0.15} metalness={0.2} />
      </mesh>
      <group ref={shaft} position-y={SHAFT_Y}>
        <mesh geometry={SHAFT_GEO} material={body} castShadow receiveShadow />
        <mesh geometry={STRIPS_GEO} material={glow} />
      </group>
      <group ref={crown} position-y={SHAFT_Y + SHAFT_H}>
        <mesh geometry={CROWN_GEO} material={gold} castShadow />
        <mesh ref={diamond} geometry={DIAMOND_GEO} material={glow} position-y={2.25} />
        <mesh ref={halo} geometry={HALO_GEO} material={gold} position-y={2.25} />
      </group>
      <Html position={[0, 0.2, 5.6]} center zIndexRange={[10, 0]}>
        <div className="district-label cursor-pointer hover:brightness-95" style={{ borderColor: LILAC }} onClick={onSelect}>
          ดัชนีเมือง <span className={ratio >= 1 ? 'text-up' : 'text-down'}>{pct(ratio - 1, 1)}</span>
        </div>
      </Html>
    </group>
  );
}
