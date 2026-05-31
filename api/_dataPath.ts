/**
 * _dataPath.ts — serverless-safe data file resolver.
 *
 * On Vercel, the function bundle may land in a different directory than the
 * project root. vercel.json includeFiles bundles public/data/** alongside the
 * function, so the file may appear at multiple candidate locations.
 *
 * Tries candidates in order and returns the first that exists.
 * Falls back to the process.cwd() path (throws at runtime if still missing,
 * which produces a readable error vs. a silent wrong path).
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

/**
 * Returns the absolute path to a file under public/data/.
 * Tries multiple candidate locations in order:
 *   1. process.cwd()/public/data/<name>
 *   2. __dirname/../public/data/<name>   (api/.. = repo root)
 *   3. __dirname/public/data/<name>      (if bundled next to function dir)
 *
 * @param name - filename only, e.g. "dimensions.json" or "facts.parquet"
 */
export function dataFile(name: string): string {
  const candidates = [
    join(process.cwd(), 'public', 'data', name),
    join(__dirname, '..', 'public', 'data', name),
    join(__dirname, 'public', 'data', name),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Return the most-likely path so the error message is useful
  return candidates[1];
}
