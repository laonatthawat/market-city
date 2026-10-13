import { useSyncExternalStore } from 'react';
import type { Drawing } from './ChartDrawings';

/**
 * Lines the player draws on a company's chart, kept per run (keyed by the run's MarketView) so
 * they survive closing the panel or switching between the small and big chart, and vanish with
 * the run. x is the bar's index in the run's daily history.
 */
const byView = new WeakMap<object, Map<string, Drawing[]>>();
const listeners = new Set<() => void>();
const EMPTY: Drawing[] = [];

function get(view: object | null, id: string): Drawing[] {
  return (view && byView.get(view)?.get(id)) || EMPTY;
}

export function setDrawings(view: object, id: string, d: Drawing[]): void {
  let m = byView.get(view);
  if (!m) byView.set(view, (m = new Map()));
  m.set(id, d);
  listeners.forEach((l) => l());
}

export function useDrawings(view: object | null, id: string): Drawing[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => get(view, id),
  );
}
