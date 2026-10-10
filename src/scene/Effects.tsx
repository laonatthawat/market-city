import { PerformanceMonitor } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, FXAA, Vignette } from '@react-three/postprocessing';
import { useEffect, useRef } from 'react';
import { UnsignedByteType } from 'three';
import { useGame } from '../store/gameStore';

/** Post-processing for the "high" graphics setting: window/sign bloom and a soft vignette. */
export function Effects({ dark }: { dark: boolean }) {
  return (
    // Tuned for integrated GPUs: 8-bit buffers, no MSAA (cheap FXAA instead), few bloom levels.
    // Tilt-shift was dropped: it cost ~10% of the frame for a blur many players found distracting.
    <EffectComposer multisampling={0} frameBufferType={UnsignedByteType}>
      <Bloom mipmapBlur levels={3} intensity={dark ? 0.9 : 0.3} luminanceThreshold={dark ? 0.5 : 0.85} luminanceSmoothing={0.25} />
      <Vignette offset={0.32} darkness={dark ? 0.5 : 0.3} />
      <FXAA />
    </EffectComposer>
  );
}

/** Drops to the light graphics mode once if the frame rate stays low during play. */
export function AutoQuality() {
  const playing = useGame((s) => s.phase === 'playing');
  const since = useRef(0);
  useEffect(() => {
    since.current = performance.now();
  }, [playing]);
  if (!playing) return null;
  return (
    <PerformanceMonitor
      // Fixed thresholds: the default ([60,100] on 120Hz+ screens) would flag a smooth 55 fps as "slow".
      bounds={() => [30, 45]}
      flipflops={1}
      onDecline={() => {
        const s = useGame.getState();
        // Ignore the first seconds (shader compilation, data loading) to avoid false alarms.
        if (s.graphics !== 'high' || performance.now() - since.current < 8000) return;
        s.setGraphics('low');
        s.showToast('เครื่องทำงานหนัก เลยลดคุณภาพกราฟิกให้อัตโนมัติ (เปลี่ยนกลับได้ที่ ⚙️)', 'info');
      }}
    />
  );
}

/** Pixels rendered per frame in high mode before the resolution is scaled down (≈ 1150×870). */
const PIXEL_BUDGET = 1.0e6;

/**
 * Keeps high mode smooth on big or high-DPI screens: the render resolution is capped to a pixel
 * budget, then stepped down (to 55% of the cap) while the frame rate is low and back up only after
 * a sustained stretch of headroom. Every change resizes the canvas and its post-processing buffers,
 * which itself causes a hitch, so changes are coarse and rare (no oscillating every few seconds).
 * UI stays sharp; only the 3D canvas is rendered at the lower resolution.
 */
export function AdaptiveResolution() {
  const { size, setDpr } = useThree();
  const scale = useRef(1);
  const frames = useRef({ n: 0, t: 0, good: 0, cooldown: 0 });
  const apply = () => {
    const native = Math.min(window.devicePixelRatio || 1, 1.5);
    const cap = Math.sqrt(PIXEL_BUDGET / Math.max(1, size.width * size.height));
    setDpr(Math.round(Math.max(0.5, Math.min(native, cap) * scale.current) * 20) / 20);
  };
  useEffect(apply, [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const f = frames.current;
    // Ignore hidden-tab gaps and the frame right after a resize.
    if (dt > 0.25) return;
    f.n++;
    f.t += dt;
    if (f.t < 2) return;
    const fps = f.n / f.t;
    f.n = 0;
    f.t = 0;
    if (f.cooldown > 0) {
      f.cooldown--;
      return;
    }
    let next = scale.current;
    if (fps < 40) {
      next = Math.max(0.55, scale.current - 0.15);
      f.good = 0;
    } else if (fps > 57) {
      // Step back up only after ~8 s of comfortable frame rate.
      if (++f.good >= 4) {
        next = Math.min(1, scale.current + 0.1);
        f.good = 0;
      }
    } else f.good = 0;
    if (next !== scale.current) {
      scale.current = next;
      f.cooldown = 2;
      apply();
    }
  });
  return null;
}
