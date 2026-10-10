import { useEffect, useRef } from 'react';
import { chapterById } from '../data/tutorials';
import { useGame } from '../store/gameStore';

/**
 * True while the current tutorial step points at this UI element.
 * Returns a ref that is scrolled into view when the element becomes the target.
 */
export function useTutorialTarget<T extends HTMLElement>(name: string) {
  const active = useGame((s) => {
    const t = s.tutorial;
    if (s.mode !== 'tutorial' || !t || s.flow !== 'normal') return false;
    return chapterById(t.chapterId)?.steps[t.step]?.ui?.includes(name) ?? false;
  });
  const ref = useRef<T>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active]);
  return { ref, active, className: active ? 'tutorial-target' : '' };
}
