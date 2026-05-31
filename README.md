# Plainsight — WA Vendor Spending Explorer

**Live URL:** *(TBD — Phase D Vercel deploy will fill this)*


---

## 1. What this is / who it's for

Plainsight is a web app that lets a **non-technical person** — a citizen, journalist, councilmember, or analyst — ask almost anything about Washington State's vendor spending in plain English and trust every number they see. It covers 935,853 rows of real government payment data spanning fiscal years 2022 and 2023, totaling approximately $63.2 billion, with zero SQL required and a glass-box that shows exactly how each answer was produced. It was built for Golden Analytics' "Turn Business Data Into Answers" challenge, and every design decision was made with François Ajenstat's thesis in mind: *raw data to a shared answer in two clicks*.

---

## 2. The core loop

```
User question (typed, chip, or chart click)
        │
        ▼
[1] COMPILE  ── Gemini Flash (function-calling) ──► validated QuerySpec     ← logged
        │        (or a `refuse` / `clarify` response — first-class outcomes)
        ▼
[2] VALIDATE ── Zod + dimension enum checks ──► typed error if invalid; 1 repair retry
        │
        ▼
[3] COMPUTE  ── the ENGINE runs the aggregation on real data. NO AI HERE.  ← numbers born here
        │        cube.json for dashboard slices; serverless /api/query
        │        (DuckDB over 935,853-row parquet) for arbitrary questions
        ▼
[4] RENDER   ── a fixed, themed ECharts kit renders the result
        │
        ▼
[5] NARRATE  ── ON DEMAND only (user clicks "Explain"): Gemini Flash        ← logged
                 sees ONLY the computed result rows; a deterministic
                 numberGuard drops any figure not traceable to the data.
```

**The AI is the interface and the explainer — never the source of truth. The number is always produced by deterministic code in step [3]. A deterministic `numberGuard` drops any figure the narration contains that it cannot trace to the computed result — silently, without drama, fail-closed.**

---

## 3. Two ways to run it (zero-config for the grader)

### Option A — Live hosted URL (nothing to install)
Click the link above. Full live AI via a free Gemini key held server-side. Zero install, zero config, zero cost to you.

### Option B — Offline: double-click the HTML
Download `plainsight-offline.html` from [GitHub Releases](../../releases). Double-click it — no server, no key, no network. The data cube and a set of curated AI answers are inlined into the single file; a badge marks it **"offline demo — cached responses."** An "enter your own Gemini key" field in the UI enables live free-form questions locally.

> Why a single file? A normal multi-chunk build does not open from `file://` (browser module/CORS restrictions). `vite-plugin-singlefile` inlines all JS, CSS, and data so the double-click guarantee is real, not aspirational.

### Option C — Local dev
```bash
cd app
npm install
npm run dev          # http://localhost:5173
```
Live AI needs a free `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/):
```
# app/.env
GEMINI_API_KEY=your_key_here
```
Then run `vercel dev` (instead of `npm run dev`) to get the `/api/ask` and `/api/query` serverless routes, which is where the key is read server-side.

**Data build** (only needed if you change the source data):
```bash
npm run build:data   # requires Vendor-Payments_2021-23.xlsx in the repo root
```
Generated files in `app/public/data/` are committed so Vercel builds without the xlsx.

---

## 4. Explicit trade-offs

These are real choices with real costs, not post-hoc rationale.

**Trade-off 1 — Structured QuerySpec over LLM-generated SQL**
We chose a small, closed, declarative `QuerySpec` JSON (the AI emits this) over letting the LLM write SQL directly. The benefit: every query is auditable, refusable, portable (same spec runs in-browser against the cube or server-side against the parquet), and prompt-injection is structurally blocked (the spec is data, not code). The cost: less raw flexibility — a question that doesn't fit the spec's vocabulary will get a `clarify` response rather than an inventive SQL answer. We judged auditability non-negotiable for a trust story.

**Trade-off 2 — AI never computes numbers; deterministic engine + numberGuard**
We chose to make the AI architecturally incapable of being the source of a number. The engine always computes; the narrator only describes. A deterministic guard rejects any figure in the narration that doesn't trace back to the computed rows. The benefit: a non-technical user can trust what they read. The cost: more plumbing — two separate passes (compute, then optionally narrate), a guard to maintain, and narration that sometimes reads slightly terse when sentences are dropped. Worth it.

**Trade-off 3 — Free Gemini Flash behind a provider-agnostic adapter**
We chose a single fast free model (`gemini-2.5-flash`) behind a thin provider-agnostic adapter over a paid two-tier (e.g., Gemini Pro for compilation, Flash for narration) setup. The benefit: $0 cost, and model correctness is irrelevant — the spec architecture guarantees right numbers regardless of which model compiled the query. The adapter means we can swap to Groq or OpenRouter with one env var if Gemini free-tier quotas tighten. The cost: an extra abstraction layer; Gemini free tier has no SLA.

**Trade-off 4 — Serverless query route as primary executor; DuckDB-WASM optional**
We chose reliability over the "no server" wow. The serverless route (`/api/query`, DuckDB-on-Node over parquet) is the default and is also the production architecture — same `QuerySpec`→SQL contract. DuckDB-WASM is built as an optional in-browser backend behind the same interface. The benefit: the demo never depends on COOP/COEP headers, browser memory limits, or cold-start latency. The cost: the offline HTML uses a pre-aggregated cube (not the full 935,853-row parquet), so deeply arbitrary vendor-level questions in offline mode require a user-supplied key.

**Trade-off 5 — No forecasting**
We chose not to add a forecast feature on two fiscal years of data. Two data points define a line; they do not validate a trend. A forecast would be confidently wrong and would invite a journalist or councilmember to cite a number we have no business asserting. The benefit: honesty. The cost: a feature that would look impressive in a demo. We replaced it with an explicit FY-vs-FY year-over-year comparison and a stated non-goal in the limits panel.

---

## 5. AI-collaboration log

See [`docs/AI-LOG.md`](docs/AI-LOG.md) for the full documented AI collaboration — the moments where the human redirected the AI, with verbatim prompt → bad-output → fix records.

**The headline moment — the FMonth fiscal trap:**
The dataset's `FMonth` column looks like a month number. It is not. It runs 1 through 24, cumulative across the two-year biennium: FY2022 = months 1–12, FY2023 = months 13–24. An adversarial check against the real Excel file caught this before any user-facing code was written. Had it slipped through, every monthly trend line, every YoY seasonality view, and every "what happened in March?" answer would have been silently and plausibly wrong — off by a year, or treating two different Octobers as the same one. The fix is a one-liner (`calMonth = ((FMonth-1) % 12) + 1`), a build-time assertion, and a UI caveat. The story of how this was caught — and why the architecture was set up to catch it — is the most honest thing in this submission. Full narrative in `docs/AI-LOG.md`.

---

## 6. Prototype → production gaps

This is a proof-of-concept. Here is what breaks or needs replacing before this is production software:

**Infrastructure and pipeline**
- ETL/data pipeline: static one-time build → scheduled ingestion, cube rebuild, and schema-drift/enum sync with each new data export
- Query executor: serverless DuckDB-on-Node → hosted Postgres at scale, with the same `QuerySpec`→SQL contract (the seam already exists)

**Security and multi-tenancy**
- Auth and multi-tenant: none today; the design supports injecting a tenant predicate into the `QuerySpec` at the API layer — the contract has a `filters` object that's the natural injection point
- Row-level security: follows from the tenant predicate; each query's `WHERE` clause would include an agency/role scope
- PII/redaction: not applicable to this public dataset, but the pattern would touch the narration output and the glass-box log
- Prompt injection: structurally de-risked (the AI emits a `QuerySpec`, not SQL or code); add rate-limiting and adversarial eval for completeness

**Reliability and operations**
- Caching: prompt cache on the static system prompt + dimension enums (already noted as a prod optimization); spec-keyed result cache to avoid redundant DuckDB queries
- Observability and eval: the NDJSON AI event log is the eval corpus; add faithfulness scoring, a spec-compiler golden-set regression, and model-upgrade canaries
- Cost controls: session meter → per-user budgets and tier routing (Flash for compilation, Gemini Pro for complex narration)
- Large-data scaling: in-browser cube has a memory ceiling; push further pre-aggregation or stream results from the server

**Future AI value**
- Multi-turn conversational drill-down (the spec is already designed for incremental filter addition)
- NL dashboard authoring: the `QuerySpec` is a serializable dashboard definition — "show me agency spending by month" could emit a saveable layout
- Anomaly-watch alerts: a cron job that runs a fixed set of specs and narrates only when something changed materially
- Learned follow-ups from the question corpus: the glass-box log is the training signal

---

## 7. Data notes and honest limits

**What the data is:**
- 935,853 monthly aggregate rows; two sheets (FY2022: 451,029 rows; FY2023: 484,824 rows)
- Grain: one row per (FY, FMonth, Agency, Object, SubObject, Vendor); pre-aggregated BI extract, not invoice-level
- Total: approximately $63.2 billion reconciled across both fiscal years
- 1,083 negative rows (refunds and reversals); surfaced via a gross/net toggle — never silently hidden
- Vendor names are unnormalized; the app lightly canonicalizes them (uppercase, strip punctuation, collapse LLC/INC/CORP suffixes) but near-duplicate name groups remain

**The FMonth quirk (the signature data-craft catch):**
`FMonth` runs 1–24 cumulative across the biennium. FY2022 = months 1–12; FY2023 = months 13–24. Calendar month is derived as `((FMonth-1) % 12) + 1`. A build-time assertion verifies this at every data build. Every time axis in the app uses the derived calendar month, not the raw `FMonth`.

**What this data cannot tell you:**
- No geography or per-capita breakdown (no county/city/district split)
- No budget-vs-actual (this is payments only, not appropriations)
- No vendor type, purpose, or contract details (category and subcategory are accounting codes)
- No causal "why" (the data is a financial summary, not an audit trail)
- No credible forecast: two fiscal years define a comparison, not a trend; forecasting is a stated non-goal

---

## 8. Tech stack and architecture

| Layer | Technology |
|---|---|
| Frontend | Vite + React + TypeScript |
| Charts | Apache ECharts (themed: warm flat palette, Barlow, IBM Plex Mono) |
| Data query | DuckDB (Node, in serverless function) over a 935,853-row Parquet file |
| AI | Google Gemini `gemini-2.5-flash` (free tier) behind a provider-agnostic adapter |
| Schema validation | Zod |
| Detail table | TanStack Table + Virtual |
| Hosting | Vercel (one serverless function: `/api/ask` + `/api/query`) |
| Offline build | `vite-plugin-singlefile` |

**The `contracts/` module is the frozen seam.** `QuerySpec`, `QueryResult`, `ChartProps`, `AIEvent`, `Cube`, `Dimensions` — all defined once, all workstreams import them. No workstream invents its own shape.

**The trust features visible in the UI:**
- **Glass-box AI activity log** — every model call is logged with its input, output, token count, latency, and a plain-English description; an Engineer toggle shows raw JSON
- **"Show the SQL"** — `specToSql(spec)` is a pure deterministic function; the same SQL string is used for both execution and display, so what you see is what ran
- **Deterministic Replay** — re-running a stored spec through the engine produces a bit-for-bit identical result; the Replay button verifies this on demand
- **Permalink** — the URL hash encodes the `QuerySpec`; sharing a link shares the exact query, not a screenshot

---

## 9. How this was built

This project was built from a detailed design spec using a contracts-first, parallel AI-agent methodology. The spec froze the `QuerySpec` contract, all shared type definitions, and the theme tokens before any implementation began. Eight workstreams then ran in parallel, each building against the frozen contracts and checked-in fixtures representing real data shapes. Independent multi-agent review ran at each integration step — never self-review.

The AI-fluency story is not incidental. The FMonth fiscal trap (section 5 above), the architecture redirect from LLM-generated SQL to a validated spec, and the no-forecasting decision were all real redirections that happened during the build and are documented with specifics in `docs/AI-LOG.md`. The AI-collaboration log is not a retrospective summary — it was captured live, as the build happened.
