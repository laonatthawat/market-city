import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, Color, Fog, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import type { Weather as WeatherKind } from '../engine/weather';
import { sfx } from '../lib/sound';
import { useGame } from '../store/gameStore';

/** Shared, mutable lighting multipliers read by <Lights> every frame. */
export const weatherFx = { sun: 1, hemi: 1, flash: 0, warm: 0 };
/** Sky gradient colours (horizon also drives fog), read by the sky dome and the ocean. */
export const skyFx = { horizon: new Color('#f7e8dc'), top: new Color('#a9d4f0'), rain: 0 };
let lastThunder = 0;

interface Look {
  /** [light, dark] horizon colours. */
  sky: [string, string];
  /** [light, dark] zenith colours. */
  top: [string, string];
  near: number;
  far: number;
  sun: number;
  hemi: number;
  rain: number;
  warm: number;
}

const LOOKS: Record<WeatherKind, Look> = {
  sunny: { sky: ['#fbe7d6', '#262a48'], top: ['#9fd0f2', '#0b0e22'], near: 150, far: 340, sun: 1, hemi: 1, rain: 0, warm: 0 },
  cloudy: { sky: ['#e9e4e8', '#23263a'], top: ['#c3d2e2', '#11142a'], near: 130, far: 320, sun: 0.72, hemi: 0.95, rain: 0, warm: 0 },
  rain: { sky: ['#c4cad6', '#181c2c'], top: ['#8e9bb2', '#0a0d18'], near: 90, far: 260, sun: 0.45, hemi: 0.85, rain: 0.55, warm: 0 },
  storm: { sky: ['#99a0b2', '#10121d'], top: ['#5f6679', '#05060c'], near: 70, far: 220, sun: 0.3, hemi: 0.75, rain: 1, warm: 0 },
  fog: { sky: ['#e6e3df', '#2a2c3a'], top: ['#d9dbe0', '#1c1e2b'], near: 30, far: 140, sun: 0.6, hemi: 1.05, rain: 0, warm: 0 },
  golden: { sky: ['#ffdca6', '#3a2a3e'], top: ['#f5b48c', '#1b1430'], near: 140, far: 330, sun: 1.15, hemi: 1.05, rain: 0, warm: 1 },
};

const DROPS = 900;
const AREA = 130;
const HEIGHT = 70;

/** Sky, fog, rain and lightning driven by market sentiment. */
export function WeatherFx() {
  const { scene } = useThree();
  const rainRef = useRef<InstancedMesh>(null);
  const target = useMemo(() => new Color(), []);
  const drops = useMemo(() => {
    const a = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) {
      a[i * 3] = (Math.random() - 0.5) * AREA;
      a[i * 3 + 1] = Math.random() * HEIGHT;
      a[i * 3 + 2] = (Math.random() - 0.5) * AREA;
    }
    return a;
  }, []);
  const geo = useMemo(() => new BoxGeometry(0.05, 1.4, 0.05), []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#a9bde3', transparent: true, opacity: 0, depthWrite: false }), []);
  const m = useMemo(() => new Matrix4(), []);
  const level = useRef({ rain: 0, near: 150, far: 340 });

  useFrame((_, dt) => {
    const s = useGame.getState();
    const look = LOOKS[s.phase === 'playing' || s.phase === 'ended' ? s.weather : 'sunny'];
    const dark = s.theme === 'dark';
    const k = Math.min(1, dt * 1.5);

    target.set(look.sky[dark ? 1 : 0]);
    if (scene.background instanceof Color) scene.background.lerp(target, k);
    skyFx.horizon.lerp(target, k);
    skyFx.top.lerp(target.set(look.top[dark ? 1 : 0]), k);
    target.set(look.sky[dark ? 1 : 0]);
    const lv = level.current;
    lv.near += (look.near - lv.near) * k;
    lv.far += (look.far - lv.far) * k;
    lv.rain += (look.rain - lv.rain) * k;
    skyFx.rain = lv.rain;
    if (scene.fog instanceof Fog) {
      scene.fog.color.lerp(target, k);
      scene.fog.near = lv.near;
      scene.fog.far = lv.far;
    }
    weatherFx.sun += (look.sun - weatherFx.sun) * k;
    weatherFx.hemi += (look.hemi - weatherFx.hemi) * k;
    weatherFx.warm += (look.warm - weatherFx.warm) * k;

    // Lightning: random flashes during storms.
    if (s.weather === 'storm' && Math.random() < dt * 0.35) {
      weatherFx.flash = 1;
      // Thunder at most every ~6 s so storms don't become noise.
      const now = performance.now();
      if (s.sound && now - lastThunder > 6000) {
        lastThunder = now;
        sfx.thunder();
      }
    }
    weatherFx.flash = Math.max(0, weatherFx.flash - dt * 3.5);

    const mesh = rainRef.current;
    if (!mesh) return;
    const count = Math.round(DROPS * lv.rain);
    mesh.count = count;
    mat.opacity = 0.25 + lv.rain * 0.35;
    if (count === 0) return;
    const fall = dt * (38 + lv.rain * 20);
    for (let i = 0; i < count; i++) {
      let y = drops[i * 3 + 1] - fall;
      if (y < 0) y += HEIGHT;
      drops[i * 3 + 1] = y;
      m.makeTranslation(drops[i * 3], y, drops[i * 3 + 2]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={rainRef} args={[geo, mat, DROPS]} frustumCulled={false} raycast={() => {}} />;
}
