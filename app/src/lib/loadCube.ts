/**
 * loadCube — fetches ./data/cube.json at runtime and caches the result.
 * DO NOT import cube.json into the bundle (~8.8MB).
 */
import type { Cube } from '../../contracts';

let cubePromise: Promise<Cube> | null = null;

export function loadCube(): Promise<Cube> {
  if (cubePromise) return cubePromise;

  cubePromise = fetch('./data/cube.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load cube.json: ${res.status} ${res.statusText}`);
      return res.json() as Promise<Cube>;
    })
    .catch(err => {
      // Reset so the next call retries
      cubePromise = null;
      throw err;
    });

  return cubePromise;
}

/** Load the dimensions index for slicer population. */
let dimensionsPromise: Promise<import('../../contracts').Dimensions> | null = null;

export function loadDimensions(): Promise<import('../../contracts').Dimensions> {
  if (dimensionsPromise) return dimensionsPromise;

  dimensionsPromise = fetch('./data/dimensions.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load dimensions.json: ${res.status}`);
      return res.json() as Promise<import('../../contracts').Dimensions>;
    })
    .catch(err => {
      dimensionsPromise = null;
      throw err;
    });

  return dimensionsPromise;
}
