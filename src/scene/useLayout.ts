import type { Company, Run } from '../engine/types';
import { buildLayout } from './layout';
import type { CityLayout } from './layout';

let cache: { runId: string; layout: CityLayout } | null = null;

/** City layout for a run (deterministic, cached). Shared by the 3D scene and the minimap. */
export function getLayout(run: Run, companies: readonly Company[]): CityLayout {
  if (cache?.runId !== run.id) cache = { runId: run.id, layout: buildLayout(companies, run.seed) };
  return cache.layout;
}
