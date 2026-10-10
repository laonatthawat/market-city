import { Html } from '@react-three/drei';
import { useMemo, useState } from 'react';
import { BoxGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry } from 'three';
import type { ReactNode } from 'react';
import { DECOS, meets } from '../data/unlocks';
import type { ProgressSnapshot } from '../data/unlocks';
import { pct } from '../lib/format';
import { useGame } from '../store/gameStore';
import { DecoMesh } from './Decorations';
import { Fountain } from './Fountain';
import { merge, part } from './geom';
import { BANK_SLOT, civicSlots } from './layout';

const SLOTS = civicSlots();
/** Remaining gaps, nearest to the home camera first. */
const CIVIC_ORDER = [2, 4, 1, 5, 0, 6];
const CIVIC_SCALE = 1.7;
/** The dividend garden is a park in its own right, so it gets a much bigger plot. */
const GARDEN_SCALE = 3.1;
/** Camera framing per civic building: [height, distance]. */
const CIVIC_VIEW: Record<string, [number, number]> = { garden: [2, 22], lighthouse: [9, 28], landmark: [10, 30], statue: [4.5, 20], library: [4.5, 22], observatory: [5, 22] };

/** Where a landmark ('bank' or a civic kind) stands, and roughly how tall it is, for the camera. */
export function landmarkSpot(id: string, progress: ProgressSnapshot): { x: number; z: number; h: number; dist: number } | null {
  if (id === 'bank') return { ...SLOTS[BANK_SLOT], h: 7, dist: 30 };
  if (id === 'index') return { x: 0, z: 0, h: 10, dist: 42 };
  const i = DECOS.filter((d) => meets(d.requires, progress)).findIndex((d) => d.kind === id);
  if (i < 0) return null;
  const slot = SLOTS[CIVIC_ORDER[i]];
  const [h, dist] = CIVIC_VIEW[id] ?? [5, 22];
  return { x: slot.x, z: slot.z, h, dist };
}

/** Reserve Bank plus every unlocked civic building, placed on the open plots between districts. */
export function Landmarks({ dark }: { dark: boolean }) {
  const view = useGame((s) => s.view);
  const day = useGame((s) => s.day);
  const portfolio = useGame((s) => s.portfolio);
  const chapters = useGame((s) => s.progress.chapters);
  const achievements = useGame((s) => s.achievements);
  const runs = useGame((s) => s.history.length);

  const { cashShare, dividendYield } = useMemo(() => {
    let invested = 0;
    let yieldSum = 0;
    if (view) {
      for (const h of Object.values(portfolio.holdings)) {
        const snap = view.snapshot(h.companyId);
        if (!snap) continue;
        const value = h.shares * snap.price;
        invested += value;
        yieldSum += value * (view.fundamentals(h.companyId)?.dividendYield ?? 0);
      }
    }
    const total = invested + portfolio.cash;
    return { cashShare: total > 0 ? portfolio.cash / total : 1, dividendYield: invested > 0 ? yieldSum / invested : 0 };
    // `day` moves prices even when the portfolio object is unchanged.
  }, [view, day, portfolio]);

  const landmark = useGame((s) => s.landmark);
  const selectLandmark = useGame((s) => s.selectLandmark);
  const progress = { chapters, achievements, runsPlayed: runs };
  const unlocked = DECOS.filter((d) => meets(d.requires, progress));
  const bank = SLOTS[BANK_SLOT];

  return (
    <group>
      <Clickable id="bank" x={bank.x} z={bank.z} radius={7.2} selected={landmark === 'bank'} onSelect={selectLandmark}>
        <ReserveBank x={0} z={0} cashShare={cashShare} dark={dark} onSelect={() => selectLandmark('bank')} />
      </Clickable>
      {unlocked.map((d, i) => {
        const slot = SLOTS[CIVIC_ORDER[i]];
        const garden = d.kind === 'garden';
        return (
          <Clickable key={d.kind} id={d.kind} x={slot.x} z={slot.z} radius={garden ? 5.6 : 3.3} selected={landmark === d.kind} onSelect={selectLandmark}>
            {/* Fronts face the home camera so the entrances read at a glance. */}
            <group>
              <group scale={garden ? GARDEN_SCALE : CIVIC_SCALE}>
                <DecoMesh kind={d.kind} bloom={Math.min(1, dividendYield / 0.03)} />
              </group>
              <Html position={[0, 0.4, garden ? 5.8 : 3.4]} center zIndexRange={[10, 0]}>
                <div className="building-label cursor-pointer hover:brightness-95" onClick={() => selectLandmark(d.kind)}>
                  {d.icon} {d.name}
                </div>
              </Html>
            </group>
          </Clickable>
        );
      })}
    </group>
  );
}

/** Click target around a landmark: pointer cursor, selection ring and an info card on click. */
export function Clickable(props: { id: string; x: number; z: number; radius: number; selected: boolean; onSelect: (id: string) => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <group
      position={[props.x, 0, props.z]}
      onClick={(e) => {
        e.stopPropagation();
        props.onSelect(props.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      {props.children}
      {/* Invisible, generous hit area so flat buildings (the garden) are easy to click. */}
      <mesh position-y={1.5}>
        <cylinderGeometry args={[props.radius, props.radius, 3, 16]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {(props.selected || hover) && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.08} raycast={() => {}}>
          <ringGeometry args={[props.radius - 0.35, props.radius, 48]} />
          <meshBasicMaterial color={props.selected ? '#ff4f8b' : '#ffffff'} transparent opacity={props.selected ? 0.95 : 0.6} />
        </mesh>
      )}
    </group>
  );
}


// --- Reserve Bank ------------------------------------------------------------
// Neoclassical bank, pre-merged by material (stone, walls, roof, gold, dark trim): a handful of draw calls.

function prism(w: number, h: number, d: number) {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  return new ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}

const COLUMN_X = [-3, -1.8, -0.6, 0.6, 1.8, 3];
const BANK = {
  stone: merge([
    // Three steps up to the portico.
    part(new BoxGeometry(9, 0.2, 6.6), 0, 0.1, 0.2),
    part(new BoxGeometry(8.4, 0.2, 6), 0, 0.3, 0.2),
    part(new BoxGeometry(7.8, 0.2, 5.4), 0, 0.5, 0.2),
    // Columns with bases and capitals.
    ...COLUMN_X.flatMap((x) => [
      part(new BoxGeometry(0.55, 0.16, 0.55), x, 0.68, 1.9),
      part(new CylinderGeometry(0.19, 0.22, 2.3, 10), x, 1.91, 1.9),
      part(new BoxGeometry(0.6, 0.16, 0.6), x, 3.14, 1.9),
    ]),
    // Entablature and the pediment over the portico.
    part(new BoxGeometry(7.4, 0.5, 4.8), 0, 3.47, 0.15),
    part(prism(7.4, 1.05, 0.5), 0, 3.72, 2.3),
    // Drum under the dome, with a ring of little pilasters.
    part(new CylinderGeometry(1.35, 1.4, 0.75, 16), 0, 4.95, -0.5),
    part(new CylinderGeometry(0.32, 0.32, 0.45, 8), 0, 6.95, -0.5),
  ]),
  walls: merge([
    part(new BoxGeometry(6.8, 2.62, 3.2), 0, 1.91, -0.55),
    // Side wings.
    part(new BoxGeometry(1.4, 2.0, 2.6), -4.1, 1.6, -0.6),
    part(new BoxGeometry(1.4, 2.0, 2.6), 4.1, 1.6, -0.6),
  ]),
  roof: merge([
    part(prism(7.4, 1.0, 4.3), 0, 3.72, -0.05),
    part(new BoxGeometry(1.6, 0.18, 2.8), -4.1, 2.69, -0.6),
    part(new BoxGeometry(1.6, 0.18, 2.8), 4.1, 2.69, -0.6),
  ]),
  gold: merge([
    part(new SphereGeometry(1.45, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), 0, 5.32, -0.5),
    part(new ConeGeometry(0.12, 0.7, 8), 0, 7.5, -0.5),
    part(new SphereGeometry(0.12, 8, 6), 0, 7.2, -0.5),
    // ฿ emblem: a gold medallion in the pediment.
    part(new CylinderGeometry(0.36, 0.36, 0.08, 18).rotateX(Math.PI / 2), 0, 4.08, 2.57),
    part(new BoxGeometry(7.42, 0.08, 0.06), 0, 3.24, 2.56),
  ]),
  dark: merge([
    // Doors and side windows.
    part(new BoxGeometry(1.1, 1.7, 0.06), 0, 1.45, 1.06),
    part(new BoxGeometry(0.6, 1.2, 0.06), -2.2, 1.6, 1.06),
    part(new BoxGeometry(0.6, 1.2, 0.06), 2.2, 1.6, 1.06),
    part(new BoxGeometry(0.06, 0.9, 0.6), -4.81, 1.6, -0.6),
    part(new BoxGeometry(0.06, 0.9, 0.6), 4.81, 1.6, -0.6),
  ]),
};

/** Paved forecourt with hedges, lamps and a fountain; not scaled with the bank. */
const PLAZA = {
  paving: merge([part(new CylinderGeometry(6.8, 7.0, 0.08, 40), 0, 0.04, 0.6), part(new BoxGeometry(2.6, 0.09, 2.6), 0, 0.045, 7.0)]),
  hedges: merge(
    Array.from({ length: 22 }, (_, i) => (i / 22) * Math.PI * 2)
      // Front half only (the back borders the districts), with a gap for the front walkway.
      .filter((a) => Math.sin(a) > -0.3 && Math.abs(Math.sin(a) - 1) > 0.08)
      .map((a) => part(new BoxGeometry(1.1, 0.6, 0.6).rotateY(-a + Math.PI / 2), Math.cos(a) * 6.35, 0.36, 0.6 + Math.sin(a) * 6.35)),
  ),
  lamps: merge([-3.4, 3.4].flatMap((x) => [part(new CylinderGeometry(0.06, 0.08, 2.2, 6), x, 1.1, 4.2), part(new BoxGeometry(0.35, 0.08, 0.35), x, 2.22, 4.2)])),
  lampHeads: merge([-3.4, 3.4].map((x) => part(new SphereGeometry(0.2, 8, 6), x, 2.45, 4.2))),
};

/** Cash reserve: a neoclassical bank whose size follows the cash share; the dome lights up with ≥10% cash. */
function ReserveBank({ x, z, cashShare, dark, onSelect }: { x: number; z: number; cashShare: number; dark: boolean; onSelect: () => void }) {
  const s = 0.62 + Math.min(1, cashShare) * 0.5;
  const glow = cashShare >= 0.1;
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={PLAZA.paving} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color={dark ? '#6d6880' : '#efe7da'} roughness={1} />
      </mesh>
      <mesh geometry={PLAZA.hedges} castShadow raycast={noRaycast}>
        <meshStandardMaterial color={dark ? '#3f6a4c' : '#6fae78'} flatShading roughness={0.9} />
      </mesh>
      <Fountain dark={dark} position={[0, 0.08, 5.0]} />
      <mesh geometry={PLAZA.lamps} raycast={noRaycast}>
        <meshStandardMaterial color={dark ? '#8c87a0' : '#5b5566'} flatShading />
      </mesh>
      <mesh geometry={PLAZA.lampHeads} raycast={noRaycast}>
        <meshBasicMaterial color={dark ? '#ffd68a' : '#fff6dc'} toneMapped={false} />
      </mesh>

      <group scale={s}>
        <mesh geometry={BANK.stone} castShadow receiveShadow raycast={noRaycast}>
          <meshStandardMaterial color={dark ? '#c4bed3' : '#f7f2ea'} flatShading roughness={0.85} />
        </mesh>
        <mesh geometry={BANK.walls} castShadow receiveShadow raycast={noRaycast}>
          <meshStandardMaterial color={dark ? '#a39cb8' : '#eadfce'} flatShading roughness={0.9} />
        </mesh>
        <mesh geometry={BANK.roof} castShadow raycast={noRaycast}>
          <meshStandardMaterial color={dark ? '#7b7091' : '#c7b3a0'} flatShading roughness={0.8} />
        </mesh>
        <mesh geometry={BANK.dark} raycast={noRaycast}>
          <meshStandardMaterial color={dark ? '#3a3448' : '#5a4e62'} flatShading />
        </mesh>
        <mesh geometry={BANK.gold} castShadow raycast={noRaycast}>
          <meshStandardMaterial
            color={glow ? '#ffd36e' : '#cfc6b6'}
            emissive={glow ? '#ffb84d' : '#000000'}
            emissiveIntensity={glow ? 0.55 : 0}
            metalness={glow ? 0.45 : 0.1}
            roughness={0.35}
            flatShading
          />
        </mesh>
      </group>
      <Html position={[0, 0.4, 7.4]} center zIndexRange={[10, 0]}>
        <div className="building-label cursor-pointer hover:brightness-95" onClick={onSelect}>
          🏦 ธนาคารสำรอง · เงินสด {pct(cashShare, 0, false)}
        </div>
      </Html>
    </group>
  );
}

const noRaycast = () => {};
