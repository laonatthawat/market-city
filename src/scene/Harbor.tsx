import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, MeshLambertMaterial, SphereGeometry, Vector3 } from 'three';
import type { Group } from 'three';
import { merge, part } from './geom';
import { LIGHTHOUSE_SPOT } from './layout';

/**
 * The lighthouse's harbour: a wooden pier running from its rocks out to sea, and a little boat that
 * moors alongside the pier, then heads out on a loop round the bay and comes back to dock.
 * World space; the pier points straight out to sea from the lighthouse.
 */

const OUT = new Vector3(LIGHTHOUSE_SPOT.x, 0, LIGHTHOUSE_SPOT.z).normalize();
const SIDE = new Vector3(-OUT.z, 0, OUT.x);
const BASE = new Vector3(LIGHTHOUSE_SPOT.x, 0, LIGHTHOUSE_SPOT.z).addScaledVector(OUT, 1.9);
const PIER_LEN = 10;
const DECK_Y = -0.78;
const SEA_Y = -1.45;
const YAW = Math.atan2(OUT.x, OUT.z);

/** Pier in its own frame (+Z = out to sea): planks, posts, rails, bollards, crates and an end lamp. */
const PIER_GEO = merge([
  ...Array.from({ length: Math.round(PIER_LEN / 0.32) }, (_, i) => part(new BoxGeometry(1.3, 0.08, 0.28), 0, 0, 0.16 + i * 0.32, i % 3 ? '#a7835f' : '#977452')),
  part(new BoxGeometry(0.08, 0.1, PIER_LEN), -0.62, -0.08, PIER_LEN / 2, '#7d5f44'),
  part(new BoxGeometry(0.08, 0.1, PIER_LEN), 0.62, -0.08, PIER_LEN / 2, '#7d5f44'),
  ...Array.from({ length: 6 }, (_, i) => 0.6 + i * ((PIER_LEN - 0.9) / 5)).flatMap((z) => [-1, 1].map((sx) => part(new CylinderGeometry(0.07, 0.08, 1.9, 6), sx * 0.6, -0.9, z, '#6b5040'))),
  // Hand rail on the sea-left side only (boats moor on the other side).
  ...Array.from({ length: 6 }, (_, i) => 0.6 + i * ((PIER_LEN - 0.9) / 5)).map((z) => part(new BoxGeometry(0.05, 0.55, 0.05), -0.6, 0.3, z, '#7d5f44')),
  part(new BoxGeometry(0.05, 0.05, PIER_LEN - 0.6), -0.6, 0.56, PIER_LEN / 2 + 0.15, '#7d5f44'),
  ...[2.4, 4.6, 6.8].map((z) => part(new CylinderGeometry(0.08, 0.1, 0.25, 8), 0.5, 0.16, z, '#4f4a5c')),
  part(new BoxGeometry(0.4, 0.35, 0.4), -0.3, 0.21, 1.6, '#c49a6c'),
  part(new BoxGeometry(0.3, 0.28, 0.3), -0.35, 0.18, 2.05, '#b88c66'),
  part(new CylinderGeometry(0.035, 0.045, 1.3, 6), -0.5, 0.65, PIER_LEN - 0.25, '#4f4a5c'),
]);
const PIER_LAMP = new SphereGeometry(0.11, 8, 6).translate(-0.5, 1.36, PIER_LEN - 0.25);

/** Small fishing boat (+Z = bow): hull with a stripe, wheelhouse, roof, mast and flag. */
const BOAT_GEO = merge([
  part(new BoxGeometry(0.95, 0.42, 1.9), 0, 0.18, -0.1, '#f6f2f8'),
  part(new ConeGeometry(0.67, 0.75, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1, 0.6, 1), 0, 0.18, 1.2, '#f6f2f8'),
  part(new BoxGeometry(0.97, 0.08, 1.92), 0, 0.12, -0.1, '#3b8fd6'),
  part(new BoxGeometry(0.9, 0.04, 1.8), 0, 0.41, -0.05, '#c49a6c'),
  part(new BoxGeometry(0.62, 0.48, 0.6), 0, 0.66, -0.55, '#f6f2f8'),
  part(new BoxGeometry(0.7, 0.06, 0.7), 0, 0.92, -0.55, '#e8505b'),
  part(new BoxGeometry(0.5, 0.18, 0.02), 0, 0.72, -0.24, '#5e6f99'),
  part(new CylinderGeometry(0.025, 0.03, 0.8, 5), 0, 1.3, -0.55, '#4f4a5c'),
  part(new BoxGeometry(0.02, 0.14, 0.22), 0, 1.6, -0.45, '#ffd36e'),
  part(new BoxGeometry(0.3, 0.12, 0.3), 0, 0.48, 0.55, '#c49a6c'),
]);

/** Where the boat moors: alongside the pier (on its right as seen from the shore), near the end. */
const DOCK = BASE.clone().addScaledVector(OUT, PIER_LEN - 1.8).addScaledVector(SIDE, 1.25);
/** Closed loop: out along the pier, round the bay, and back to the dock heading shorewards. */
const ROUTE = new CatmullRomCurve3(
  [
    DOCK,
    DOCK.clone().addScaledVector(OUT, 4),
    DOCK.clone().addScaledVector(OUT, 10).addScaledVector(SIDE, 3),
    DOCK.clone().addScaledVector(OUT, 13).addScaledVector(SIDE, 10),
    DOCK.clone().addScaledVector(OUT, 7).addScaledVector(SIDE, 13),
    DOCK.clone().addScaledVector(OUT, 2.5).addScaledVector(SIDE, 8),
    DOCK.clone().addScaledVector(OUT, 1.2).addScaledVector(SIDE, 3),
  ],
  true,
  'centripetal',
);
const CYCLE = 42;
const MOORED = 9;

const MAT = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
const _p = new Vector3();
const _t = new Vector3();

export function Harbor({ dark }: { dark: boolean }) {
  const boat = useRef<Group>(null);
  const lampMat = useMemo(() => new MeshLambertMaterial({ color: '#fff3d0', emissive: '#ffd68a', emissiveIntensity: 0.6 }), []);
  lampMat.emissiveIntensity = dark ? 1.4 : 0.6;
  useFrame(({ clock }) => {
    const g = boat.current;
    if (!g) return;
    const t = clock.elapsedTime % CYCLE;
    // Moored (bow out to sea, ready to leave) for a while, then one lap, easing out and in.
    const k = t < MOORED ? 0 : (t - MOORED) / (CYCLE - MOORED);
    const u = k * k * (3 - 2 * k);
    ROUTE.getPointAt(u, _p);
    ROUTE.getTangentAt(u, _t);
    g.position.set(_p.x, SEA_Y + 0.05 + Math.sin(clock.elapsedTime * 1.3) * 0.06, _p.z);
    g.rotation.set(Math.sin(clock.elapsedTime * 0.9) * 0.04, Math.atan2(_t.x, _t.z), Math.sin(clock.elapsedTime * 1.1) * 0.05);
  });
  return (
    <group>
      <group position={[BASE.x, DECK_Y, BASE.z]} rotation-y={YAW}>
        <mesh geometry={PIER_GEO} material={MAT} castShadow receiveShadow />
        <mesh geometry={PIER_LAMP} material={lampMat} />
      </group>
      <group ref={boat} rotation-order="YXZ">
        <mesh geometry={BOAT_GEO} material={MAT} castShadow />
      </group>
    </group>
  );
}
