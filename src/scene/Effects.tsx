import { PerformanceMonitor } from '@react-three/drei';
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
