import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CircleGeometry, CylinderGeometry, DoubleSide, IcosahedronGeometry, LatheGeometry, Matrix4, MeshBasicMaterial, Quaternion, RingGeometry, SphereGeometry, Vector2, Vector3 } from 'three';
import type { InstancedMesh, Mesh } from 'three';
import { merge, part } from './geom';

/**
 * Two-tier stone fountain with arcing jets, a falling curtain from the upper bowl and ripples.
 * Water surfaces sit well below the stone rims and never move vertically, so nothing z-fights.
 */

const v = (x: number, y: number) => new Vector2(x, y);

const STONE_GEO = merge([
  // Lower basin: floor, inner wall, rounded rim, outer wall and a little plinth.
  part(new LatheGeometry([v(0, 0.14), v(1.0, 0.14), v(1.0, 0.42), v(1.08, 0.49), v(1.2, 0.5), v(1.27, 0.43), v(1.27, 0.06), v(1.36, 0)], 28), 0, 0, 0),
  // Pedestal and the upper bowl (inner floor dips to the centre).
  part(new CylinderGeometry(0.13, 0.2, 0.72, 10), 0, 0.5, 0),
  part(new LatheGeometry([v(0.12, 0.8), v(0.48, 0.97), v(0.6, 1.07), v(0.57, 1.12), v(0.5, 1.09), v(0.05, 1.0)], 20), 0, 0, 0),
  // Finial with the spout.
  part(new CylinderGeometry(0.05, 0.07, 0.3, 8), 0, 1.15, 0),
  part(new SphereGeometry(0.09, 8, 6), 0, 1.33, 0),
]);
const WATER_GEO = merge([part(new CircleGeometry(1.0, 28).rotateX(-Math.PI / 2), 0, 0.34, 0), part(new CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), 0, 1.05, 0)]);
const DROP_GEO = new IcosahedronGeometry(0.036, 0);
const RIPPLE_GEO = new RingGeometry(0.9, 1, 28).rotateX(-Math.PI / 2);

const ARCS = 16;
const ARC_PHASES = 3;
const CURTAIN = 20;
const DROPS = ARCS * ARC_PHASES + CURTAIN;

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();

export function Fountain({ dark, position = [0, 0, 0] as [number, number, number], scale = 1 }: { dark: boolean; position?: [number, number, number]; scale?: number }) {
  const drops = useRef<InstancedMesh>(null);
  const ripples = useRef<(Mesh | null)[]>([]);
  const dropMat = useMemo(() => new MeshBasicMaterial({ color: '#e6f7ff', transparent: true, opacity: 0.85 }), []);
  const rippleMats = useMemo(() => [0, 1].map(() => new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const m = drops.current;
    if (m) {
      let n = 0;
      // Arcing jets from the spout down into the lower basin.
      for (let i = 0; i < ARCS; i++) {
        const a = (i / ARCS) * Math.PI * 2;
        for (let k = 0; k < ARC_PHASES; k++) {
          const l = (t * 0.9 + k / ARC_PHASES + i * 0.037) % 1;
          const r = 0.12 + l * 0.75;
          _p.set(Math.cos(a) * r, 1.36 + 0.9 * l - 1.92 * l * l, Math.sin(a) * r);
          _s.setScalar(1 - l * 0.35);
          m.setMatrixAt(n++, _m.compose(_p, _q, _s));
        }
      }
      // Water spilling over the upper bowl's rim.
      for (let i = 0; i < CURTAIN; i++) {
        const a = (i / CURTAIN) * Math.PI * 2 + 0.1;
        const l = (t * 1.3 + i * 0.29) % 1;
        _p.set(Math.cos(a) * (0.6 + l * 0.05), 1.08 - 0.74 * l * l, Math.sin(a) * (0.6 + l * 0.05));
        _s.set(0.8, 1.6, 0.8);
        m.setMatrixAt(n++, _m.compose(_p, _q, _s));
      }
      m.instanceMatrix.needsUpdate = true;
    }
    ripples.current.forEach((r, i) => {
      if (!r) return;
      const l = (t * 0.45 + i * 0.5) % 1;
      r.scale.setScalar(0.25 + l * 0.72);
      rippleMats[i].opacity = 0.55 * (1 - l);
    });
  });

  return (
    <group name="fountain" position={position} scale={scale}>
      <mesh geometry={STONE_GEO} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#b9b3c9' : '#f3ede4'} flatShading side={DoubleSide} />
      </mesh>
      <mesh geometry={WATER_GEO} raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#3f7fb3' : '#7cc6ea'} emissive="#4fa8dc" emissiveIntensity={dark ? 0.5 : 0.18} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => void (ripples.current[i] = m)} geometry={RIPPLE_GEO} material={rippleMats[i]} position-y={0.35} raycast={noRaycast} />
      ))}
      <instancedMesh ref={drops} args={[DROP_GEO, dropMat, DROPS]} frustumCulled={false} raycast={noRaycast} />
    </group>
  );
}

const noRaycast = () => {};
