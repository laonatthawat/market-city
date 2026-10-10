import { useSyncExternalStore } from 'react';

/**
 * Optional .glb overrides for civic buildings (e.g. CC0 Kenney models).
 * Drop files into public/models/ and list them in public/models/manifest.json:
 *   { "library": "library.glb", "statue": "statue.glb" }
 * Kinds without an entry keep using the built-in low-poly primitives.
 */
let overrides: Record<string, string> = {};
const listeners = new Set<() => void>();

export async function loadModelOverrides(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}models/manifest.json`);
    if (!res.ok) return;
    const json = (await res.json()) as Record<string, string>;
    overrides = Object.fromEntries(Object.entries(json).map(([k, v]) => [k, `${import.meta.env.BASE_URL}models/${v}`]));
    listeners.forEach((l) => l());
  } catch {
    // No manifest (or the dev server answered with index.html): keep primitives.
  }
}

export function useModelOverride(kind: string): string | undefined {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => overrides[kind],
  );
}
