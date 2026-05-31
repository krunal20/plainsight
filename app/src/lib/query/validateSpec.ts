import * as z from 'zod';
import type { QuerySpec, Dimensions, ValidationResult, ValidationError } from '../../../contracts';

// ---------------------------------------------------------------------------
// Zod schema for QuerySpec structural validation
// ---------------------------------------------------------------------------

const FiltersSchema = z.object({
  agency:      z.array(z.string()).optional(),
  category:    z.array(z.string()).optional(),
  subcategory: z.array(z.string()).optional(),
  vendorIds:   z.array(z.string()).optional(),
  fy:          z.array(z.union([z.literal(2022), z.literal(2023)])).optional(),
  monthRange:  z.tuple([z.number(), z.number()]).optional(),
});

const SortSchema = z.object({
  by:  z.enum(['measure', 'label']),
  dir: z.enum(['asc', 'desc']),
});

const CompareSchema = z.object({
  dimension: z.enum(['fy', 'agency', 'category']),
  a: z.string(),
  b: z.string(),
});

const QuerySpecSchema = z.object({
  intent:   z.enum(['rank', 'trend', 'breakdown', 'compare', 'total', 'profile']),
  measure:  z.literal('amount'),
  agg:      z.enum(['sum', 'avg', 'count', 'distinct_count', 'share', 'yoy_delta']),
  mode:     z.enum(['abs', 'pct']).optional(),
  netGross: z.enum(['net', 'gross']),
  filters:  FiltersSchema,
  groupBy:  z.enum(['agency', 'category', 'subcategory', 'vendor', 'fy', 'month']).optional(),
  sort:     SortSchema.optional(),
  topN:     z.number().optional(),
  compare:  CompareSchema.optional(),
  chart:    z.enum(['kpi', 'bar', 'line', 'treemap', 'donut', 'heatmap', 'table']),
});

// ---------------------------------------------------------------------------
// Levenshtein distance (simple, O(n*m)) for "closest" suggestions
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function closest(value: string, options: { id: string; label: string }[]): string | undefined {
  if (options.length === 0) return undefined;
  // Match against both id and label (case-insensitive)
  const lower = value.toLowerCase();
  let best = Infinity;
  let bestId = options[0].id;
  for (const opt of options) {
    const dId    = levenshtein(lower, opt.id.toLowerCase());
    const dLabel = levenshtein(lower, opt.label.toLowerCase());
    const d = Math.min(dId, dLabel);
    if (d < best) { best = d; bestId = opt.id; }
  }
  return bestId;
}

// ---------------------------------------------------------------------------
// validateSpec
// ---------------------------------------------------------------------------

/**
 * Pure validation of a QuerySpec against structural schema + enum membership.
 * Never calls any model; never performs I/O.
 */
export function validateSpec(spec: QuerySpec, dims: Dimensions): ValidationResult {
  // 1. Structural / schema validation via Zod
  const parsed = QuerySpecSchema.safeParse(spec);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path?.join('.') ?? 'unknown';
    const error: ValidationError = {
      code: 'schema',
      field,
      message: first?.message ?? 'Schema validation failed',
    };
    return { ok: false, error };
  }

  const s = parsed.data as QuerySpec;

  // 2. Semantic validation: topN range
  if (s.topN !== undefined) {
    if (s.topN < 1 || s.topN > 50) {
      return {
        ok: false,
        error: {
          code: 'semantic',
          field: 'topN',
          message: `topN must be between 1 and 50, got ${s.topN}`,
        },
      };
    }
  }

  // 3. Enum membership checks against provided Dimensions
  if (s.filters.agency) {
    for (const val of s.filters.agency) {
      if (!dims.agency.some(d => d.id === val)) {
        return {
          ok: false,
          error: {
            code: 'unknown_enum',
            field: 'filters.agency',
            message: `Unknown agency: "${val}"`,
            suggestion: closest(val, dims.agency),
          },
        };
      }
    }
  }

  if (s.filters.category) {
    for (const val of s.filters.category) {
      if (!dims.category.some(d => d.id === val)) {
        return {
          ok: false,
          error: {
            code: 'unknown_enum',
            field: 'filters.category',
            message: `Unknown category: "${val}"`,
            suggestion: closest(val, dims.category),
          },
        };
      }
    }
  }

  if (s.filters.subcategory) {
    for (const val of s.filters.subcategory) {
      if (!dims.subcategory.some(d => d.id === val)) {
        return {
          ok: false,
          error: {
            code: 'unknown_enum',
            field: 'filters.subcategory',
            message: `Unknown subcategory: "${val}"`,
            suggestion: closest(val, dims.subcategory),
          },
        };
      }
    }
  }

  return { ok: true, spec: s };
}
