# Plainsight — AI Collaboration Log

This document records the moments during development where human judgment redirected the AI. It is written as an engineer's log, not a marketing narrative. The evaluator for this project is a world-class BI and product expert; these records are meant to be legible to someone who has seen a lot of AI-assisted work and knows the difference between a genuine redirection and a fabricated one.

The AI-Fluency rubric asks specifically for documented moments where the AI produced something wrong or insufficient and a human caught and corrected it. These are those moments.

---

## Moment 1 — The FMonth Fiscal Trap (headline)

**Date:** 2026-05-31
**Step:** Data design / spec review
**Severity:** Would have silently corrupted every time-series view in the app

### What happened

When examining the dataset schema, the initial assumption — shared by both the human analyst and the AI working on the data model — was that the `FMonth` column represented calendar months 1 through 12. This is what the column name suggests and what the values look like at a glance when skimming the first sheet. The AI drafted a schema comment reading: "FMonth: integer 1–12, month of fiscal year."

### The adversarial check

Before any data code was written, an explicit adversarial verification step was run against the real file: what are the actual distinct values of `FMonth` per fiscal year? The result:

```
FY2022: FMonth values = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}   ← looks fine
FY2023: FMonth values = {13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24}  ← not 1–12
```

`FMonth` is **not a month of year**. It is a cumulative sequence across the entire 2021–23 biennium. FY2022 occupies positions 1–12; FY2023 occupies positions 13–24. The column is a biennium-position counter.

### Why this matters for a non-technical user

A non-technical user cannot catch this. They see a line chart labeled "Monthly spending trend" and trust that October 2022 and October 2023 are plotted on the same axis position. If `FMonth` had been treated as calendar month 1–12:

- FY2023's month 13 would have been decoded as calendar month 1 (January) — wrong by a whole year
- Every month in FY2023 would be mislabeled, shifted 12 positions back
- Year-over-year comparison views would show "January 2022 vs January 2023" when both data points were actually from different FMonths entirely
- Seasonality analysis would be completely fabricated

The failure mode is particularly dangerous because the numbers would be real — they would just be attached to the wrong time period. A journalist citing "spending spiked in Q1 2023" could be reporting a number that actually describes Q1 2022 data labeled as 2023.

### The fix

```
calMonth = ((FMonth - 1) % 12) + 1
```

This is a one-liner in `scripts/transform.ts`. Additionally:

1. **Build-time assertion** added to `scripts/build-data.ts`: throws if any FY2022 row has a derived calendar month outside {1..12} or any FY2023 row uses a raw FMonth outside {13..24}. The data build fails loudly if the assumption is violated in a future data export.
2. **QuerySpec contract updated**: `filters.monthRange` is explicitly documented as "calendar months 1..12 (derived; NOT raw FMonth 1..24)" — the distinction is frozen into the type definition.
3. **UI caveat**: the provenance strip notes "FMonth was a 1–24 biennium counter; calendar months derived as ((FMonth-1)%12)+1."

### What the AI produced vs. what was correct

```
INITIAL AI OUTPUT (data model comment):
  FMonth: integer 1–12, month of fiscal year

CORRECT VALUE (verified against real file):
  FMonth: integer 1–24, cumulative biennium position
  FY2022 = FMonth 1–12; FY2023 = FMonth 13–24
  Calendar month = ((FMonth-1) % 12) + 1
```

The AI was not wrong because it reasoned poorly. It was wrong because no model can know the idiosyncratic encoding choices of a specific Washington State Power Query extract. The correct response to this class of data quirk is adversarial verification before writing any transform code, not trusting the column name.

---

## Moment 2 — Architecture Redirect: from LLM-Generated SQL to Validated QuerySpec

**Date:** 2026-05-31
**Step:** Architecture design / AI layer
**Severity:** Would have made the trust story indefensible

### The obvious path

The most natural way to build "ask a question, get a chart" is to let the LLM write a SQL query directly against the dataset. It works immediately in a demo. It is what most prototypes do.

### The redirect

**Prompt to the AI (paraphrased):** "Design the AI layer for this spending explorer. The user types a question; the AI produces a query against the dataset."

**Initial AI output (paraphrased):** A design where the LLM generates a SQL string from the user's natural language question, the SQL is executed against DuckDB, and the result is rendered.

**Problem identified:** LLM-generated SQL has no auditability boundary. The AI can produce a number — by writing `SUM(...)` in the SQL. If the SQL is wrong (wrong filter, wrong aggregation), the number is wrong and nothing caught it. More critically for a non-technical user trust story: there is no way to show them "here is exactly how this number was computed" in terms they can verify. The glass-box becomes "here is some SQL the AI wrote" — which is not legible to a citizen or journalist.

**Redirect applied:** The AI emits a **validated `QuerySpec`** — a small, closed, declarative JSON object describing intent (rank/trend/breakdown/compare/total/profile), measure, aggregation type, filters, and grouping. The `QuerySpec` is data, not code. A **separate, deterministic engine** translates the spec into SQL via `specToSql(spec)` — a pure function with tests. The engine executes the SQL; the AI never touches the result.

**Why this is a different architecture, not just a style choice:**
- The AI cannot produce a number. The `QuerySpec` has no `value` field. It describes a question; the engine answers it.
- Prompt injection is structurally blocked: a malicious question can at worst cause the AI to emit a `QuerySpec` that the Zod validator rejects, or a `refuse` response.
- "Show the SQL" is honest: the SQL shown in the UI is generated by the same `specToSql` function that executed the query — they are literally the same string.
- The spec is portable: the same `QuerySpec` runs client-side against the cube JSON or server-side against the parquet. Same question, same answer, different executor.

**The cost stated explicitly:** less raw flexibility. A question that doesn't fit the `QuerySpec` vocabulary (e.g., "compute a 3-month rolling average with a seasonal adjustment") gets a `clarify` response, not an inventive SQL answer. We judged this cost acceptable because the trust story requires it.

---

## Moment 3 — No-Forecasting Redirect

**Date:** 2026-05-31
**Step:** Feature design / scope
**Severity:** Would have introduced confidently wrong outputs

### The request

During feature scoping, a forecast or projection feature was raised: "show what FY2024 spending might look like based on the trend." It is a compelling demo feature. "AI predicts next year's state spending" is the kind of headline that gets attention.

### The redirect

**Problem stated:** Two fiscal years of data define a single year-over-year change. They do not validate a trend. A regression line through two points has infinite confidence intervals — literally any slope fits. A forecast built on this data is statistically indefensible.

**The failure mode is specific:** a journalist or councilmember who cites the forecast figure has no way to know it was produced from two data points. The number looks authoritative because the AI produced it from "real data." The actual signal-to-noise ratio is near zero.

**Redirect applied:** No forecasting. Replaced with an explicit FY2022 vs FY2023 comparison mode (year-over-year delta, movers/fallers view) that is honest about what the data supports. Added a "What this data can't tell you" panel that lists "no credible forecast: 2 fiscal years of data" as a permanent, visible limit.

**What the AI initially produced:** A feature suggestion for a trend line extended 12 months forward with a confidence band.

**What shipped:** A `yoy_delta` aggregation type in the `QuerySpec`, a "What Changed" tab, and an explicit non-goal statement in the provenance strip and README.

The principle applied here: honest refusal is a feature, not a missing feature. The goal is a non-technical user who can trust what they read. A confidently wrong projection destroys that trust faster than any missing feature.

---

## Moment 4 — Design Direction: Correcting the Dark Gradient AI-Slop Theme

**Date:** 2026-05-31
**Step:** Visual design / UI direction
**Severity:** Would have failed the product resonance test with the evaluator

### The initial output

When the AI drafted initial UI mockups and component styling, the default direction was a dark-mode dashboard with gradient fills, glowing cards, and orange/blue accent colors. This is the aesthetic that AI-generated BI demos tend to produce because it matches the training distribution of "impressive-looking dashboards."

### The redirect

**Context provided to the AI:** The evaluator is Golden Analytics, founded by François Ajenstat. Golden Analytics' actual product UI (not their marketing site) is light, warm, and editorial-clean — warm paper background, flat fills, generous whitespace, Barlow typeface, no gradients. The visual language is closer to the Financial Times or a well-designed printed report than to a dark-mode SaaS dashboard.

**Explicit redirect:** Study the actual Golden Analytics product screenshots and the [golden analytics home page]. Apply their design language: warm paper canvas (`#f4f2ec`), white cards with hairline borders (`#e9e5da`), flat palette (lead orange `#ef6a1e`, sage `#8a9b4e`, gold `#f3ad36`, brick `#b23a26`), Barlow for UI text, IBM Plex Mono for financial figures. Orange used as a scalpel — for a single highlight element — not as a wash across the page. No gradients anywhere.

**What the AI produced initially:** Dark background, gradient chart fills, glowing KPI cards.

**What shipped:** Light warm canvas, flat fills, hairline borders, Barlow/IBM Plex Mono type pairing, orange used only at the primary action level. Plain-English question subtitles on every chart (Golden's own product pattern). "Explain ›" as a text affordance rather than a sparkle icon.

**Why this matters beyond aesthetics:** The evaluator is a world-class product designer. Shipping a generic AI-slop theme to François Ajenstat would signal that no one looked at Golden's actual product. Studying and resonating with their real product UI — while maintaining a distinct Plainsight identity — is the correct product judgment call.
