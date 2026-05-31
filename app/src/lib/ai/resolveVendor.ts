/**
 * T5.2 — resolveVendor(text, vendorMap): { auto?, chips? }
 *
 * Normalize input + fuzzy-rank against vendor map display + aliases.
 * Auto-resolve when top score ≥ 0.90 AND margin over #2 ≥ 0.15.
 * Else return up to 5 clarify chips.
 *
 * Uses token-sort ratio for fuzzy matching (like fuzzywuzzy's token_sort_ratio).
 * Pure function — no I/O.
 */

export interface VendorEntry {
  vendorId: string;
  display: string;
  aliases?: string[];
}

export type VendorMap = Record<string, VendorEntry>;

export interface ResolveVendorResult {
  auto?: { vendorId: string; display: string };
  chips?: { label: string; spec?: unknown }[];
}

// ---------------------------------------------------------------------------
// Levenshtein distance
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Use two-row rolling array for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Similarity ratio: 1 - normalized edit distance.
 * Range [0, 1] where 1 = identical.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Token sort ratio: sort tokens alphabetically before comparing.
 * This handles "Microsoft Corp" vs "Corp Microsoft" gracefully.
 */
function tokenSortRatio(a: string, b: string): number {
  const sortedA = a.toLowerCase().split(/\s+/).sort().join(' ').trim();
  const sortedB = b.toLowerCase().split(/\s+/).sort().join(' ').trim();
  return similarity(sortedA, sortedB);
}

/**
 * Best score of input against a vendor entry's display name and all aliases.
 */
function bestScore(input: string, entry: VendorEntry): number {
  const candidates = [
    entry.display,
    ...(entry.aliases ?? []),
  ];
  let best = 0;
  for (const candidate of candidates) {
    const score = tokenSortRatio(input, candidate);
    if (score > best) best = score;
  }
  return best;
}

// ---------------------------------------------------------------------------
// resolveVendor
// ---------------------------------------------------------------------------

export function resolveVendor(text: string, vendorMap: VendorMap): ResolveVendorResult {
  const entries = Object.values(vendorMap);

  if (entries.length === 0) {
    return { chips: [] };
  }

  // Score all entries
  const scored = entries
    .map(entry => ({ entry, score: bestScore(text, entry) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  // Auto-resolve criteria: top score ≥ 0.90 AND margin over #2 ≥ 0.15
  const margin = second ? top.score - second.score : 1;
  if (top.score >= 0.90 && margin >= 0.15) {
    return {
      auto: {
        vendorId: top.entry.vendorId,
        display: top.entry.display,
      },
    };
  }

  // Return up to 5 clarify chips
  const chips = scored.slice(0, 5).map(s => ({
    label: s.entry.display,
    spec: undefined,
  }));

  return { chips };
}
