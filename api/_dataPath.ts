import { existsSync } from 'fs';
import { join } from 'path';

// IMPORTANT: Vercel's CJS function wrapper already injects __dirname/__filename.
// Re-declaring them here ("const __filename = ...") throws
// "Identifier '__filename' has already been declared" at load and crashes
// EVERY function (FUNCTION_INVOCATION_FAILED). Resolve data files from
// process.cwd() instead — Vercel runs functions from the project root and
// vercel.json includeFiles bundles public/data/** there.
export function dataFile(name: string): string {
  const candidates = [
    join(process.cwd(), 'public', 'data', name),
    join(process.cwd(), name),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}
