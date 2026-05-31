# Plainsight — Design Spec

**One-line:** A web app that lets a non-technical person ask almost anything about Washington State's vendor spending — and trust every number, because the tool only ever shows figures it computed deterministically and can prove on demand.

**Date:** 2026-05-31
**Status:** Design — pending user review before implementation planning
**Challenge:** Golden Analytics "Turn Business Data Into Answers" (provn.co/challenge-details/98)

---

## 0. Build model (read first — it shapes the whole plan)

This is built by **numerous parallel AI coding agents**, not one human. That inverts the usual constraints:

- **Code volume is not the bottleneck.** Breadth is cheap; we keep the comprehensive scope.
- **The bottleneck is interface coherence.** Parallel agents only produce compatible code if the **contracts are frozen before fan-out** — the `QuerySpec` schema (§5.2a), the cube schema (§5.3a), chart component props (§5.2), and theme tokens (§7). Contracts-first is the whole game.
- **A few steps are irreducibly serial:** the one-time data-cube build on the real 49 MB file, the final integration + smoke test, and the human-recorded demo video (the authentic FMonth moment).
- **Some risk is not removed by speed:** DuckDB-WASM's COOP/COEP + browser-memory + cold-start risk persists regardless of codegen volume — hence serverless-route-primary (§5.3).

Build flow: **freeze contracts → wide parallel fan-out (§17) → integrate → independent-agent review.** Reviews are always done by independent agents, never self-review.

---

## 1. Context & goal

Build a working web-app proof-of-concept that helps a **non-technical user** get genuine value from a real, messy government-spending dataset. SQL must be hidden unless explicitly requested. AI is encouraged but must be intentional; **every input to any AI/model component must be logged** (a stated governance requirement).

**Who evaluates it:** Golden Analytics — a Seattle AI-native BI startup founded by François Ajenstat (ex-Chief Product Officer of Tableau and Snowflake). Their product thesis: *enterprise BI power + creative-software design + AI-native; "raw data to a shared dashboard in two clicks."* Implication: the evaluator is a world-class BI/product expert. We cannot out-dashboard the person who defined modern BI; we win on **trustworthy, AI-native answer quality and product judgment**, and on **data craft** that a Tableau veteran will notice.

**Scoring rubric (drives priorities):**
- Engineering Execution — 28% (working code; ≥2 explicit trade-offs; intentional structure)
- AI-Native Product Thinking — 22% (≥1 explicit UX decision for the non-technical user; why this over alternatives)
- Production & Data Mindset — 22% (prototype→production gap; what breaks; data handling)
- AI Fluency — 28% (documented AI collaboration; the mandatory video about a moment you *redirected* the AI — the single highest-signal item)

## 2. Product identity & positioning

**Plainsight** — *"Ask Washington's spending almost anything, and trust every number, because the tool shows its work."*

Two user-stated principles, treated as non-negotiable and complementary:
1. **Correctness above all** — wrong information cannot be tolerated.
2. **Breadth** — answer as many questions as possible.

These are not in tension: **breadth** comes from a real query engine over the full dataset; **trust** comes from an architecture where the AI never produces a number — it only compiles a validated query that the engine executes, with a deterministic guard that rejects any figure the data doesn't support.

## 3. Target users

One product, several non-technical personas sharing one need — *ask in plain language, get a trustworthy visual answer, no SQL*:
- **Curious citizen / taxpayer** — "where did my money go?" (broadest, most jargon-averse)
- **Journalist** — "who got the most, what changed, what's unusual?" (accountability, shareable)
- **Councilmember / policymaker** — "explain this so I can defend/question it"
- **Budget/policy analyst** — concentration, comparison, mix-shift, export (power without SQL)

## 4. The dataset (verified against the real file)

`Vendor-Payments_2021-23.xlsx` — Washington State vendor payments, a **pre-aggregated BI summary extract** (Power Query `BI_VendorSummaryExtract`), **not invoice-level**.

- **935,853 rows**, two sheets (FY2022: 451,029 · FY2023: 484,824). Grain = one row per (FY, FMonth, Agency, Object, Subobj, Vendor); confirmed zero duplicate grain keys.
- **Columns:** Bien (constant `2021-23`), FY (2022/2023), FMonth, Agy (code), Agency (name), Object (code), Category, Subobj (code), SubCategory, Vendor, Amount.
- **Cardinality:** Agency 102 · Category 9 · SubCategory 77 · Vendor 97,519 (≈512 near-duplicate name groups under light normalization) · Object 9 · Subobj 80.
- **Measure:** Amount; total ≈ **$63.2B**; **1,083 negative rows** (refunds/reversals); 54 zeros; no nulls.

**Verified quirks (must be handled — these are the "data craft" signals):**
- **`FMonth` is `01`–`24`, cumulative across the biennium** (FY2022 = 01–12, FY2023 = 13–24). It is **not** calendar month and **not** 01–12. Month-of-year = `((FMonth-1) % 12) + 1`. *This is the dataset's signature trap — assuming 01–12 silently corrupts every trend/seasonality/YoY view.*
- **Trailing-space padding** on 99.8% of strings (`xml:space="preserve"`) — must `.trim()` everywhere or group-bys fragment.
- **`&amp;` HTML entities** in labels (e.g. "Grants, Benefits &amp; Client Services") — decode before display.
- **Refunds (negative amounts)** silently net into totals unless handled — surface gross/net explicitly.
- **Unnormalized vendor names** — "top vendor"/concentration metrics are only as good as name hygiene; must caveat and lightly normalize.
- **Only two fiscal years** — "trend" is a single year-over-year change; forecasting is statistically indefensible (explicit non-goal).

## 5. Architecture overview

### 5.1 The core loop (the trust spine)

```
User question (typed, chip, or chart click)
        │
        ▼
[1] COMPILE  — LLM (Gemini Flash, function-calling) → validated QuerySpec     ← logged
        │        (or a `refuse` / `clarify` response — first-class outcomes)
        ▼
[2] VALIDATE — deterministic (Zod) against the real dimension enums; 1 repair retry
        │
        ▼
[3] COMPUTE  — the ENGINE runs the aggregation on real data. NO AI here.     ← numbers born here
        │        (cube for dashboard slices; serverless query route for arbitrary queries)
        ▼
[4] RENDER   — a fixed, themed chart kit renders the result
        │
        ▼
[5] NARRATE  — ON DEMAND only (user clicks "Explain"): LLM (Gemini Flash)    ← logged
                 sees ONLY the computed result rows; a deterministic
                 "number guard" drops any figure not present in the data.
```

**Principle:** the AI is the *interface and the explainer*, never the source of truth. The number is always produced by deterministic code in step [3].

### 5.2 Components (each has one purpose, a clear interface, known deps)

- **`QuerySpec` (the contract)** — a small, closed, declarative JSON describing intent, measure, aggregation (sum/avg/count/share/yoy-delta/distinct-count), gross/net, filters (validated enums + resolved vendor ids), group-by, sort, limit, optional compare. *It is data, never code or SQL.* This is the prompt-injection firewall and the portability seam (browser↔server).
- **Spec compiler** (`lib/ai/compileSpec`, server-side) — NL → `QuerySpec` via Gemini Flash with forced function-calling (`emit_query_spec | refuse | clarify`), through the provider-agnostic LLM adapter. Invoked **only for typed/NL input**; chart clicks, drill, and slicers build specs **directly in client code (deterministic, no LLM)**. **Owns the single repair re-call:** if the validator returns a typed error, it re-prompts once with that error appended, then surfaces a `clarify` card. Dep: governed AI client.
- **Spec validator** (`lib/query/validateSpec`) — Zod schema + semantic checks against dimension enums loaded from the data. **Pure and deterministic** — returns a typed error; it does *not* call the model (the compiler owns repair). Testable in isolation.
- **Engine** (`lib/query/run`) — executes a `QuerySpec` → normalized result. Backend chosen by the pure predicate `canCubeAnswer(spec)` (§5.3a): the **cube reader** for slices it covers, else the **serverless query route** (the primary full-dataset executor). `specToSql(spec)` is a **standalone pure function** used both to execute (server) and to display ("Show the SQL"), so *every* result — cube or engine — shows identical, real SQL. DuckDB-WASM is an *optional* in-browser backend behind the same interface (§5.3).
- **Vendor resolver** (`lib/query/resolveVendor`) — deterministic fuzzy match of free-text → canonical vendor (offline-built map). **Order:** compiler emits free-text vendor → resolver maps to canonical id(s) → ids injected into the spec → validate. **Auto-resolves** when top score ≥ 0.90 and margin over #2 ≥ 0.15; otherwise returns top-5 `clarify` chips. Normalization: uppercase, strip punctuation + trailing entity suffixes (INC/LLC/CORP/CO), collapse whitespace.
- **Chart kit** (`components/charts/*`) — fixed set of themed ECharts components: KPI, bar/ranking, line (real-month axis), treemap, donut/concentration (Pareto), heatmap, smart table. Input: a normalized result + chart type. No AI.
- **Narrator** (`lib/ai/narrate`) — result rows → plain-English takeaway via Gemini Flash (through the provider-agnostic adapter); output passes the **number guard** before display. On-demand only.
- **Governed AI client** (`lib/ai/governedClient`) — the single choke-point wrapping the provider-agnostic LLM adapter (`lib/ai/llm`). *Calling the model IS logging.* Emits a structured event for every call.
- **Glass-box log** (`lib/ai/log` + `components/GlassBox`) — append-only event store (POC: in-memory + NDJSON) surfaced as a live, human-readable panel.

### 5.2a The `QuerySpec` contract (FROZEN FIRST — everything depends on it)

```ts
// All dimension string values are validated at runtime against the real enum lists from dimensions.json.
type Dimension = 'agency' | 'category' | 'subcategory' | 'vendor' | 'fy' | 'month';
type Measure   = 'amount';
type Agg       = 'sum' | 'avg' | 'count' | 'distinct_count'
               | 'share'      // % of the FILTERED total (denominator = sum over current filters, pre-groupBy)
               | 'yoy_delta'; // signed FY2023 − FY2022 in DOLLARS (pair yoy_delta with mode:'pct' for %)

interface QuerySpec {
  intent: 'rank' | 'trend' | 'breakdown' | 'compare' | 'total' | 'profile';
  measure: Measure;
  agg: Agg;
  mode?: 'abs' | 'pct';            // only meaningful for yoy_delta
  netGross: 'net' | 'gross';        // net = include the 1,083 refunds; gross = positives only. Default 'net'.
  filters: {
    agency?: string[]; category?: string[]; subcategory?: string[];
    vendorIds?: string[];           // canonical ids, post-resolution (never raw text)
    fy?: (2022 | 2023)[];
    monthRange?: [number, number];  // calendar months 1..12 (derived; NOT raw FMonth 1..24)
  };
  groupBy?: Dimension;              // omit for a single scalar (KPI)
  sort?: { by: 'measure' | 'label'; dir: 'asc' | 'desc' };
  topN?: number;                    // default 10; max 50
  compare?: { dimension: 'fy' | 'agency' | 'category'; a: string; b: string }; // intent:'compare'
  chart: 'kpi' | 'bar' | 'line' | 'treemap' | 'donut' | 'heatmap' | 'table';
}
```

A `QuerySpec` is **data, never code or SQL** (the injection firewall + the browser↔server portability seam). The compiler's tool schema, the validator, `specToSql`, the URL codec, and the interpretation chip all derive from this one type.

**Semantics to pin:** `groupBy:'month'` = **month-of-year (1–12)**; the FY22-vs-FY23 trend renders FY as separate **series** (driven by `filters.fy`/`compare`), never as 24 sequential points. **Compare** is limited to `compare.dimension ∈ {fy, agency, category}` (the UI offers only these).

### 5.2b The remaining frozen contracts (Phase-A artifacts — output + wire + UI seams)

`QuerySpec` is the *input* contract; these are the *output*, *wire*, and *component* contracts that four+ workstreams share. All live in a committed `contracts/` module, shipped with **checked-in fixtures** (`cube.fixture.json`, `dimensions.fixture.json`, `result.fixture.json`) so workstreams 3–7 build against real-shaped data before the §17-B1 data build finishes.

```ts
// The normalized result EVERY engine path returns and the chart kit / narrator / number-guard consume.
interface QueryResult {
  rows: { label: string; value: number; group?: string }[];   // group? drives series (e.g. FY) & stacking
  columns: { key: string; label: string; type: 'string' | 'number' | 'currency' }[];
  meta: { totalNet: number; totalGross: number; rowCount: number;
          truncated: boolean; emptyReason?: 'out_of_range' | 'no_match' | 'filtered_out' };
  spec: QuerySpec; sql: string; traceId: string;
}

interface ValidationError { code: 'schema' | 'unknown_enum' | 'semantic'; field: string; message: string; suggestion?: string }

// Wire envelopes
// POST /api/query  { spec: QuerySpec }            -> QueryResult | { error: ValidationError }
// POST /api/ask    { text: string }               ->
type AskResponse =
  | { kind: 'spec';    result: QueryResult; interpretation: string; followups: QuerySpec[] }
  | { kind: 'clarify'; chips: { label: string; spec?: QuerySpec }[] }
  | { kind: 'refuse';  category: 'causal' | 'invoice' | 'geography' | 'budget' | 'forecast'; redirect: string };

// Uniform props for all 7 chart components
interface ChartProps { result: QueryResult; subtitle: string;
  onSelect?: (sel: { dimension: Dimension; value: string }) => void;  // drives cross-filter/drill (workstream 7)
  onExplain?: () => void }

interface AIEvent { traceId: string; ts: string; step: 'compile'|'resolve'|'compute'|'narrate'|'repair'|'refuse';
  userAction: string; input: { rawText?: string; systemPromptHash?: string; contextPayload?: unknown };
  model?: string; params?: unknown; output?: unknown; validation?: { ok: boolean; errors: ValidationError[] };
  tokens?: { input: number; output: number }; costUsd?: number; latencyMs?: number }
```

```ts
// cube.json literal shape (Data workstream produces; cube reader consumes)
interface Cube {
  cells: { agency: string; category: string; subcategory: string; month: number; fy: 2022|2023; net: number; gross: number }[];
  vendorsByAgency: Record<string, { vendorId: string; name: string; net: number; gross: number }[]>; // top-50/agency
  totals: { net: number; gross: number; byFy: Record<string, { net: number; gross: number }> };
}
// dimensions.json (validator + compiler consume)
interface Dimensions { agency: {id:string;label:string;gloss?:string}[]; category: {...}[]; subcategory: {...}[]; }
```

**Theme tokens** ship as one committed config (Tailwind `theme.extend.colors`: `lead #ef6a1e`, `sage #8a9b4e`, `gold #f3ad36`, `brick #b23a26`, plus paper/ink/line/muted neutrals) + the Barlow/IBM-Plex-Mono font setup — imported by all UI workstreams; no agent invents its own.

### 5.3 Data layer (serverless-primary, cube-accelerated)

- **Build step** (offline, runs once on the real file): stream both sheets (never load the 200MB sheet naively), `.trim()`/decode `&amp;`, derive calendar `month` (1–12) + `date` from `FMonth` (1–24), assert FY2022⊂{1–12}/FY2023⊂{13–24}, then emit:
  - `cube.json` (§5.3a) → powers the **instant dashboard** on first paint, fully client-side.
  - `payments.parquet` — full 935,853 cleaned rows (columnar) → the **serverless query route's** dataset (and the optional DuckDB-WASM backend's).
  - `vendor_canonical.json` — normalized vendor map (≈512 dup groups collapsed) + alias index.
  - `dimensions.json` — enum lists + plain-English glosses (generated offline once).
- **Executor model (the engine that answers "anything"):** the **serverless query route** (`/api/query`, DuckDB-on-Node or hosted Postgres) is the **primary, reliable executor** — it runs `specToSql(spec)` against the full dataset. It is *also* the production architecture (same contract). **DuckDB-WASM is an optional in-browser enhancement** built as its own parallel workstream; the demo never depends on it (its risk — COOP/COEP headers, bundle weight, cold start, browser memory — is runtime, not code-volume, so parallel agents don't remove it). Server execution is the default; a one-line flag flips the Ask box to DuckDB-WASM if present.

### 5.3a Cube schema + backend selection

- **`cube.json`** holds every aggregate the **dashboard** needs, pre-summed: keys = `agency × category × subcategory × month × fy`, plus per-agency `top-50 vendors`, plus grand totals; both `net` and `gross` sums stored. *(SubCategory is included so the dashboard's subcategory slicer is cube-served — reconciling §6.1.)* Target ≈ a few hundred KB gzipped (verify at build time; the precise number is an acceptance check, not a promise).
- **`canCubeAnswer(spec): boolean`** — pure predicate: returns `true` iff `groupBy ∈ {agency,category,subcategory,month,fy}`, there is no `vendorIds` filter requiring beyond per-agency top-50, and `agg ∈ {sum,share,yoy_delta}`. Otherwise the engine routes to the serverless query route. Vendor-level / arbitrary cross-tab / `distinct_count` always route to the engine. **Both paths use the same `specToSql` for "Show the SQL," so results never diverge in how they're explained.**

### 5.4 AI layer specifics

- **Provider:** **Google Gemini API (free tier)**, default **`gemini-2.5-flash`** (pin the version explicitly — do **not** use bare "flash"; `gemini-2.0-flash` is being retired 2026-06-01) for both spec-compile and narration, behind a **provider-agnostic LLM adapter** (`lib/ai/llm` — one interface; Gemini default, Groq/OpenRouter swappable via env). *Trade-off: a single fast free model + adapter over a paid two-tier setup — correctness is structural (§trust spine), so model tier doesn't affect answer correctness; cost = $0.*
- **Structured output:** Gemini function-calling with a forced function; tri-state `emit_query_spec | refuse | clarify` makes honest refusal and disambiguation protocol-level features. (The adapter normalizes function-calling across providers.)
- **Number guard:** extract every numeric/currency token from the narration and assert each traces to the computed result. Matching rules so legitimate prose isn't fail-closed: (a) normalize formats — `$1.2B` ≈ `1,203,114,556` within a **±1% rounding tolerance**; (b) **allowlist** values derivable from result rows — percentages/shares, ratios, and the difference of two present cells; (c) **ignore** non-data tokens — years (2022/2023), small ordinals ("top 5"), and the result's own row count. Any number that still doesn't trace → drop that sentence (fail-closed) and show the chart/table alone.
- **Prompt caching** on the static system prompt + schema + dimension enums.

## 6. The two surfaces

### 6.1 Explore dashboard (zero typing required)
A focused, beautiful, coordinated dashboard answering "where did the money go?" by browsing. **Deliberately tight** (depth over breadth): KPI strip, composition treemap, top agencies, top vendors / concentration, FY22-vs-FY23 trend (real-month axis), and a sortable/exportable detail table. **Cross-filter** (click a chart → filters the rest) and **hierarchical drill** (Agency→Category→SubCategory→Vendor) with breadcrumbs. Each chart carries a **plain-English question subtitle** (Golden's product pattern) and an on-demand **Explain**. Slicers: FY, gross/net-of-refunds, agency/category/subcategory, vendor search, Top-N. Tabs: Overview · Vendors · Compare · What changed · Ask.

### 6.2 Ask → Report (breadth)
The ask box (and ⌘K palette) compiles any question into a custom report: the right chart(s) from the kit + plain-English spoon-feeding narration + an **editable interpretation chip** ("I read this as: measure, group-by, filters — edit") + suggested follow-ups (returned as ready-to-run specs). Powered by the serverless query route (DuckDB-WASM optional) so it can answer arbitrary vendor-level/cross-tab questions, not just pre-computed slices.

## 7. Design system

**Resonant with Golden's actual *product* (not their marketing site).** Light, warm, editorial-clean BI:
- **Canvas:** warm paper `#f4f2ec`; white cards, hairline borders `#e9e5da`, soft shadows; generous space.
- **Palette (flat, no gradients):** orange `#ef6a1e` (lead), sage `#8a9b4e`, gold `#f3ad36`, brick `#b23a26` (and for refunds/negatives). Orange used as a scalpel, not a wash.
- **Type:** Barlow (their typeface) for UI; IBM Plex Mono tabular figures for financial credibility; Barlow Semi-Condensed for display numbers.
- **Patterns:** plain-English question subtitle on every chart; "Explain ›" text affordance (no sparkle/AI-slop icons); dot legends; spreadsheet-style tabs.
- **Our identity:** product name **Plainsight** with a simple neutral mark — *not* Golden's logo/wordmark. We resonate with their aesthetic; we do not impersonate their brand.
- Optional dark "command" mode as a nod to their marketing site (stretch, not core).

## 8. Data flow & logging points

1. User submits question / clicks chip / clicks chart → `compile` event **logged** (raw text, system-prompt hash, model, params).
2. Spec validated; repair attempt (if any) **logged**.
3. Vendor resolution (if needed) → auto-resolve with "showing X" or `clarify` chips.
4. Engine computes (cube, or serverless query route; DuckDB-WASM only if the optional backend is present) → `compute` event logged (spec, row count, latency). *No AI.*
5. Chart kit renders; computed stats (share, %, totals) shown immediately.
6. User clicks **Explain** → `narrate` event **logged** (the exact result rows the model saw); number guard runs; prose shown.
7. Every result carries a `trace_id`; **Replay** re-runs the stored spec (bit-for-bit identical); **Permalink** encodes spec in URL.

## 9. Error handling & edge cases

- **Invalid spec** → one repair round-trip; then a friendly clarify card (never a crash, never a guess).
- **Ambiguous vendor/entity** → "Did you mean …?" chips before compute.
- **Two distinct "can't answer" paths, by mechanism:**
  - **Compile-time `refuse`** (LLM-decided, before compute) — for *categorically* unanswerable questions (why/causal, invoice-level, geography, budget-vs-actual, forecast). The `refuse` tool returns a category + a redirect to the nearest answerable question.
  - **Post-compute empty-result** (deterministic, engine-decided) — a *valid* spec that returns zero/thin rows. The engine explains the concrete reason ("out of FY range / no vendor match / filtered out"), never a blank chart.
- **Refunds** → gross/net toggle; totals state which; refunds never silently hidden.
- **FMonth** → all time logic uses the derived calendar month/date; an assertion verifies FY2022⊂{01–12}, FY2023⊂{13–24} at build time.

## 10. Testing strategy

- **Spec-compiler eval set** — a golden list of NL questions → expected spec (proves AI Fluency *and* engineering rigor). Run in CI.
- **Number-guard unit tests** — narration with a fabricated figure is rejected.
- **Validator tests** — enum/semantic rejection + repair behavior.
- **Build-time data assertions** — FMonth ranges, row counts, trim/decoding, refund count.
- **E2E (Playwright)** — ask → chart → explain → replay; dashboard cross-filter + drill.

## 11. Honest data craft & boundaries

A visible **"What this data can't tell you"** panel, stating permanent limits: no invoice/transaction detail, no geography/per-capita, no budget-vs-actual, no vendor type/purpose, no causal "why," no credible forecast (2 years). Plus a provenance strip: source, FY range, "935,853 monthly aggregate rows · not invoice-level," and an "unnormalized vendor names" caveat. *Turning limits into trust is a deliberate Production/Data-Mindset play.*

## 12. Governance / the glass box

A single `logAIEvent` choke-point (`governedClient`) every model call routes through — "there is no other door." Each event: `trace_id`, timestamp, step, user action, **input** (raw text, prompt hash, context payload for narration), model, params, output (spec/prose), validation result, tokens, cost, latency. POC sink: in-memory ring buffer + `logs/ai-events.ndjson`; production swaps for an OTel exporter — same shape. Surfaced as a live, plain-English **AI Activity** panel with an Engineer view, **Show the SQL** (deterministically generated from the spec — satisfies "SQL on request"), **Replay**, and **download audit trail**.

## 13. Explicit trade-offs (named in README)

1. **Structured query-spec over LLM-generated SQL/free-form charts** — safety, auditability, refusability, portability; cost is less raw flexibility (mitigated by the engine's breadth).
2. **AI never computes numbers; deterministic engine + number guard** — trust over convenience; cost is more plumbing.
3. **Free Gemini Flash behind a provider-agnostic adapter** — $0 cost and model-independent correctness (the spec architecture, not the model, guarantees right numbers) over a paid/proprietary model; cost = a swappable adapter layer.
4. **Deterministic fuzzy vendor matching over embeddings/vector store** — right tool for lexical business-name matching; cost is missing true synonyms (named as production work).
5. **Comprehensive scope via parallel agents, anchored to one bulletproof demo path** — with parallel codegen, breadth is cheap, so we keep it; but we still guarantee a single end-to-end path (dashboard + one Ask→Report flow) that is demo-solid, so breadth never costs us a working demo.
6. **Serverless query route as the primary executor (DuckDB-WASM optional)** — reliability over the in-browser "no server" wow; the route *is* the production architecture (same `QuerySpec`→SQL), and DuckDB-WASM's risk (COOP/COEP, memory, cold start) is runtime, not something codegen speed removes.
7. **No forecasting** — honesty over a fake-authoritative projection on 2 years of data.

## 14. Prototype → production gaps (named in README)

ETL/data pipeline (static build → scheduled ingestion + cube rebuild + schema-drift→enum sync); query executor (serverless DuckDB-on-Node → hosted Postgres at scale, same spec contract); auth/multi-tenant + **row-level security** (a tenant predicate injected into the spec — a feature of the design); PII/redaction (public data here; pattern would touch PII); prompt-injection (structurally de-risked; add rate-limiting + adversarial eval); caching (prompt cache + spec-keyed result cache); observability/eval (the NDJSON log is the eval corpus; add faithfulness scoring + model-upgrade canaries); cost controls (session meter → per-user budgets + tier routing); large-data scaling (in-browser memory ceiling → push-down). **Future AI value:** multi-turn conversational drill-down, "narrate my dashboard" exec summaries, learned follow-ups from the question corpus, NL dashboard authoring (the spec is already a serializable dashboard definition), anomaly-watch alerts.

## 15. Deliverables

- **App** — a **Vite React SPA** on Vercel + **one serverless function** exposing the `/api/ask` + `/api/query` routes (key server-side → "all AI inputs logged" credible). Offline target = **single-file inline build** (`vite-plugin-singlefile`, hash router, `base:'./'`) that double-clicks (§18). URL-as-state (**hash-based**) for shareable deep links; server-rendered social-preview (OG) images and path-based `/report` links are a **hosted-only** enhancement (don't survive the offline file:// bundle). ECharts (themed), **Google Gemini (free tier) behind a provider-agnostic LLM adapter**, a serverless query route (DuckDB-on-Node or hosted Postgres; in-browser DuckDB-WASM optional), TanStack Table/Virtual for the detail table.
- **README** — what/who; the core-loop diagram + "the AI never touches numbers"; the explicit trade-offs (§13); the AI-collaboration log with a verbatim prompt→bad-output→fix triplet; prototype→production gaps (§14); run instructions that work in <2 min; data caveats (§4, §11).
- **Demo video (~3 min)** — cold open on the problem; the two-click value moment (quote their thesis back); reveal the glass box + "Show the SQL"; an honest refusal; **the mandatory AI-redirection beat = the real FMonth 01–24 fiscal-trap moment we hit during this build** (AI/assumption treated FMonth as 01–12 calendar months; an adversarial check against the real file caught it; we derived the true calendar month and added a build-time assertion + UI caveat). Close on the signature line: *"Most tools answer fast and lie quietly; this one shows its work, so a non-technical person can trust the number."*

## 16. Scope — in / deliberately out

Parallel codegen makes breadth cheap, so the **core is comprehensive** — gated only by contract coherence and the bulletproof-demo-path guarantee (trade-off #5), not by code volume.

**In (core):** trust spine (compile→validate→compute→render→narrate); number guard; glass box + Show-the-SQL + replay + permalink; honest refusal (both paths, §9); serverless query route + cube; **Explore dashboard** with KPIs, composition treemap, top agencies, top vendors / concentration, FY22-vs-FY23 trend (real-month axis), detail table, **cross-filter + hierarchical drill**, slicers (FY, gross/net, agency/category/subcategory, vendor search, Top-N), **measure selector**, **Compare mode**, **Movers/YoY view**, **entity profile**; **Ask→Report** with interpretation chip + suggested follow-ups; gross/net + FMonth correctness; vendor normalization; "what this data can't tell you"; URL-as-state deep links; README + demo video.

**Stretch (only if cheap / time):** DuckDB-WASM in-browser backend; command palette (⌘K); OG-image/PDF share; dark "command" mode; per-session cost meter.

**Out (deliberate non-goals):** forecasting; free-form AI chart-code generation; live text-to-SQL editor; embeddings/vector store for vendors; auth/multi-tenant; a second "critic" LLM.

## 17. Build plan — contracts-first, then parallel fan-out

**Phase A — Freeze contracts (serial, ~first, one owner).** Ship a committed `contracts/` module containing **all** shared types — `QuerySpec` (§5.2a); `QueryResult`, `ValidationError`, `/api/query` + `/api/ask` (`AskResponse`) envelopes, `ChartProps` (incl. `onSelect`), `AIEvent`, `Cube`, `Dimensions` (§5.2b); `canCubeAnswer` (§5.3a); and the theme-token config (§7) — **plus checked-in fixtures** (`cube.fixture.json`, `dimensions.fixture.json`, `result.fixture.json`). *Nothing fans out until these are frozen — and the fixtures are what let workstreams 3–7 build against real-shaped data before the §B1 data build finishes.* Two cross-workstream seams to call out: `ChartProps.onSelect` (workstream 7's cross-filter depends on it) and `ValidationError` (workstream 5's repair loop consumes it) — both must be in this module, or those pairs become secretly serial.

**Phase B — Parallel workstreams (fan out; each is independently testable against the frozen contracts):**
1. **Data** — build script: xlsx → `cube.json` + `payments.parquet` + `vendor_canonical.json` + `dimensions.json`; FMonth fix + build-time assertions. *(Serial dependency for others' real data, but they can develop against a fixture in parallel.)*
2. **App shell + theme** — Vite React SPA scaffold (`vite-plugin-singlefile` offline target, hash router, `base:'./'`), theme tokens, layout, header/ask bar, KPI strip, slicer rail, tabs.
3. **Chart kit** — themed ECharts components (KPI, bar, line real-month, treemap, donut/Pareto, heatmap, table) to the frozen props.
4. **Query core** — `QuerySpec` Zod schema, validator, `specToSql`, cube reader, `canCubeAnswer`, `/api/query` route.
5. **AI core** — governed client, spec compiler (tool-use, repair), narrator + number guard, refusal, vendor resolver, `/api/ask` route, glass-box log.
6. **Trust UI** — glass-box panel, Show-the-SQL, replay/permalink, "what this data can't tell you," provenance.
7. **Dashboard interactions** — cross-filter, hierarchical drill, measure selector, Compare, Movers, entity profile (client-side spec construction, no LLM).
8. **README + video** — **starts in parallel from day one**, not last: the AI-collaboration log is captured *live* (especially the FMonth redirection), README trade-offs/prod-gaps drafted alongside, video storyboarded early.

**Phase C — Integrate + verify (serial).** Wire the workstreams on the real cube; smoke-test the one guaranteed end-to-end demo path first (dashboard → Ask→Report → Explain → Show-the-SQL); run the spec-compiler eval set; then **independent-agent review** (never self-review), iterated across rounds until findings are minor — plus the **`code-review`** skill on the diffs — before recording the final video.

## 18. Config, cost & access (zero-config for the grader)

**Cost: $0.** LLM = **Google Gemini API free tier** (free key from Google AI Studio, separate from the Gemini Pro app), behind the provider-agnostic adapter. No database, no auth provider, no paid services.

**The only secret:** `GEMINI_API_KEY` — used **server-side only**, needed for the *live* AI path. The grader never sees or supplies it.

**What the grader needs: nothing.** Two zero-config paths, both shipped:
- **Live hosted URL (Vercel):** click a link → full live AI; the free Gemini key is a server-side env var (rate-limited; free-tier caps are ample for grading). Zero install, zero key, zero config.
- **Offline static build (true double-click):** a **single-file inline build** (via `vite-plugin-singlefile`) — all JS/CSS inlined into one `index.html`, the cube inlined as a JS object (not a fetched JSON), cached pre-generated AI answers inlined as a JS map, **hash routing**, relative asset paths. This genuinely opens from `file://` by double-click with no server and no key. *(A normal multi-chunk build does NOT open from `file://` — module/CORS/asset-path limits — so the single-file build is a hard requirement, not a nice-to-have.)* The UI shows an honest **"offline demo — cached responses"** badge; an optional "use your own key" field enables live free-form AI locally.

**What the builder/deployer needs:** Node + npm; one free `GEMINI_API_KEY` (for local live testing); a free Vercel account (for the hosted URL). The repo is included for code review.

**Stack implication:** the frontend is a **static-exportable SPA** with a **single-file inline build target** for the offline artifact. The live path uses **one serverless function** that exposes both handlers (`/api/ask` for NL→spec+narration; `/api/query` for deterministic spec execution); in the offline build, `/api/query` runs **client-side** against the inlined cube and `/api/ask` is replaced by the cached-answer module. Same `QuerySpec`/`QueryResult` contracts either way.

**Logging in both modes:** live = inputs logged server-side in the function (the credible "all AI inputs logged" path); offline = the glass box replays the **real captured logs** from when the cached answers were generated. Same `AIEvent` shape; honestly labeled.

**Reliability + honesty notes (state in README):** pin `gemini-2.5-flash` (a bare "flash" alias can resolve to a retired model). Gemini free tier has **no SLA** and quotas can change — so the "what breaks" story is explicit: if live AI 429s/errs, the **cached offline build is the backstop** and the **adapter can swap to Groq/OpenRouter**. Free-tier rate limits are ample for grading; free-tier inputs may be used by the provider for product improvement (fine — public data). Offline mode is labeled **"cached responses"**; an off-list free-text question shows a clear **"enter a key for live answers"** state (never a fake answer), and replayed events carry a `cached:true` flag in the glass box. "Double-click the bundled `plainsight-offline.html`" is the promise; `npx serve dist` is the documented fallback.

---

*Spec authored during a brainstorming session that included two rounds of independent multi-agent review (question-space coverage; dashboard completeness) and four agents on stack/creative direction, plus direct analysis of goldenanalytics.com's brand and product UI.*
