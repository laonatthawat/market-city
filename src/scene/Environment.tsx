import { Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { CityLayout, District } from './layout';
import { ISLAND_RADIUS, PLAZA_RADIUS, ROAD_INNER, ROAD_OUTER, openGround } from './layout';
import { skyFx } from './Weather';

/**
 * Everything around the city blocks: sky dome, ocean, the island itself, roads, plaza and street furniture.
 * All repeated props are instanced; nothing allocates per frame.
 */

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();
const UP = new Vector3(0, 1, 0);
const noRaycast = () => {};

const ROAD_MID = (ROAD_INNER + ROAD_OUTER) / 2;
const SAND_RADIUS = ISLAND_RADIUS + 3.2;

function seeded(n: number) {
  let s = n * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/** Vertical gradient sky (horizon → zenith) that follows the weather. */
export function SkyDome({ dark }: { dark: boolean }) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new Color() }, horizon: { value: new Color() } },
        vertexShader: /* glsl */ `
          varying float vH;
          void main() {
            vH = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top;
          uniform vec3 horizon;
          varying float vH;
          void main() {
            float t = smoothstep(-0.02, 0.55, vH);
            gl_FragColor = vec4(mix(horizon, top, t), 1.0);
          }`,
      }),
    [],
  );
  const geo = useMemo(() => new SphereGeometry(520, 24, 16), []);
  const meshRef = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    mat.uniforms.top.value.copy(skyFx.top);
    mat.uniforms.horizon.value.copy(skyFx.horizon);
    meshRef.current?.position.copy(camera.position);
  });
  return (
    <>
      <mesh ref={meshRef} geometry={geo} material={mat} renderOrder={-1} raycast={noRaycast} />
      {dark && <Stars radius={260} depth={60} count={1400} factor={5} saturation={0} fade speed={0.4} />}
    </>
  );
}

/** Where the sea surface meets the sloping sand (see Island's sand ring). */
const SHORE_R = SAND_RADIUS + 2.1;
const BREAKERS = 3;

/** Uneven ring for a wave crest, so breakers don't look like perfect circles. */
function crestGeometry(seed: number) {
  const g = new RingGeometry(SHORE_R, SHORE_R + 0.5, 120, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const a = Math.atan2(y, x);
    const k = 1 + (Math.sin(a * 7 + seed) * 0.012 + Math.sin(a * 13 + seed * 2.3) * 0.008);
    pos.setXY(i, x * k, y * k);
  }
  return g;
}

/** Rolling low-poly sea (vertex-shader swell), shore breakers rolling in and a breathing foam line. */
export function Ocean({ dark }: { dark: boolean }) {
  const waveTime = useMemo(() => ({ value: 0 }), []);
  const water = useMemo(() => {
    const m = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.15, flatShading: true });
    // Swell: a few travelling sines in the plane's local XY (world X/Z), damped near the shore.
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waveTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          vec2 p = position.xy;
          float r = length(p);
          float amp = smoothstep(${SHORE_R.toFixed(1)}, ${(SHORE_R + 22).toFixed(1)}, r) * 0.75 + 0.25;
          float h = sin(p.x * 0.11 + uTime * 0.9) * 0.22
                  + sin(p.y * 0.15 - uTime * 0.7) * 0.16
                  + sin((p.x + p.y) * 0.31 + uTime * 1.6) * 0.07
                  + sin(r * 0.5 - uTime * 1.3) * 0.06;
          transformed.z += h * amp;
        }`,
      );
    };
    m.customProgramCacheKey = () => 'mc-ocean-waves';
    return m;
  }, [waveTime]);
  const foamMat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }), []);
  const crestMats = useMemo(() => Array.from({ length: BREAKERS }, () => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })), []);
  const crestGeos = useMemo(() => Array.from({ length: BREAKERS }, (_, i) => crestGeometry(i * 2.1)), []);
  const foam = useRef<Mesh>(null);
  const crests = useRef<(Mesh | null)[]>([]);
  const base = useMemo(() => new Color(), []);
  // Low-poly sea: a ring whose rows bunch up near the island (where the swell is seen up close).
  const seaGeo = useMemo(() => {
    const g = new RingGeometry(SAND_RADIUS - 2, 620, 144, 46);
    const pos = g.attributes.position;
    const r = seeded(5);
    const inner = SAND_RADIUS - 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const d = Math.hypot(x, y);
      const t = Math.min(1, Math.max(0, (d - inner) / (620 - inner)));
      const nd = inner + (620 - inner) * t ** 2.2;
      pos.setXYZ(i, (x / d) * nd, (y / d) * nd, (r() - 0.5) * 0.35);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    waveTime.value = t;
    base.set(dark ? '#1b3552' : '#7fcbe0').lerp(skyFx.horizon, dark ? 0.15 : 0.22);
    // Rain and storms turn the sea grey.
    water.color.copy(base).lerp(_c.set(dark ? '#1a2230' : '#8c9aa8'), skyFx.rain * 0.6);
    if (foam.current) {
      foam.current.scale.setScalar(1 + Math.sin(t * 0.9) * 0.006);
      foamMat.opacity = 0.5 + Math.sin(t * 0.9) * 0.2;
    }
    // Breakers: crests roll in from ~9 units out, brighten, then wash up and fade on the sand.
    crests.current.forEach((m, i) => {
      if (!m) return;
      const life = (t * 0.12 + i / BREAKERS) % 1;
      m.scale.setScalar(1 + (1 - life) * 0.17);
      crestMats[i].opacity = Math.sin(life * Math.PI) ** 1.5 * (dark ? 0.3 : 0.5) * (1 - skyFx.rain * 0.3);
    });
  });

  return (
    <group>
      <mesh geometry={seaGeo} material={water} rotation-x={-Math.PI / 2} position-y={-1.45} raycast={noRaycast} />
      <mesh ref={foam} material={foamMat} rotation-x={-Math.PI / 2} position-y={-1.3} raycast={noRaycast}>
        <ringGeometry args={[SHORE_R - 0.6, SHORE_R + 0.5, 96]} />
      </mesh>
      {crestGeos.map((g, i) => (
        <mesh key={i} ref={(m) => void (crests.current[i] = m)} geometry={g} material={crestMats[i]} rotation-x={-Math.PI / 2} position-y={-1.25} raycast={noRaycast} />
      ))}
    </group>
  );
}

/** The island: grass top with a soil edge, a sandy beach and scattered grass patches. */
export function Island({ dark }: { dark: boolean }) {
  const top = useMemo(() => new CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 0.6, 1.6, 64, 1), []);
  const sand = useMemo(() => {
    const g = new CylinderGeometry(SAND_RADIUS, SAND_RADIUS + 2.4, 1.2, 64, 1);
    const pos = g.attributes.position;
    const r = seeded(9);
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setX(i, pos.getX(i) * (1 + (r() - 0.5) * 0.03));
    g.computeVertexNormals();
    return g;
  }, []);
  const mats = useMemo(
    () => [
      new MeshLambertMaterial({ flatShading: true }), // side: soil
      new MeshLambertMaterial({ flatShading: true }), // top: grass
      new MeshLambertMaterial({ flatShading: true }), // bottom
    ],
    [],
  );
  mats[0].color.set(dark ? '#5a4640' : '#b98b6c');
  mats[1].color.set(dark ? '#4f7553' : '#a5d68f');
  mats[2].color.set(dark ? '#5a4640' : '#b98b6c');

  return (
    <group>
      <mesh geometry={top} material={mats} position-y={-0.8} receiveShadow raycast={noRaycast} />
      <mesh geometry={sand} position-y={-1.0} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#8f8270' : '#f3dfb5'} flatShading />
      </mesh>
      <GrassPatches dark={dark} />
    </group>
  );
}

function GrassPatches({ dark }: { dark: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new CircleGeometry(1, 7).rotateX(-Math.PI / 2), []);
  const patches = useMemo(() => {
    const r = seeded(13);
    // Softer, fewer patches, only on open lawn (never across paths, roads or plots).
    const out = Array.from({ length: 90 }, () => {
      const a = r() * Math.PI * 2;
      const rad = 10 + Math.sqrt(r()) * (ISLAND_RADIUS - 13);
      return { x: Math.cos(a) * rad, z: Math.sin(a) * rad, s: 1.0 + r() * 1.8, sx: 0.6 + r() * 0.8, rot: r() * 6, tone: r() };
    });
    return out.filter((p) => [0, 1, 2, 3, 4, 5, 6].every((k) => {
      const a = (k / 6) * Math.PI * 2;
      return k === 6 ? openGround(p.x, p.z, 0) : openGround(p.x + Math.cos(a) * p.s, p.z + Math.sin(a) * p.s, 0.15);
    })).slice(0, 45);
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    patches.forEach((p, i) => {
      _q.setFromAxisAngle(UP, p.rot);
      _p.set(p.x, 0.012, p.z);
      _s.set(p.s, 1, p.s * p.sx);
      m.setMatrixAt(i, _m.compose(_p, _q, _s));
      _c.set(p.tone < 0.5 ? '#9dcf86' : '#b2db96');
      if (dark) _c.multiplyScalar(0.6);
      m.setColorAt(i, _c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [patches, dark]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, patches.length]} receiveShadow raycast={noRaycast}>
      <meshLambertMaterial polygonOffset polygonOffsetFactor={-1} />
    </instancedMesh>
  );
}

/** Ring road, its sidewalks, lane markings and street lamps (the spokes inside it are park paths now). */
export function Roads({ districts, dark }: { districts: District[]; dark: boolean }) {
  const asphalt = dark ? '#3a3848' : '#9894a6';
  const curb = dark ? '#6d6880' : '#f1ebf3';
  return (
    <group>
      {/* sidewalks + asphalt */}
      <mesh position-y={0.035} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <ringGeometry args={[ROAD_INNER - 0.7, ROAD_OUTER + 0.7, 96]} />
        <meshLambertMaterial color={curb} />
      </mesh>
      <mesh position-y={0.05} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <ringGeometry args={[ROAD_INNER, ROAD_OUTER, 96]} />
        <meshLambertMaterial color={asphalt} />
      </mesh>
      <LaneMarks districts={districts} dark={dark} />
      <StreetLamps dark={dark} />
    </group>
  );
}

function LaneMarks({ districts, dark }: { districts: District[]; dark: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new BoxGeometry(1, 0.02, 0.12), []);
  const marks = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    const n = 84;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * ROAD_MID;
      const z = Math.sin(a) * ROAD_MID;
      // Leave the zebra crossings clear.
      if (districts.some((d) => Math.hypot(x - Math.cos(d.angle) * ROAD_MID, z - Math.sin(d.angle) * ROAD_MID) < 2.2)) continue;
      out.push({ x, z, rot: -a - Math.PI / 2 });
    }
    return out;
  }, [districts]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    marks.forEach((k, i) => {
      _q.setFromAxisAngle(UP, k.rot);
      _p.set(k.x, 0.065, k.z);
      _s.set(0.7, 1, 1);
      m.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    m.count = marks.length;
    m.instanceMatrix.needsUpdate = true;
  }, [marks]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, 200]} raycast={noRaycast}>
      <meshLambertMaterial color={dark ? '#c9c3a2' : '#fffaf0'} />
    </instancedMesh>
  );
}

const LAMPS = 28;

function StreetLamps({ dark }: { dark: boolean }) {
  const poles = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const poleGeo = useMemo(() => new CylinderGeometry(0.05, 0.07, 1.8, 5).translate(0, 0.9, 0), []);
  const headGeo = useMemo(() => new IcosahedronGeometry(0.17, 0).translate(0, 1.88, 0), []);
  const headMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), []);
  headMat.color.set(dark ? '#ffd68a' : '#fff6dc');
  useLayoutEffect(() => {
    for (const m of [poles.current, heads.current]) {
      if (!m) continue;
      for (let i = 0; i < LAMPS * 2; i++) {
        const outer = i >= LAMPS;
        const a = (((i % LAMPS) + 0.5) / LAMPS) * Math.PI * 2;
        // Back edge of the sidewalk, leaving its middle to pedestrians.
        const r = outer ? ROAD_OUTER + 0.6 : ROAD_INNER - 0.6;
        _p.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
        m.setMatrixAt(i, _m.compose(_p, _q.identity(), _s.set(1, 1, 1)));
      }
      m.instanceMatrix.needsUpdate = true;
    }
  }, []);
  return (
    <group>
      <instancedMesh ref={poles} args={[poleGeo, undefined, LAMPS * 2]} raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#8c87a0' : '#6b6578'} flatShading />
      </instancedMesh>
      <instancedMesh ref={heads} args={[headGeo, headMat, LAMPS * 2]} raycast={noRaycast} />
    </group>
  );
}

/** Paved central plaza with patterned rings and flower planters around the index tower. */
export function Plaza({ dark }: { dark: boolean }) {
  return (
    <group>
      <mesh position-y={0.04} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <circleGeometry args={[PLAZA_RADIUS + 0.5, 48]} />
        <meshLambertMaterial color={dark ? '#6d6880' : '#e6dccf'} />
      </mesh>
      <mesh position-y={0.05} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <circleGeometry args={[PLAZA_RADIUS, 48]} />
        <meshLambertMaterial color={dark ? '#7b7690' : '#f4eee4'} />
      </mesh>
      {[5.9, 7.4].map((r) => (
        <mesh key={r} position-y={0.056} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
          <ringGeometry args={[r, r + 0.18, 48]} />
          <meshLambertMaterial color={dark ? '#625d74' : '#ddd1c2'} />
        </mesh>
      ))}
      <Planters dark={dark} />
    </group>
  );
}

function Planters({ dark }: { dark: boolean }) {
  const boxes = useRef<InstancedMesh>(null);
  const flowers = useRef<InstancedMesh>(null);
  const boxGeo = useMemo(() => new CylinderGeometry(0.75, 0.8, 0.45, 8).translate(0, 0.27, 0), []);
  const flowerGeo = useMemo(() => new IcosahedronGeometry(0.2, 0), []);
  const N = 8;
  const PER = 5;
  useLayoutEffect(() => {
    const b = boxes.current;
    const f = flowers.current;
    if (!b || !f) return;
    const palette = ['#ff8fb1', '#ffd36e', '#b9a8ec', '#ff9f7a', '#fff3f7'];
    for (let i = 0; i < N; i++) {
      const a = ((i + 0.5) / N) * Math.PI * 2;
      const x = Math.cos(a) * 5.55;
      const z = Math.sin(a) * 5.55;
      b.setMatrixAt(i, _m.compose(_p.set(x, 0, z), _q.identity(), _s.set(1, 1, 1)));
      for (let k = 0; k < PER; k++) {
        const fa = (k / PER) * Math.PI * 2 + i;
        _p.set(x + Math.cos(fa) * 0.42, 0.6 + (k % 2) * 0.08, z + Math.sin(fa) * 0.42);
        f.setMatrixAt(i * PER + k, _m.compose(_p, _q, _s.setScalar(0.9 + (k % 3) * 0.2)));
        _c.set(palette[(i + k) % palette.length]);
        if (dark) _c.multiplyScalar(0.75);
        f.setColorAt(i * PER + k, _c);
      }
    }
    for (const m of [b, f]) m.instanceMatrix.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  }, [dark]);
  return (
    <group>
      <instancedMesh ref={boxes} args={[boxGeo, undefined, N]} receiveShadow raycast={noRaycast}>
        <meshLambertMaterial color={dark ? '#8a7f8f' : '#e8d6c4'} flatShading />
      </instancedMesh>
      <instancedMesh ref={flowers} args={[flowerGeo, undefined, N * PER]} raycast={noRaycast}>
        <meshLambertMaterial flatShading />
      </instancedMesh>
    </group>
  );
}

/** Low shrubs dotted around the open land. */
export function Bushes({ bushes, dark }: { bushes: CityLayout['bushes']; dark: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new IcosahedronGeometry(1, 0).scale(1, 0.7, 1), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    bushes.forEach((b, i) => {
      _q.setFromAxisAngle(UP, b.x * 2.3);
      m.setMatrixAt(i, _m.compose(_p.set(b.x, b.s * 0.45, b.z), _q, _s.setScalar(b.s)));
      _c.set(i % 4 === 0 ? '#6fae78' : i % 4 === 1 ? '#86c07a' : i % 4 === 2 ? '#79b58c' : '#e79ab4');
      if (dark) _c.multiplyScalar(0.6);
      m.setColorAt(i, _c);
    });
    m.count = bushes.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [bushes, dark]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, 200]} raycast={noRaycast}>
      <meshLambertMaterial flatShading />
    </instancedMesh>
  );
}

