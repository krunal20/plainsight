export type Dimension = 'agency' | 'category' | 'subcategory' | 'vendor' | 'fy' | 'month';
export type Measure = 'amount';
export type Agg = 'sum' | 'avg' | 'count' | 'distinct_count' | 'share' | 'yoy_delta';
export type ChartType = 'kpi' | 'bar' | 'line' | 'treemap' | 'donut' | 'heatmap' | 'table';

export interface QuerySpec {
  intent: 'rank' | 'trend' | 'breakdown' | 'compare' | 'total' | 'profile';
  measure: Measure;
  agg: Agg;
  mode?: 'abs' | 'pct';                 // only for yoy_delta
  netGross: 'net' | 'gross';            // default 'net'
  filters: {
    agency?: string[]; category?: string[]; subcategory?: string[];
    vendorIds?: string[];               // canonical ids only, post-resolution
    fy?: (2022 | 2023)[];
    monthRange?: [number, number];      // calendar months 1..12 (derived)
  };
  groupBy?: Dimension;                  // omit -> scalar KPI
  sort?: { by: 'measure' | 'label'; dir: 'asc' | 'desc' };
  topN?: number;                        // default 10, max 50
  compare?: { dimension: 'fy' | 'agency' | 'category'; a: string; b: string };
  chart: ChartType;
}

export interface QueryResult {
  rows: { label: string; value: number; group?: string }[];
  columns: { key: string; label: string; type: 'string' | 'number' | 'currency' }[];
  meta: { totalNet: number; totalGross: number; rowCount: number;
          truncated: boolean; emptyReason?: 'out_of_range' | 'no_match' | 'filtered_out' };
  spec: QuerySpec; sql: string; traceId: string;
}

export interface ValidationError { code: 'schema' | 'unknown_enum' | 'semantic'; field: string; message: string; suggestion?: string; }

export type AskResponse =
  | { kind: 'spec'; result: QueryResult; interpretation: string; followups: QuerySpec[] }
  | { kind: 'clarify'; chips: { label: string; spec?: QuerySpec }[] }
  | { kind: 'refuse'; category: 'causal' | 'invoice' | 'geography' | 'budget' | 'forecast'; redirect: string };

export interface ChartProps {
  result: QueryResult; subtitle: string;
  onSelect?: (sel: { dimension: Dimension; value: string }) => void;
  onExplain?: () => void;
}

export interface AIEvent {
  traceId: string; ts: string;
  step: 'compile' | 'resolve' | 'compute' | 'narrate' | 'repair' | 'refuse';
  userAction: string;
  input: { rawText?: string; systemPromptHash?: string; contextPayload?: unknown };
  model?: string; params?: unknown; output?: unknown;
  validation?: { ok: boolean; errors: ValidationError[] };
  tokens?: { input: number; output: number }; costUsd?: number; latencyMs?: number;
  cached?: boolean;
}

export interface CubeCell { agency: string; category: string; subcategory: string; month: number; fy: 2022 | 2023; net: number; gross: number; }
export interface Cube {
  cells: CubeCell[];
  vendorsByAgency: Record<string, { vendorId: string; name: string; net: number; gross: number }[]>;
  totals: { net: number; gross: number; byFy: Record<string, { net: number; gross: number }> };
}
export interface DimItem { id: string; label: string; gloss?: string; }
export interface Dimensions { agency: DimItem[]; category: DimItem[]; subcategory: DimItem[]; }

export type ValidationResult = { ok: true; spec: QuerySpec } | { ok: false; error: ValidationError };
export interface GuardResult { ok: boolean; cleaned: string; dropped: string[] } // numberGuard return

export interface LogApi {
  subscribe(cb: (e: AIEvent) => void): () => void; // returns unsubscribe
  append(e: AIEvent): void;
  all(): AIEvent[];
}
