import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  LineBasicMaterial,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Texture } from 'three';
import type { SectorId } from '../engine/types';
import { pct } from '../lib/format';
import { merge, part } from './geom';
import { SECTOR_BASE, SECTOR_GLOW, SECTOR_ROOF, SECTOR_STYLE, TURBINE_HUB, TURBINE_ROTOR } from './sectorStyle';
import type { SectorStyle } from './sectorStyle';
import { FLOOR_H, MAX_FLOORS, PLAYER_COLOR } from './visuals';

/** Height of the lot pads the buildings stand on (see World.tsx). */
const BASE_Y = 0.28;

/**
 * One window bay: glass with a soft vertical reflection gradient, transparent mullions either side.
 * Repeated along each floor's window band so the band reads as individual windows.
 */
const WINDOW_TEXTURE: Texture | null = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#e9e9e9');
  grad.addColorStop(1, '#c9c9c9');
  g.fillStyle = grad;
  g.fillRect(5, 0, 22, 32);
  // A thin glint line across the upper pane.
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(5, 6, 22, 2);
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
})();

// Shared, pre-merged detail geometry: colours live in vertex colours so each part is a single draw call.
const PAINTED_MAT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, flatShading: true });
/** Signs and lights: unlit so they glow (and bloom) at night. */
const GLOW_MAT = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });

const LOBBY_GEO = merge([
  part(new BoxGeometry(1.22, 0.12, 1.26), 0, 0.06, 0, '#e7e1ea'),
  part(new BoxGeometry(1.02, FLOOR_H * 0.7, 1.03), 0, FLOOR_H * 0.45, 0, '#3e4a66'),
  part(new BoxGeometry(0.45, 0.06, 0.22), 0, FLOOR_H * 0.86, 0.6, '#e7e1ea'),
  // Entrance: door frame, revolving door and front steps.
  part(new BoxGeometry(0.34, FLOOR_H * 0.62, 0.03), 0, 0.12 + FLOOR_H * 0.31, 0.525, '#e7e1ea'),
  part(new BoxGeometry(0.26, FLOOR_H * 0.54, 0.035), 0, 0.12 + FLOOR_H * 0.27, 0.53, '#7fa6c9'),
  part(new BoxGeometry(0.5, 0.05, 0.1), 0, 0.025, 0.66, '#d9d2dc'),
  // Corner pilasters frame the lobby glass.
  ...[-0.5, 0.5].flatMap((x) => [-0.505, 0.505].map((z) => part(new BoxGeometry(0.07, FLOOR_H * 0.7, 0.07), x, 0.12 + FLOOR_H * 0.35, z, '#e7e1ea'))),
]);
/** Roof slab with a low parapet, tinted like the building. */
const CAP_GEO = merge([
  part(new BoxGeometry(1.08, 0.2, 1.08), 0, 0.1, 0),
  part(new BoxGeometry(1.1, 0.12, 0.05), 0, 0.26, 0.525),
  part(new BoxGeometry(1.1, 0.12, 0.05), 0, 0.26, -0.525),
  part(new BoxGeometry(0.05, 0.12, 1.0), 0.525, 0.26, 0),
  part(new BoxGeometry(0.05, 0.12, 1.0), -0.525, 0.26, 0),
]);

export const UNIT_BOX = new BoxGeometry(1, 1, 1);
const FLASH_UP = '#9dffcf';
const FLASH_DOWN = '#ff6b7d';
const UNIT_EDGES = new EdgesGeometry(UNIT_BOX);
const FRAME_MATERIAL = new LineBasicMaterial({ color: '#ef3b3b', transparent: true, depthTest: false });

/** Unit scaffold: four poles plus horizontal rings, scaled to fit a building. */
const SCAFFOLD_GEOMETRY = (() => {
  const g = new BufferGeometry();
  const p: number[] = [];
  const c = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  for (const [x, z] of c) p.push(x, 0, z, x, 1, z);
  for (let y = 0; y <= 1.0001; y += 0.125) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = c[i];
      const [x2, z2] = c[(i + 1) % 4];
      p.push(x1, y, z1, x2, y, z2);
    }
  }
  // Diagonal braces on two faces.
  for (let y = 0; y < 1; y += 0.25) p.push(-0.5, y, -0.5, 0.5, y + 0.25, -0.5, 0.5, y, 0.5, -0.5, y + 0.25, 0.5);
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  return g;
})();

export interface BuildingProps {
  id: string;
  x: number;
  z: number;
  /** Yaw of the plot: the lobby faces the city centre. */
  rot: number;
  height: number;
  width: number;
  body: string;
  windows: string;
  owned: boolean;
  scaffold: boolean;
  selected: boolean;
  hovered: boolean;
  /** Tutorial highlight (red frame). */
  highlighted?: boolean;
  /** Sway amplitude in radians (concentrated, volatile positions). */
  sway?: number;
  label: string;
  change: number;
  /** Business sector: picks the architecture (shape, windows, rooftop and ground details). */
  sector: SectorId;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

// Scratch objects reused by every building — no per-frame allocations.
const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();

function Building(props: BuildingProps) {
  const { id, x, z, rot, height, width, body, windows, owned, scaffold, selected, hovered, highlighted, label, change, sector, sway = 0 } = props;
  const rootRef = useRef<Group>(null);
  const floorsRef = useRef<InstancedMesh>(null);
  const windowsRef = useRef<InstancedMesh>(null);
  const ledgesRef = useRef<InstancedMesh>(null);
  const lobbyRef = useRef<Group>(null);
  const roofRef = useRef<Group>(null);
  const hitRef = useRef<Mesh>(null);
  const scaffoldRef = useRef<LineSegments>(null);
  const ringRef = useRef<Mesh>(null);
  const flagRef = useRef<Group>(null);
  const labelRef = useRef<Group>(null);
  const frameRef = useRef<LineSegments>(null);
  const hintRef = useRef<Group>(null);

  const state = useRef({ h: 0.01, w: width, dirty: true });
  const target = useRef({ h: height, w: width, body: new Color(body), win: new Color(windows) });
  target.current.h = height;
  target.current.w = width;
  target.current.body.set(body);
  target.current.win.set(windows);
  // Re-apply transforms after any prop change (new day, ownership, selection...).
  state.current.dirty = true;

  // Flash the windows when the price jumps or drops ≥5% in a day.
  const flash = useRef({ amount: 0, last: change, color: new Color() });
  if (change !== flash.current.last) {
    flash.current.last = change;
    if (Math.abs(change) >= 0.05) {
      flash.current.amount = 1;
      flash.current.color.set(change > 0 ? FLASH_UP : FLASH_DOWN);
    }
  }

  const look = SECTOR_STYLE[sector];
  const bodyMat = useMemo(() => new MeshStandardMaterial({ color: body, flatShading: true, roughness: look.roughness, metalness: look.metalness }), []);
  const winMat = useMemo(() => {
    const map = WINDOW_TEXTURE?.clone() ?? null;
    return new MeshBasicMaterial({ color: windows, toneMapped: false, map, alphaTest: 0.5 });
  }, []);
  // Small buildings stay simple slabs; taller ones get their sector's silhouette.
  const profileKind = height > 7 ? look.profile : 1;
  const rotorRef = useRef<Group>(null);
  const roofMat = useMemo(() => new MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 }), []);

  useLayoutEffect(() => () => {
    bodyMat.dispose();
    winMat.map?.dispose();
    winMat.dispose();
    roofMat.dispose();
  }, [bodyMat, winMat, roofMat]);

  useFrame((frame, dt) => {
    const s = state.current;
    const t = target.current;
    const k = Math.min(1, dt * 3.5);
    if (Math.abs(t.h - s.h) > 0.002 || Math.abs(t.w - s.w) > 0.002) {
      s.h += (t.h - s.h) * k;
      s.w += (t.w - s.w) * k;
      s.dirty = true;
    }
    bodyMat.color.lerp(t.body, k);
    winMat.color.lerp(t.win, k);
    const fl = flash.current;
    if (fl.amount > 0) {
      // Blink a few times while fading out.
      winMat.color.lerp(fl.color, fl.amount * (0.5 + 0.5 * Math.sin(frame.clock.elapsedTime * 22)));
      fl.amount = Math.max(0, fl.amount - dt * 0.9);
    }
    roofMat.color.copy(bodyMat.color).multiplyScalar(0.82);

    if (s.dirty) {
      s.dirty = false;
      const top = layoutFloors(floorsRef.current!, windowsRef.current!, ledgesRef.current!, s.h, s.w, profileKind, look);
      if (winMat.map) winMat.map.repeat.x = Math.max(2, Math.round(s.w / look.bay));
      roofRef.current!.position.y = s.h;
      roofRef.current!.scale.set(s.w * top, 1, s.w * 0.85 * top);
      // The rotor lives in roof space but must keep its true shape while it spins.
      rotorRef.current?.scale.set(1 / (s.w * top), 1, 1 / (s.w * 0.85 * top));
      lobbyRef.current!.scale.set(s.w, 1, s.w * 0.85);
      hitRef.current!.scale.set(s.w + 0.3, s.h + 0.6, s.w * 0.85 + 0.3);
      hitRef.current!.position.y = (s.h + 0.6) / 2;
      if (scaffoldRef.current) scaffoldRef.current.scale.set(s.w + 0.4, s.h * 0.72, s.w * 0.85 + 0.4);
      if (labelRef.current) labelRef.current.position.y = s.h + 2.6;
      if (frameRef.current) {
        frameRef.current.scale.set(s.w + 0.7, s.h + 1.2, s.w * 0.85 + 0.7);
        frameRef.current.position.y = (s.h + 1.2) / 2;
      }
      if (hintRef.current) hintRef.current.position.y = s.h + 4.2;
    }
    if (ringRef.current) {
      const pulse = 1 + Math.sin(frame.clock.elapsedTime * 3) * 0.06;
      ringRef.current.scale.setScalar((s.w * 0.75 + 1.4) * pulse);
    }
    if (rootRef.current) rootRef.current.rotation.z = sway > 0 ? Math.sin(frame.clock.elapsedTime * 1.4 + x) * sway : 0;
    if (frameRef.current) FRAME_MATERIAL.opacity = 0.55 + Math.sin(frame.clock.elapsedTime * 6) * 0.45;
    if (rotorRef.current) rotorRef.current.rotation.z -= dt * 2.2;
    if (flagRef.current) {
      flagRef.current.position.y = s.h;
      flagRef.current.rotation.y = Math.sin(frame.clock.elapsedTime * 1.7 + x) * 0.25;
    }
  });

  return (
    <group ref={rootRef} position={[x, BASE_Y, z]} rotation-y={rot}>
      <instancedMesh
        ref={floorsRef}
        args={[UNIT_BOX, bodyMat, MAX_FLOORS]}
        castShadow
        receiveShadow
        frustumCulled={false}
        raycast={noRaycast}
      />
      <instancedMesh ref={windowsRef} args={[UNIT_BOX, winMat, MAX_FLOORS]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={ledgesRef} args={[UNIT_BOX, roofMat, MAX_FLOORS]} frustumCulled={false} raycast={noRaycast} />
      <group ref={lobbyRef}>
        <Lobby sector={sector} />
      </group>
      <group ref={roofRef}>
        <Roof sector={sector} material={roofMat} />
        {sector === 'energy' && (
          <group ref={rotorRef} position={[TURBINE_HUB.x, TURBINE_HUB.y, TURBINE_HUB.z]}>
            <mesh geometry={TURBINE_ROTOR} material={PAINTED_MAT} raycast={noRaycast} />
          </group>
        )}
      </group>
      {scaffold && (
        <lineSegments ref={scaffoldRef} geometry={SCAFFOLD_GEOMETRY} raycast={noRaycast}>
          <lineBasicMaterial color="#c47f3e" />
        </lineSegments>
      )}
      {owned && (
        <group ref={flagRef}>
          <mesh position={[0, 1.1, 0]} geometry={UNIT_BOX} scale={[0.07, 2.2, 0.07]} raycast={noRaycast}>
            <meshStandardMaterial color="#f5f1ea" />
          </mesh>
          <mesh position={[0.42, 1.95, 0]} geometry={UNIT_BOX} scale={[0.8, 0.48, 0.04]} raycast={noRaycast}>
            <meshStandardMaterial color={PLAYER_COLOR} emissive={PLAYER_COLOR} emissiveIntensity={0.35} flatShading />
          </mesh>
        </group>
      )}
      {(selected || hovered || highlighted) && (
        <mesh ref={ringRef} rotation-x={-Math.PI / 2} position-y={0.06} raycast={noRaycast}>
          <ringGeometry args={[highlighted && !selected ? 0.82 : 0.92, 1, 40]} />
          <meshBasicMaterial
            color={selected ? PLAYER_COLOR : highlighted ? '#ef3b3b' : '#ffffff'}
            transparent
            opacity={selected || highlighted ? 0.95 : 0.6}
          />
        </mesh>
      )}
      {highlighted && !selected && (
        <>
          <lineSegments ref={frameRef} geometry={UNIT_EDGES} material={FRAME_MATERIAL} raycast={noRaycast} renderOrder={10} />
          <group ref={hintRef} position-y={height + 4.2}>
            <Html center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
              <div className="tutorial-hint">👇 คลิกที่นี่</div>
            </Html>
          </group>
        </>
      )}
      {(selected || hovered) && (
        <group ref={labelRef} position-y={height + 2.6}>
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="building-label">
              <span className="font-semibold">{label}</span>
              <span className={change >= 0 ? 'text-up' : 'text-down'}>{pct(change)}</span>
            </div>
          </Html>
        </group>
      )}
      <mesh
        ref={hitRef}
        geometry={UNIT_BOX}
        onClick={(e) => {
          e.stopPropagation();
          props.onSelect(id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          props.onHover(id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          props.onHover(null);
          document.body.style.cursor = '';
        }}
      >
        {/* Invisible material: never drawn, but still hit by raycasts. */}
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

function noRaycast() {
  /* decorative meshes are not clickable */
}

/** Width multiplier for floor fraction f (0 = ground, 1 = top) per silhouette. */
function profile(kind: number, f: number): number {
  if (kind === 0) return f < 0.5 ? 1 : f < 0.78 ? 0.84 : 0.68; // setback tower
  if (kind === 2) return 1 - 0.24 * f; // tapering tower
  return 1; // straight slab
}

/** Lays out floor boxes, window bands and cornices/balconies; returns the top floor's width multiplier. */
function layoutFloors(floors: InstancedMesh, windows: InstancedMesh, ledges: InstancedMesh, h: number, w: number, kind: number, look: SectorStyle): number {
  const d = w * 0.85;
  const full = Math.min(MAX_FLOORS - 1, Math.floor(h / FLOOR_H));
  const rem = h - full * FLOOR_H;
  const frac = (i: number) => (full > 1 ? i / (full - 1) : 0);
  _q.identity();
  let n = 0;
  let nw = 0;
  let nl = 0;
  let k = 1;
  for (let i = 0; i < full; i++) {
    const y0 = i * FLOOR_H;
    k = profile(kind, frac(i));
    _p.set(0, y0 + FLOOR_H / 2, 0);
    _s.set(w * k, FLOOR_H, d * k);
    floors.setMatrixAt(n++, _m.compose(_p, _q, _s));
    if (i > 0) {
      _p.set(0, y0 + FLOOR_H * (0.08 + look.band / 2), 0);
      _s.set(w * k + 0.06, FLOOR_H * look.band, d * k + 0.06);
      windows.setMatrixAt(nw++, _m.compose(_p, _q, _s));
    }
    // Cornices (or balconies, for frequent ones) and a ledge wherever the profile steps in.
    if (i > 0 && i < full - 1 && (i % look.ledgeEvery === look.ledgeEvery - 1 || profile(kind, frac(i + 1)) < k - 0.05)) {
      _p.set(0, y0 + FLOOR_H, 0);
      _s.set(w * k + look.ledgeOut, 0.07, d * k + look.ledgeOut);
      ledges.setMatrixAt(nl++, _m.compose(_p, _q, _s));
    }
  }
  if (rem > 0.01) {
    _p.set(0, full * FLOOR_H + rem / 2, 0);
    _s.set(w * k, rem, d * k);
    floors.setMatrixAt(n++, _m.compose(_p, _q, _s));
  }
  floors.count = n;
  windows.count = nw;
  ledges.count = nl;
  floors.instanceMatrix.needsUpdate = true;
  windows.instanceMatrix.needsUpdate = true;
  ledges.instanceMatrix.needsUpdate = true;
  return k;
}

/** Ground floor in unit footprint space: plinth, glass lobby, canopy, plus the sector's street-level signature. */
function Lobby({ sector }: { sector: SectorId }) {
  const base = SECTOR_BASE[sector];
  return (
    <>
      <mesh geometry={LOBBY_GEO} material={PAINTED_MAT} receiveShadow raycast={noRaycast} />
      {base && <mesh geometry={base} material={PAINTED_MAT} castShadow raycast={noRaycast} />}
    </>
  );
}

/** Roof in unit footprint space (scaled by the top floor's footprint): slab, sector rooftop details and signs. */
function Roof({ sector, material }: { sector: SectorId; material: MeshStandardMaterial }) {
  const glow = SECTOR_GLOW[sector];
  return (
    <>
      <mesh geometry={CAP_GEO} material={material} castShadow raycast={noRaycast} />
      <mesh geometry={SECTOR_ROOF[sector]} material={PAINTED_MAT} castShadow raycast={noRaycast} />
      {glow && <mesh geometry={glow} material={GLOW_MAT} raycast={noRaycast} />}
    </>
  );
}

export default memo(Building);
