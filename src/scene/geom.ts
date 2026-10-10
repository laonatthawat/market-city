import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Helpers for pre-merged, vertex-coloured detail meshes: many small parts become one draw call.
 * Every part is made non-indexed, without UVs, and (optionally) painted a flat colour.
 */
export function part(g: BufferGeometry, x: number, y: number, z: number, hex?: string): BufferGeometry {
  const out = (g.index ? g.toNonIndexed() : g).translate(x, y, z);
  out.deleteAttribute('uv');
  if (hex) {
    const c = new Color(hex);
    const a = new Float32Array(out.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i);
    out.setAttribute('color', new Float32BufferAttribute(a, 3));
  }
  return out;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  return mergeGeometries(parts)!;
}

/** An empty geometry (for sectors without a given detail). */
export const EMPTY = new BufferGeometry();
