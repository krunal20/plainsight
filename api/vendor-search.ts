/**
 * GET /api/vendor-search?q=<query>
 *
 * Loads vendors.json server-side and returns top matches via resolveVendor.
 * Returns: { matches: { vendorId: string; display: string; score?: number }[] }
 *
 * vendors.json is SERVER-ONLY — never imported on the client.
 */

import { dataFile } from './_dataPath';

// Re-use the pure resolveVendor from WS5 (no I/O, works in both environments)
export { resolveVendor } from '../src/lib/ai/resolveVendor';
import type { VendorMap } from '../src/lib/ai/resolveVendor';

// ---------------------------------------------------------------------------
// Core handler logic (testable without HTTP)
// ---------------------------------------------------------------------------

export interface VendorMatch {
  vendorId: string;
  display: string;
}

export interface VendorSearchResult {
  matches: VendorMatch[];
}

/**
 * Pure handler core — loads the vendor map and resolves the query.
 * Accepts an optional pre-loaded vendorMap (used in tests).
 */
export async function vendorSearchCore(
  q: string,
  vendorMapOverride?: VendorMap
): Promise<VendorSearchResult> {
  if (!q || !q.trim()) {
    return { matches: [] };
  }

  let vendorMap: VendorMap;

  if (vendorMapOverride) {
    vendorMap = vendorMapOverride;
  } else {
    try {
      const { readFileSync } = await import('fs');
      vendorMap = JSON.parse(readFileSync(dataFile('vendors.json'), 'utf8')) as VendorMap;
    } catch {
      return { matches: [] };
    }
  }

  const { resolveVendor } = await import('../src/lib/ai/resolveVendor');
  const resolved = resolveVendor(q.trim(), vendorMap);

  if (resolved.auto) {
    return {
      matches: [{ vendorId: resolved.auto.vendorId, display: resolved.auto.display }],
    };
  }

  const chips = resolved.chips ?? [];
  const matches: VendorMatch[] = chips
    .filter((c): c is { label: string; spec?: unknown } => Boolean(c.label))
    .map(c => {
      // Find the vendorId in the vendorMap by display name match
      const entry = (Object.values(vendorMap) as Array<{ vendorId: string; display: string }>).find(
        v => v.display === c.label
      );
      return entry
        ? { vendorId: entry.vendorId, display: entry.display }
        : { vendorId: c.label.toLowerCase().replace(/\s+/g, '-'), display: c.label };
    });

  return { matches };
}

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------

interface Req {
  method?: string;
  query?: Record<string, string | string[]>;
  url?: string;
}

interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

export default async function handler(req: Req, res: Res) {
  // CORS-safe GET handler
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const q = typeof req.query?.q === 'string' ? req.query.q : '';

  try {
    const result = await vendorSearchCore(q);
    res.status(200).json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
}
