import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useGame } from '../store/gameStore';

const COLORS = ['#ff4f8b', '#ffcf5a', '#7fd6a8', '#9fb8e8', '#b9a8ec', '#f3945a'];

interface Piece {
  left: number;
  delay: number;
  dur: number;
  color: string;
  size: number;
  drift: number;
  spin: number;
}

/** Celebration burst (milestones, achievements, chapter complete, beating the index). */
export function Confetti() {
  const tick = useGame((s) => s.celebrateTick);
  const [burst, setBurst] = useState<{ id: number; pieces: Piece[] } | null>(null);

  useEffect(() => {
    if (!tick) return;
    const pieces = Array.from({ length: 90 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      dur: 1.8 + Math.random() * 1.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 6,
      drift: (Math.random() - 0.5) * 160,
      spin: (Math.random() - 0.5) * 900,
    }));
    setBurst({ id: tick, pieces });
    const t = setTimeout(() => setBurst((b) => (b?.id === tick ? null : b)), 3600);
    return () => clearTimeout(t);
  }, [tick]);

  if (!burst) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden" aria-hidden>
      {burst.pieces.map((p, i) => (
        <i
          key={`${burst.id}-${i}`}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.45,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              '--drift': `${p.drift}px`,
              '--spin': `${p.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
