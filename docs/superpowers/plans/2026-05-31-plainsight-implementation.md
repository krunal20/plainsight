# Plainsight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Review rule (from the user, overrides defaults):** never self-review — validate with independent review agents and the `code-review` skill, iterating until findings are minor.

**Goal:** Build *Plainsight* — a zero-config web app where a non-technical user explores Washington State vendor spending and trusts every number, because the AI only emits a validated query-spec, the engine computes deterministically, and a number-guard rejects any ungrounded figure.

**Architecture:** Contracts-first. A frozen `contracts/` module + checked-in fixtures let 8 workstreams build in parallel. Core loop: NL → (Gemini, function-calling) → `QuerySpec` → validate → **engine computes** (cube for dashboard slices; serverless `/api/query` for arbitrary) → themed ECharts + on-demand grounded narration. Two delivery targets from one codebase: a Vercel-hosted live app (server-side free Gemini key) and a single-file inline offline build (`vite-plugin-singlefile`) that double-clicks with cached answers.

**Tech Stack:** Vite + React + TypeScript, Tailwind (theme tokens), Apache ECharts, Zod, TanStack Table/Virtual, Google Gemini API (`gemini-2.5-flash`, free tier) behind a provider-agnostic adapter, DuckDB (Node, in the `/api/query` function) over a built fact file, Vitest (unit), Playwright (e2e), Vercel (one serverless function).

**Spec:** `docs/superpowers/specs/2026-05-31-plainsight-wa-spending-explorer-design.md` (read §5.2a/§5.2b for the contracts, §17 for the workstreams, §18 for config).

---

## Conventions (apply to every task)

- **TDD:** write the failing test → run it (see it fail) → minimal implementation → run (pass) → commit. Logic-heavy code (data transforms, validator, `canCubeAnswer`, `specToSql`, number-guard, vendor resolver) is strict TDD. UI/chart tasks use a render smoke-test + acceptance criteria.
- **Commits:** one per task minimum; conventional messages (`feat:`, `test:`, `fix:`, `chore:`).
- **Test commands:** `npm run test` (Vitest), `npm run test:e2e` (Playwright), `npm run build`, `npm run build:offline`.
- **Tooling:** run the `code-review` skill on each workstream's diff; dispatch independent review agents per the review rule.
- **No secrets in client code:** `GEMINI_API_KEY` is read only inside `api/` (server). Client never imports it.

---

## File structure (decomposition)

```
plainsight/
  contracts/                 # FROZEN in Phase A — the shared types every workstream imports
    index.ts                 # QuerySpec, QueryResult, ValidationError, AskResponse, ChartProps, AIEvent, Cube, Dimensions, Dimension/Measure/Agg
  fixtures/
    cube.fixture.json        # tiny hand-made cube for parallel dev
    dimensions.fixture.json
    result.fixture.json
  scripts/
    build-data.ts            # xlsx -> public/data/* + offline inlined data
  public/data/               # generated (gitignored except a small sample): cube.json, dimensions.json, vendors.json, facts.parquet
  src/
    theme/tokens.ts          # color/font tokens (Tailwind + JS)
    lib/
      query/
        validateSpec.ts      # Zod + semantic checks -> ValidationError
        canCubeAnswer.ts     # pure predicate
        specToSql.ts         # QuerySpec -> SQL string (display + execution)
        cubeReader.ts        # run a cube-answerable spec against the in-memory cube -> QueryResult
        runQuery.ts          # chooses cube vs /api/query; returns QueryResult
        buildSpecFromClick.ts# deterministic spec construction for chart clicks/slicers (NO LLM)
      ai/
        llm.ts               # provider-agnostic adapter (Gemini default)
        governedClient.ts    # single choke-point; calling model == logging
        log.ts               # AIEvent store (ring buffer + ndjson sink) + cached-replay
        compileSpec.ts       # NL -> QuerySpec via function-calling; owns 1 repair retry
        resolveVendor.ts     # free-text -> canonical id(s)
        narrate.ts           # result -> prose, gated by numberGuard
        numberGuard.ts       # reject ungrounded figures
        prompts.ts           # system prompt + function schema
      offline/
        cachedAnswers.ts     # curated question -> pre-generated AskResponse + captured AIEvents
        inlineData.ts        # offline build entry: imports inlined cube/answers
    components/
      charts/                # Kpi, Bar, Line, Treemap, Donut, Heatmap, DataTable (all take ChartProps)
      AskBar.tsx, GlassBox.tsx, SlicerRail.tsx, KpiStrip.tsx, LimitsPanel.tsx, ProvenanceStrip.tsx,
      InterpretationChip.tsx, Tabs.tsx
    state/store.ts           # URL(hash)-as-state for filters/measure/drill/compare
    pages/Dashboard.tsx, Report.tsx
    App.tsx, main.tsx
  api/
    ask.ts                   # POST /api/ask  -> AskResponse
    query.ts                 # POST /api/query -> QueryResult | {error}
  index.html
  vite.config.ts             # base:'./', single-file plugin for offline target
  vercel.json                # function runtime (nodejs)
  README.md
  docs/VIDEO.md              # storyboard + live AI-collaboration log
```

---

## PHASE A — Foundation (serial; freeze before any fan-out)

### Task A1: Scaffold the repo

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `tailwind.config.ts`, `.gitignore`, `.env.example`.

- [ ] **Step 1: Scaffold + deps**

```bash
npm create vite@latest plainsight -- --template react-ts
cd plainsight
npm i echarts zod @tanstack/react-table @tanstack/react-virtual zustand @google/genai
npm i @duckdb/node-api          # /api/query executor (native; see Spike S2 + vercel.json includeFiles)
npm i -D vitest @testing-library/react jsdom @playwright/test vite-plugin-singlefile tailwindcss postcss autoprefixer tsx cross-env unzipper sax @types/unzipper @types/sax
npx tailwindcss init -p
```

- [ ] **Step 2: `vite.config.ts` — relative base + offline single-file target**

```ts
import { defineConfig } from 'vitest/config'; // NOT 'vite' — re-exports Vite's defineConfig AND types the `test` key (else tsc fails)
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
const offline = process.env.BUILD_TARGET === 'offline';
export default defineConfig({
  base: './',
  define: { 'import.meta.env.BUILD_TARGET': JSON.stringify(process.env.BUILD_TARGET ?? 'web') }, // expose to app code
  plugins: [react(), ...(offline ? [viteSingleFile()] : [])],
  build: {
    outDir: offline ? 'dist-offline' : 'dist',
    ...(offline ? { cssCodeSplit: false, assetsInlineLimit: 100_000_000 } : {}), // required for single-file
  },
  test: { environment: 'jsdom', globals: true },
});
```

- [ ] **Step 3: scripts in `package.json`**

```json
"scripts": {
  "dev": "vite", "build": "vite build", "preview": "vite preview",
  "build:offline": "cross-env BUILD_TARGET=offline vite build",
  "build:data": "cross-env NODE_OPTIONS=--max-old-space-size=4096 tsx scripts/build-data.ts",
  "test": "vitest run", "test:watch": "vitest",
  "test:e2e": "playwright test", "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 4: hash router + `.env.example` + tsconfig** — use `HashRouter` (or a tiny hash-state router) in `App.tsx`; `.env.example` contains `GEMINI_API_KEY=`. Add `"types": ["vitest/globals", "node"]` to `tsconfig.json` `compilerOptions` (else `it/expect` error). Add `.gitignore`: `node_modules`, `dist`, `dist-offline`, `public/data/*` (keep `public/data/.gitkeep`), `.env`.

- [ ] **Step 5: Verify + commit**

Run: `npm run build` → Expected: succeeds, emits `dist/` with relative `./assets/...` paths.
```bash
git init && git add -A && git commit -m "chore: scaffold Vite React TS + offline single-file target"
```

---

### Task A2: Freeze the `contracts/` module + fixtures

**Files:** Create `contracts/index.ts`, `fixtures/cube.fixture.json`, `fixtures/dimensions.fixture.json`, `fixtures/result.fixture.json`. Test: `contracts/contracts.test.ts`.

- [ ] **Step 1: Write `contracts/index.ts` (verbatim — this is the freeze)**

```ts
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
```

> **`traceId` ownership:** `api/ask` (or the client for cube-only paths) generates ONE `traceId` per user action and threads it through `runQuery`/`cubeReader` (accept optional `traceId`) and every `AIEvent`, so compile→compute→narrate tie together. `canonicalize(name): string` (slug) is the SINGLE source of `vendorId` — defined in `scripts/transform.ts` and reused by the cube build, `vendors.json`, and `resolveVendor`. **Also frozen in Phase A:** `theme/tokens.ts` (Task A4) and the zustand `store` shape.

- [ ] **Step 2: Write fixtures** — hand-author `fixtures/cube.fixture.json` (≈6 cells across 2 agencies × 2 categories × 2 fy, with `vendorsByAgency` for each, and `totals`), `fixtures/dimensions.fixture.json` (2 agencies, 2 categories, 2 subcategories with glosses), `fixtures/result.fixture.json` (a valid `QueryResult` for "top agencies"), **`fixtures/vendors.fixture.json`** (canonical map incl. `MICROSOFT CORP` + aliases, plus an ambiguous `LAM, DORIS`/`LAM  DORIS` pair to exercise the clarify path — consumed by T5.2), and **`fixtures/aievents.fixture.json`** (a small `AIEvent[]` so WS6 GlassBox builds without WS5). Values must satisfy the interfaces exactly.

- [ ] **Step 3: Test the fixtures conform (compile-time + runtime guard)**

```ts
// contracts/contracts.test.ts
import cube from '../fixtures/cube.fixture.json';
import result from '../fixtures/result.fixture.json';
import type { Cube, QueryResult } from './index';
it('fixtures match contracts', () => {
  const c: Cube = cube as Cube; const r: QueryResult = result as QueryResult;
  expect(c.cells.length).toBeGreaterThan(0);
  expect(r.meta.totalNet).toBeTypeOf('number');
  expect(r.rows.every(x => typeof x.value === 'number')).toBe(true);
});
```

- [ ] **Step 4: Run + commit**

Run: `npm run test -- contracts` → Expected: PASS. `npm run typecheck` → Expected: clean.
```bash
git add contracts fixtures && git commit -m "feat: freeze contracts module + dev fixtures"
```

---

### Task A3: Data build script (the FMonth fix lives here)

**Files:** Create `scripts/build-data.ts`, `scripts/transform.ts` (pure fns). Test: `scripts/transform.test.ts`.

> The xlsx is `Vendor-Payments_2021-23.xlsx` at the repo parent. Stream it (do not load 200MB sheets naively). `FMonth` is 1–24 cumulative across the biennium: FY2022=1–12, FY2023=13–24; **calendar month = ((FMonth-1)%12)+1**. Strings are space-padded → `.trim()`. Decode `&amp;`.

- [ ] **Step 1: Write failing tests for the pure transforms**

```ts
// scripts/transform.test.ts
import { calMonth, cleanStr, fyOfFMonth } from './transform';
it('maps biennium FMonth to calendar month', () => {
  expect(calMonth(1)).toBe(1); expect(calMonth(12)).toBe(12);
  expect(calMonth(13)).toBe(1); expect(calMonth(24)).toBe(12);
});
it('derives FY from FMonth', () => { expect(fyOfFMonth(12)).toBe(2022); expect(fyOfFMonth(13)).toBe(2023); });
it('trims pad + decodes entities', () => { expect(cleanStr('Grants &amp; Benefits   ')).toBe('Grants & Benefits'); });
it('canonicalizes vendor names to a stable slug', () => {
  expect(canonicalize('MICROSOFT CORP.')).toBe(canonicalize('Microsoft Corp'));
  expect(canonicalize('ACME LLC')).toBe(canonicalize('ACME'));
});
```

- [ ] **Step 2: Run → FAIL** (`calMonth not defined`). Run: `npm run test -- transform`.

- [ ] **Step 3: Implement `scripts/transform.ts`**

```ts
export const calMonth = (fm: number) => ((fm - 1) % 12) + 1;
export const fyOfFMonth = (fm: number): 2022 | 2023 => (fm <= 12 ? 2022 : 2023);
export const cleanStr = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
// SINGLE source of vendorId — used by cube build, vendors.json, and resolveVendor
export const canonicalize = (name: string) =>
  cleanStr(name).toUpperCase().replace(/[.,]/g, '').replace(/\b(INC|LLC|CORP|CO|LTD|PLLC|PA)\b/g, '')
    .replace(/\s+/g, ' ').trim().replace(/\s/g, '-').toLowerCase();
```

Add `import { ..., canonicalize } from './transform';` to the test in Step 1.

- [ ] **Step 4: Run → PASS.** Run: `npm run test -- transform`.

- [ ] **Step 5: Write `scripts/build-data.ts`** — stream both sheets via **`unzipper` + `sax`** (proven on these ~200MB sheets; avoids `exceljs`'s large-sheet memory blowups): unzip `xl/sharedStrings.xml` once into a flat string array, then SAX-stream `xl/worksheets/sheet1.xml` + `sheet2.xml` row-by-row resolving shared-string indices. Runs under the `build:data` script's raised heap. Apply `cleanStr`/`calMonth`/`fyOfFMonth`/`canonicalize`, then emit to `public/data/`:
  - `cube.json` (`Cube` shape): aggregate `net`(signed) and `gross`(positives only) by `agency×category×subcategory×month×fy`; `vendorsByAgency` = top-50 by net per agency, `vendorId = canonicalize(name)` (the ONE shared id fn); `totals`.
  - `dimensions.json` (`Dimensions`): distinct agencies/categories/subcategories with `label`; glosses filled from a static map `scripts/glosses.json` (hand-authored plain-English; no runtime AI).
  - `vendors.json`: canonical map `{ rawName -> { vendorId: canonicalize(rawName), display, aliases[] } }` (cluster raw names by shared `vendorId`).
  - **`facts.parquet`**: one cleaned row per record `{agency,category,subcategory,vendorId,fy,month,amount}` for the `/api/query` DuckDB executor. **Parquet, not ndjson** — DuckDB reads it natively/columnar (far smaller, no full-file load). Write via the `parquetjs`/`duckdb` writer, or stage ndjson then `COPY ... TO 'facts.parquet' (FORMAT PARQUET)` once at build time.
  - **Build-time assertions (throw on fail):** every FY2022 row had FMonth∈[1,12], FY2023∈[13,24]; row count ≈ 935,853; negatives count ≈ 1,083; no NaN amounts.

- [ ] **Step 6: Run the build + commit**

Run: `cp "../Vendor-Payments_2021-23.xlsx" ./ && npm run build:data`
Expected: writes `public/data/*`; prints row count 935,853, negatives 1083, assertions OK.
```bash
git add scripts public/data/.gitkeep && git commit -m "feat: data build (FMonth fix, cube, dims, vendors, facts) + assertions"
```

> After A3, replace fixture imports with real data where convenient, but keep fixtures for unit tests.

---

### Task A4: Freeze theme tokens + store shape (Phase A — both WS2 & WS3 consume)

**Files:** Create `src/theme/tokens.ts`, `src/state/storeTypes.ts`.
- [ ] `tokens.ts` — export the palette (lead `#ef6a1e`, sage `#8a9b4e`, gold `#f3ad36`, brick `#b23a26`, paper `#f4f2ec`, ink `#1b1b18`, line `#e9e5da`, muted `#8c887f`) + fonts (Barlow, IBM Plex Mono). Wire into `tailwind.config.ts` `theme.extend.colors`.
- [ ] `storeTypes.ts` — export the `AppState` interface (filters, measure, netGross, topN, drillPath, compare, activeTab) so WS2 (impl) and WS7 (consumer) agree.
- [ ] Freeze the **`LogApi`** interface in `contracts/` (`subscribe(cb:(e:AIEvent)=>void):()=>void; append(e:AIEvent):void; all():AIEvent[]`) so WS6 (GlassBox) and WS5 (`log.ts`) agree without inventing the subscribe shape. Also freeze the Dashboard interaction seam: `onSelect` calls a store action `applySelection(sel)` (WS2 wires it; WS7 implements it). Commit.

---

## PHASE B — Workstreams in 3 waves (NOT 8-way parallel; WS4 is the unblocker)

**Two de-risking spikes FIRST (before fan-out), both foundational:**
- **Spike S1 — `vendorId` consistency:** confirm `canonicalize()` produces identical ids across cube build, `vendors.json`, and `resolveVendor` (one unit test). If it diverges, vendor-level queries silently return empty.
- **Spike S2 — DuckDB on Vercel:** confirm the native `duckdb` (or `@duckdb/node-api`) package loads in a Vercel Node function and can `read_parquet('facts.parquet')` within memory/timeout. If native bindings fail, fall back to a pure-JS aggregation over a pre-filtered Arrow/parquet. Verify before building `/api/query` for real.

**Execution waves (each wave's agents run in parallel; integration wiring of `Dashboard.tsx` is deferred to Phase C, NOT done in parallel):**
- **Wave 1:** WS4 (Query core — the unblocker), WS3 (Chart kit), WS8 (Docs). Zero cross-deps; build against fixtures.
- **Wave 2:** WS5 (AI — needs WS4), WS2 (App shell — needs WS3+WS4, builds shell with mount points), WS6 (Trust UI — builds against `aievents.fixture.json` + `result.fixture.json`).
- **Wave 3:** WS7 (Interactions) + final `Dashboard.tsx` wiring (needs WS2+WS3+WS4).

**File ownership (avoid collisions):** `buildSpecFromClick.ts` → **WS4 only** (WS7 imports it). `Dashboard.tsx` shell → **WS2**; interaction wiring into it → **Wave 3**. `tokens.ts`/`storeTypes.ts` → **Phase A (A4)**.

### Workstream 4 — Query core (TDD; the deterministic engine)

**Files:** `src/lib/query/{validateSpec,canCubeAnswer,specToSql,cubeReader,runQuery,buildSpecFromClick}.ts` + tests; `api/query.ts`.

- [ ] **T4.1 `canCubeAnswer` (pure).** Test first:

```ts
import { canCubeAnswer } from './canCubeAnswer';
import type { QuerySpec } from '../../../contracts';
const base: QuerySpec = { intent:'rank', measure:'amount', agg:'sum', netGross:'net', filters:{}, groupBy:'agency', chart:'bar' };
it('cube can answer agency sum', () => expect(canCubeAnswer(base)).toBe(true));
it('cube cannot answer vendor groupBy', () => expect(canCubeAnswer({...base, groupBy:'vendor'})).toBe(false));
it('cube cannot answer distinct_count', () => expect(canCubeAnswer({...base, agg:'distinct_count'})).toBe(false));
it('cube cannot answer vendorIds filter', () => expect(canCubeAnswer({...base, filters:{vendorIds:['x']}})).toBe(false));
```
Implement: returns true iff `groupBy ∈ {agency,category,subcategory,month,fy}` (or undefined), `!filters.vendorIds`, and `agg ∈ {sum,share,yoy_delta}`.

- [ ] **T4.2 `validateSpec` (pure, Zod + enums).** Test: rejects unknown agency with `{code:'unknown_enum', field:'filters.agency', suggestion:<closest>}`; rejects `topN>50`; accepts a valid spec. Implement Zod schema mirroring `contracts` + enum membership against `Dimensions`; returns `{ok:true, spec}` or `{ok:false, error: ValidationError}`. **Does not call any model.**

- [ ] **T4.3 `specToSql` (pure).** Test ALL six `Agg` values: `sum` (`SUM(CASE WHEN net... END)`), `gross` toggle changes the CASE, `avg` (`AVG`), `count` (`COUNT(*)`), `distinct_count` (`COUNT(DISTINCT vendorId)`), `share` (value over a window total), `yoy_delta` (pivot FY22/FY23, `mode:'pct'` → ratio). Plus filters/groupBy/sort/topN. Snapshot the strings. One source for BOTH display and `/api/query`.

- [ ] **T4.4 `cubeReader` (pure).** Test against `fixtures/cube.fixture.json`: "top agencies by net" returns sorted `QueryResult.rows` with correct `meta.totalNet`. Implement aggregation over `Cube.cells` for cube-answerable specs; produce `QueryResult` (set `sql = specToSql(spec)`, `traceId`).

- [ ] **T4.5 `runQuery`.** If `canCubeAnswer(spec)` → `cubeReader`; else `POST /api/query`. Test cube path with fixture; mock fetch for engine path. Returns `QueryResult` (with `meta.emptyReason` when zero rows).

- [ ] **T4.6 `buildSpecFromClick` (pure, NO LLM).** Test: clicking agency "X" on a category breakdown returns a spec with `filters.agency=['X']` merged into current filters. Implement deterministic spec construction for chart clicks/drill/slicers/measure-selector/compare.

- [ ] **T4.7 `api/query.ts`** — Node serverless fn: parse `{spec}`, `validateSpec`, run `specToSql` against DuckDB over **`facts.parquet`** via `read_parquet('facts.parquet')` (`@duckdb/node-api`; lazy columnar, no full-file load — confirmed in Spike S2), return `QueryResult | {error}`. Smoke test locally with `vercel dev` (or a node harness). Commit.

Acceptance: `npm run test -- query` all pass; `specToSql` snapshots stable.

---

### Workstream 5 — AI core (TDD on guard/resolver; the trust spine)

**Files:** `src/lib/ai/{llm,governedClient,log,compileSpec,resolveVendor,narrate,numberGuard,prompts}.ts` + tests; `api/ask.ts`.

- [ ] **T5.1 `numberGuard` (pure; highest-value test).** Test:

```ts
import { numberGuard } from './numberGuard';
import result from '../../../fixtures/result.fixture.json';
it('keeps grounded prose', () => expect(numberGuard('Agency A got $12.4B', result as any).ok).toBe(true));
it('drops a fabricated figure', () => expect(numberGuard('Agency A got $99.9B', result as any).ok).toBe(false));
it('allows years and ordinals', () => expect(numberGuard('In 2023 the top 5 led', result as any).ok).toBe(true));
it('tolerates rounding within 1%', () => expect(numberGuard('about $12.4B', result as any).ok).toBe(true));
```
Implement: extract numeric/currency tokens; normalize ($1.2B↔1.2e9); pass if within ±1% of any result value OR derivable (share %, diff of two cells); ignore years (1900–2100), small ordinals (≤ topN), and `meta.rowCount`.

- [ ] **T5.2 `resolveVendor` (pure).** Test against `vendors.fixture.json`: "microsoft" → auto-resolves to `MICROSOFT CORP` (score≥0.9, margin≥0.15); "lam" → returns clarify chips (ambiguous). Implement normalization + fuzzy rank (token-sort ratio).

- [ ] **T5.3 `llm.ts` adapter.** Interface `compile(messages, functions) -> {call?:{name,args}, text?}` and `complete(prompt) -> text`. Default impl wraps `@google/genai` `gemini-2.5-flash` with **forced function-calling**: `config.tools=[{functionDeclarations:[emit_query_spec,refuse,clarify]}]`, `config.toolConfig.functionCallingConfig={ mode:'ANY', allowedFunctionNames:['emit_query_spec','refuse','clarify'] }`. Reads `GEMINI_API_KEY` (server only). Add `groq`/`openrouter` stubs selectable by `LLM_PROVIDER`. Unit-test the arg-normalization with a fake transport. *(Gemini context caching of the static system prompt is a deferred prod optimization — §14 — not on the POC path.)*

- [ ] **T5.4 `governedClient` + `log`.** Every `llm` call routes through `governedClient`, which appends an `AIEvent` via the frozen `LogApi` (in-memory ring buffer always; ndjson sink only where writable — on Vercel use `/tmp`, else degrade to ring-buffer-only, never throw). Test: a compile call produces exactly one `AIEvent` with `step:'compile'` and the raw input recorded. This is the "one door" guarantee.

- [ ] **T5.5 `compileSpec`.** NL → `QuerySpec` via forced function-calling (`emit_query_spec|refuse|clarify`), then `validateSpec`; on error, **one** repair re-call with the `ValidationError` appended; else clarify. Free-text vendor → `resolveVendor` → inject `vendorIds` → re-validate. Test with a faked `llm` returning a known function call → asserts valid spec; faked invalid enum → asserts one repair attempt then clarify.

- [ ] **T5.6 `narrate`.** result → prose via `llm.complete` (model sees ONLY `QueryResult.rows`+meta, never the cube); output passed through `numberGuard`; failing sentences dropped. Test with faked llm.

- [ ] **T5.7 `api/ask.ts`** — Node fn: generate one `traceId`; `{text}` → `compileSpec` → if spec, `runQuery`(server, pass `traceId`) → optional `narrate` → `AskResponse{kind:'spec'}`; else `clarify`/`refuse`. All steps logged under the same `traceId`. Returns `AskResponse`. **Smoke-test locally with `vercel dev`** (not `vite dev` — functions only run under `vercel dev`) and a real free Gemini key.

Acceptance: `npm run test -- ai` pass; manual `curl /api/ask` returns a grounded answer; an unanswerable question returns `kind:'refuse'`.

---

### Workstream 3 — Chart kit (ECharts → `ChartProps`)

**Files:** `src/components/charts/{Kpi,Bar,Line,Treemap,Donut,Heatmap,DataTable}.tsx` + `theme/echartsTheme.ts`. Test: one render smoke-test per chart with `fixtures/result.fixture.json`.

- [ ] **T3.1** Build `echartsTheme.ts` from `theme/tokens.ts` (warm flat palette: lead `#ef6a1e`, sage `#8a9b4e`, gold `#f3ad36`, brick `#b23a26`; paper/ink/line neutrals; Barlow; IBM Plex Mono tabular for axis/values). Flat fills, hairline gridlines, no gradients.
- [ ] **T3.2** Each component: a **pure `optionFromResult(result): EChartsOption`** mapper + a thin `useEcharts(option)` mount hook; calls `onSelect` on `'click'` with `{dimension, value}` (dimension from `result.spec.groupBy`); header with `subtitle` + "Explain ›" wired to `onExplain`. `DataTable` uses TanStack Table + Virtual; sort + CSV export. **Example (Bar):**

```ts
export const barOption = (r: QueryResult): EChartsOption => ({
  grid: { left: 8, right: 16, top: 8, bottom: 24, containLabel: true },
  xAxis: { type: 'category', data: r.rows.map(x => x.label) },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: r.rows.map(x => x.value), itemStyle: { color: tokens.lead } }],
});
```

- [ ] **T3.2b Empty state** — when `result.rows.length === 0`, every chart renders the concrete `result.meta.emptyReason` message ("No rows: out of FY range / no vendor match / filtered out") instead of a blank canvas (spec §9). Unit-test the empty branch.
- [ ] **T3.3** Unit-test the **pure `optionFromResult` mappers** (assert the option object from `result.fixture.json`) — NOT a real ECharts canvas mount (jsdom has no canvas). One assertion per chart type. Commit.

Acceptance: all 7 render from the fixture; clicking emits `onSelect`.

---

### Workstream 2 — App shell + theme

**Files:** `tailwind.config.ts`, `src/App.tsx`, `src/components/{AskBar,SlicerRail,KpiStrip,Tabs}.tsx`, `src/state/store.ts`, `src/pages/Dashboard.tsx`. *(Imports `tokens.ts`/`storeTypes.ts` from A4 — does not create them.)*

- [ ] **T2.1** Consume `tokens.ts` (created in A4); ensure Tailwind theme extend is wired and load Barlow + IBM Plex Mono. (Do not re-create `tokens.ts` — A4 owns it.)
- [ ] **T2.2** `store.ts` — zustand store mirrored to the URL hash (filters, measure, netGross, topN, drill path, compare, activeTab). Test: setting a filter updates `location.hash`; loading a hash hydrates state.
- [ ] **T2.3** Layout: header (logo "Plainsight" + neutral mark, `AskBar`, FY + gross/net pills), `SlicerRail` (FY, gross/net, agency/category/subcategory selects, **vendor-search input** that calls `resolveVendor` → injects `filters.vendorIds`, Top-N), `KpiStrip`, `Tabs` (Overview/Vendors/Compare/What changed/Ask), main grid with **clearly-marked interaction mount points** (Wave-3 wiring). Render the shell against `result.fixture.json`; real `cube.json` data-wiring is finalized in Phase C integration. Commit.

Acceptance: `npm run dev` shows a themed dashboard with live KPIs + charts from real data; slicers re-query.

---

### Workstream 6 — Trust UI

**Files:** `src/components/{GlassBox,InterpretationChip,LimitsPanel,ProvenanceStrip,ShowSql,Replay}.tsx`, `src/lib/permalink.ts`.

- [ ] **T6.1** `GlassBox` — subscribes to the `AIEvent` log; renders plain-English rows with an Engineer toggle (raw JSON), a `cached:true` badge in offline mode, token/latency, and a download-NDJSON button.
- [ ] **T6.2** `ShowSql` — renders `result.sql` (from any result) in a disclosure. `InterpretationChip` — renders the read-back of `result.spec` ("Amount · by Vendor · FY2023 · top 10") AND is **editable**: changing a facet builds an adjusted `QuerySpec` → `validateSpec` → `runQuery`, re-rendering the answer (spec §6.2/§16). Test the edit→re-query path with a mocked `runQuery`.
- [ ] **T6.3** `LimitsPanel` ("What this data can't tell you") + `ProvenanceStrip` (source, FY range, "935,853 monthly aggregate rows · not invoice-level", unnormalized-vendor caveat). Static content from spec §11. Commit.
- [ ] **T6.4 Replay + permalink** — `lib/permalink.ts`: `encodeSpec(spec)`/`decodeSpec(hash)` (base64-encode a `QuerySpec` into the **URL hash**, since path routes are hosted-only). `Replay` button re-runs `result.spec` through `runQuery` and asserts an identical result (deterministic). Test: `decodeSpec(encodeSpec(s))` deep-equals `s`. Commit.

Acceptance: every answer can open Show-SQL + interpretation + Replay + copy-permalink; glass box streams events.

---

### Workstream 7 — Dashboard interactions

**Files:** `src/pages/Report.tsx`, `src/components/{MeasureSelector,CompareView,MoversView,EntityProfile}.tsx`; interaction wiring merged into `Dashboard.tsx` in **Wave 3** (after WS2). Imports `buildSpecFromClick` from WS4 (does **not** create it).

- [ ] **T7.1** Cross-filter: chart `onSelect` → `buildSpecFromClick` → merge into store filters → re-query all panels. Drill: maintain a hierarchy path (Agency→Category→SubCategory→Vendor) with breadcrumbs.
- [ ] **T7.2a `MeasureSelector`** — updates `spec.agg` (sum/avg/share/yoy_delta/distinct_count) on the active spec; re-queries.
- [ ] **T7.2b `CompareView`** — issues **two** specs (scope A, scope B) via `compare`, renders paired KPIs + mirrored bars + a delta column.
- [ ] **T7.2c `MoversView`** — one spec with `groupBy` + `agg:'yoy_delta'`, sorted; ranked risers/fallers.
- [ ] **T7.2d `EntityProfile`** — composes several specs for one entity (total KPI, category breakdown, monthly trend, top vendors) into a mini-report.
- [ ] **T7.3** `Report.tsx` — renders an `AskResponse{kind:'spec'}`: chart(s) + narration + `InterpretationChip` + follow-up chips (each a `QuerySpec` → one click runs it). Commit.

Acceptance: clicking filters everything; measure selector changes encodings; Ask→Report renders with follow-ups.

---

### Workstream 8 — README + video (starts day one, runs in parallel)

**Files:** `README.md`, `docs/VIDEO.md`, `docs/AI-LOG.md`.

- [ ] **T8.1** `docs/AI-LOG.md` — capture redirection moments **as they happen** during the build (especially the real FMonth 01–24 catch; and "the model wanted to write SQL directly → redirected to a validated spec"). Verbatim prompt→bad-output→fix triplets.
- [ ] **T8.2** `README.md` per spec §15: what/who; core-loop diagram + "the AI never touches numbers"; the 7 trade-offs (§13); the AI-collaboration log; prototype→production gaps (§14); run instructions (`open the hosted URL` / `double-click plainsight-offline.html` / `npx serve dist`); data caveats (§4, §11); the Gemini free-tier/no-SLA/pinned-model note (§18).
- [ ] **T8.3** `docs/VIDEO.md` — the ~3-min storyboard (cold open → two-click value → glass box + Show-SQL → honest refusal → the FMonth redirection beat → signature line). Commit.

---

## PHASE C — Offline build, deploy, integrate, verify

### Task C1: Offline data inlining + cached answers
**Files:** `src/offline/{cachedAnswers,inlineData}.ts`, `scripts/build-offline-data.ts`.
- [ ] Generate `src/offline/cube.inline.ts` (cube as a TS object) and `cachedAnswers.ts` (run ~8 curated questions through `/api/ask` once, capture each `AskResponse` + its real `AIEvent`s, write them inlined with `cached:true`). The app, when `import.meta.env.BUILD_TARGET==='offline'`, sources data from inline modules and routes `/api/ask` to `cachedAnswers` (cache-miss → "enter a key for live answers" state), `/api/query` → client `cubeReader`. Commit.

### Task C2: `vercel.json` + deploy
- [ ] `vercel.json`: `api/*` on the **Node runtime** (not Edge — native duckdb), `includeFiles` for the duckdb native binary + `public/data/facts.parquet`; `GEMINI_API_KEY` in Vercel project env. (Two files in `api/` = two functions — fine on Hobby; the spec's "one function" intent is satisfied logically by the shared contracts.) `npm run build` → deploy. Verify hosted URL: dashboard loads, Ask works live, glass box logs server-side.

### Task C3: Offline artifact
- [ ] `npm run build:data && npm run build:offline` → produces `dist-offline/index.html`; rename to `plainsight-offline.html`. **Verify by double-clicking from the file manager** (file://): dashboard renders, cached Ask answers work, no console CORS/module errors. Commit the artifact + a checksum.

### Task C4: E2E + integration smoke
- [ ] Run `npx playwright install` once. `tests/e2e/demo-path.spec.ts` (Playwright): load dashboard → cross-filter a chart → open Ask → ask a cached/known question → see chart + narration → open Show-SQL → open glass box. Run `npm run test:e2e`. Fix until green.

### Task C5: Eval set
- [ ] `tests/eval/spec-compiler.test.ts` — ~15 NL questions → expected `QuerySpec` (semantic-equivalence assert). Runs against a faked/recorded llm in CI (no live key), live key optional. 

### Task C6: Review (per the user rule — NOT self-review)
- [ ] Run the **`code-review`** skill on the full diff; fix findings.
- [ ] Dispatch **independent review agents** (3+) over the integrated build (correctness of the trust spine, the offline double-click, accessibility, demo-path robustness); iterate until findings are minor.
- [ ] Only then record the final video.

---

## Independent-agent plan review (replaces the skill's self-review, per user rule)

Before execution, this plan is reviewed by independent agents (not self-review) for: spec coverage (every §-requirement maps to a task), placeholder scan, type/name consistency against `contracts/`, and task granularity. Fix findings, re-review if substantial.
