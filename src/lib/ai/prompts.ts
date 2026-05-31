/**
 * T5.5 — prompts.ts
 *
 * System prompt and function declarations for compileSpec.
 * The three functions: emit_query_spec, refuse, clarify.
 */

import type { FunctionDeclaration } from './llm';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
export const COMPILE_SYSTEM_PROMPT = `
You are an AI assistant for Plainsight, a Washington State spending explorer.
You translate natural language questions into structured QuerySpec objects.

CRITICAL RULES:
1. You MUST call one of the provided functions — never respond with plain text.
2. NEVER invent or fabricate numbers. You are compiling a query, not answering it.
   The actual numbers will be computed by the query engine from verified data.
3. Use "emit_query_spec" when the user's intent is clear and maps to spending data.
4. Use "refuse" when the question asks for: causal explanations, invoice details,
   geographic breakdowns, budget predictions, or forecasts.
5. Use "clarify" when you need more information to compile an unambiguous query.

QUERYSPEC RULES:
- intent: one of rank, trend, breakdown, compare, total, profile
- measure: always "amount"
- agg: one of sum, avg, count, distinct_count, share, yoy_delta
- netGross: "net" (default) or "gross"
- filters.fy: only 2022 or 2023 are valid fiscal years in this dataset
- topN: max 50, default 10
- chart: choose the most appropriate chart type for the intent
  - rank → bar
  - trend → line
  - breakdown → treemap or donut
  - compare → bar
  - total → kpi
  - profile → table

DIMENSIONS AVAILABLE:
- agency: government agencies (e.g., "Health Care Authority", "DOT")
- category: spending categories (e.g., "professional-services", "it")
- subcategory: sub-categories
- vendor: specific vendors
- fy: fiscal year (2022 or 2023 only)
- month: calendar month (1–12)

When the user mentions a vendor name, include it in filters as the raw text —
the resolution system will handle fuzzy matching.
`.trim();

// ---------------------------------------------------------------------------
// Function declarations
// ---------------------------------------------------------------------------

export const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'emit_query_spec',
    description:
      'Emit a structured QuerySpec when the user intent is clear and maps to WA spending data.',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: ['rank', 'trend', 'breakdown', 'compare', 'total', 'profile'],
          description: 'The query intent',
        },
        measure: { type: 'string', enum: ['amount'], description: 'Always "amount"' },
        agg: {
          type: 'string',
          enum: ['sum', 'avg', 'count', 'distinct_count', 'share', 'yoy_delta'],
        },
        mode: { type: 'string', enum: ['abs', 'pct'], description: 'Only for yoy_delta' },
        netGross: { type: 'string', enum: ['net', 'gross'] },
        filters: {
          type: 'object',
          properties: {
            agency: { type: 'array', items: { type: 'string' } },
            category: { type: 'array', items: { type: 'string' } },
            subcategory: { type: 'array', items: { type: 'string' } },
            vendor: { type: 'array', items: { type: 'string' }, description: 'Free-text vendor names — will be resolved' },
            fy: { type: 'array', items: { type: 'number', enum: [2022, 2023] } },
          },
        },
        groupBy: {
          type: 'string',
          enum: ['agency', 'category', 'subcategory', 'vendor', 'fy', 'month'],
        },
        sort: {
          type: 'object',
          properties: {
            by: { type: 'string', enum: ['measure', 'label'] },
            dir: { type: 'string', enum: ['asc', 'desc'] },
          },
          required: ['by', 'dir'],
        },
        topN: { type: 'number', description: 'Max 50, default 10' },
        chart: {
          type: 'string',
          enum: ['kpi', 'bar', 'line', 'treemap', 'donut', 'heatmap', 'table'],
        },
      },
      required: ['intent', 'measure', 'agg', 'netGross', 'filters', 'chart'],
    },
  },
  {
    name: 'refuse',
    description:
      'Refuse the query when it asks for causal explanations, invoice details, geography, budget, or forecasts.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['causal', 'invoice', 'geography', 'budget', 'forecast'],
          description: 'Category of refusal',
        },
        redirect: {
          type: 'string',
          description: 'Helpful message redirecting the user to what IS available.',
        },
      },
      required: ['category', 'redirect'],
    },
  },
  {
    name: 'clarify',
    description:
      'Ask a clarifying question when the user intent is ambiguous.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The clarifying question to ask' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Suggested options for the user to choose from',
        },
      },
      required: ['question'],
    },
  },
];
