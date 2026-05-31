/**
 * T5.6 — narrate.ts
 *
 * narrate(result, { llm, traceId, log }): Promise<string>
 *
 * Calls llm.complete with a prompt containing ONLY result.rows + result.meta.
 * NEVER passes the full cube or raw data.
 * Passes output through numberGuard → returns cleaned text.
 * Every call logs one 'narrate' AIEvent.
 */

import type { QueryResult, LogApi } from '../../../contracts';
import type { LLM } from './llm';
import { createGovernedClient } from './governedClient';
import { createLog } from './log';
import { numberGuard } from './numberGuard';

export interface NarrateOptions {
  llm: LLM;
  traceId: string;
  log?: LogApi;
}

// ---------------------------------------------------------------------------
// Narration system prompt
// ---------------------------------------------------------------------------
const NARRATE_SYSTEM_PROMPT = `
You are a concise data narrator for Plainsight, a Washington State spending explorer.
Your job is to write 1-3 sentences of plain English summarizing the provided query result.

CRITICAL RULE: Every number you use MUST appear verbatim in the provided rows or meta totals.
DO NOT invent, estimate, or extrapolate any numbers. Only echo back numbers from the data.
If you cannot form a grounded sentence, say "The data shows the agencies listed above."
`.trim();

// ---------------------------------------------------------------------------
// Build the narration user prompt (rows + meta only, never full cube)
// ---------------------------------------------------------------------------
function buildNarratePrompt(result: QueryResult): string {
  const rowsText = result.rows
    .map(r => `  - ${r.label}: ${r.value}`)
    .join('\n');

  return `
Query result to narrate:

Rows:
${rowsText}

Meta:
  totalNet: ${result.meta.totalNet}
  totalGross: ${result.meta.totalGross}
  rowCount: ${result.meta.rowCount}
  truncated: ${result.meta.truncated}

Write 1-3 sentences summarizing this data. Use only the numbers above.
`.trim();
}

// ---------------------------------------------------------------------------
// narrate
// ---------------------------------------------------------------------------
export async function narrate(result: QueryResult, options: NarrateOptions): Promise<string> {
  const { llm, traceId } = options;
  const log = options.log ?? createLog();

  const client = createGovernedClient(llm, log, traceId);
  const prompt = buildNarratePrompt(result);

  const response = await client.complete(NARRATE_SYSTEM_PROMPT, prompt, 'narrate');

  // Pass through numberGuard — drop any sentences with ungrounded numbers
  const guardResult = numberGuard(response.text, result);
  return guardResult.cleaned;
}
