/**
 * T5.5 — compileSpec.ts
 *
 * compileSpec(text, { llm, dims, vendorMap, traceId, log }):
 *   Promise<AskResponse | { kind: 'spec', spec: QuerySpec }>
 *
 * Flow:
 * 1. Call governed LLM with forced function choice
 * 2. If emit_query_spec:
 *    a. Resolve free-text vendor names via resolveVendor → inject vendorIds
 *    b. validateSpec
 *    c. On validation error → ONE repair re-call with error appended
 *    d. If repair also invalid → return clarify
 * 3. If refuse → return refuse AskResponse
 * 4. If clarify → return clarify AskResponse
 */

import type { AskResponse, Dimensions, LogApi, QuerySpec } from '../../../contracts';
import { validateSpec } from '../query/validateSpec';
import { resolveVendor, type VendorMap } from './resolveVendor';
import { createGovernedClient } from './governedClient';
import { createLog } from './log';
import { COMPILE_SYSTEM_PROMPT, FUNCTION_DECLARATIONS } from './prompts';
import type { LLM } from './llm';

export interface CompileSpecOptions {
  llm: LLM;
  dims: Dimensions;
  vendorMap: VendorMap;
  traceId: string;
  log?: LogApi;
}

export type CompileSpecResult = AskResponse | { kind: 'spec'; spec: QuerySpec };

// ---------------------------------------------------------------------------
// Vendor resolution helper
// ---------------------------------------------------------------------------

/**
 * Resolve free-text vendor names from filters to canonical vendorIds.
 * Returns the resolved vendorIds + any chips for ambiguous vendors.
 */
function resolveVendorFilters(
  rawFilters: QuerySpec['filters'] & { vendor?: string[] },
  vendorMap: VendorMap
): {
  vendorIds: string[];
  chips: { label: string; spec?: QuerySpec }[];
} {
  const rawVendors: string[] = (rawFilters as Record<string, unknown>)['vendor'] as string[] | undefined ?? [];
  const vendorIds: string[] = rawFilters.vendorIds ?? [];
  const chips: { label: string; spec?: QuerySpec }[] = [];

  for (const vendorText of rawVendors) {
    const resolved = resolveVendor(vendorText, vendorMap);
    if (resolved.auto) {
      vendorIds.push(resolved.auto.vendorId);
    } else if (resolved.chips) {
      chips.push(...resolved.chips.map(c => ({ label: c.label })));
    }
  }

  return { vendorIds, chips };
}

// ---------------------------------------------------------------------------
// Parse a function call response into a QuerySpec + vendor resolution
// ---------------------------------------------------------------------------

function parseEmitQuerySpec(
  args: unknown,
  vendorMap: VendorMap
): {
  spec: Partial<QuerySpec>;
  vendorChips: { label: string; spec?: QuerySpec }[];
} {
  const raw = args as QuerySpec & { filters?: QuerySpec['filters'] & { vendor?: string[] } };

  // Resolve vendor filters
  const filters = raw.filters ?? {};
  const { vendorIds, chips } = resolveVendorFilters(filters, vendorMap);

  // Build the cleaned filters (drop vendor text, add vendorIds)
  const cleanedFilters = { ...filters };
  delete (cleanedFilters as Record<string, unknown>)['vendor'];
  if (vendorIds.length > 0) {
    cleanedFilters.vendorIds = vendorIds;
  }

  const spec: Partial<QuerySpec> = {
    ...raw,
    filters: cleanedFilters,
  };

  return { spec, vendorChips: chips };
}

// ---------------------------------------------------------------------------
// Build clarify AskResponse
// ---------------------------------------------------------------------------

function buildClarifyResponse(args: unknown): AskResponse {
  const a = args as { question?: string; options?: string[] };
  const options = a.options ?? [];
  return {
    kind: 'clarify',
    chips: options.map(o => ({ label: o })),
  };
}

// ---------------------------------------------------------------------------
// Build refuse AskResponse
// ---------------------------------------------------------------------------

function buildRefuseResponse(args: unknown): AskResponse {
  const a = args as { category?: string; redirect?: string };
  return {
    kind: 'refuse',
    category: (a.category ?? 'causal') as AskResponse extends { kind: 'refuse' } ? AskResponse['category'] : never,
    redirect: a.redirect ?? 'I can only show Washington State spending data.',
  };
}

// ---------------------------------------------------------------------------
// Main compileSpec
// ---------------------------------------------------------------------------

export async function compileSpec(
  text: string,
  options: CompileSpecOptions
): Promise<CompileSpecResult> {
  const { llm, dims, vendorMap, traceId } = options;
  const log = options.log ?? createLog();

  const client = createGovernedClient(llm, log, traceId);

  // ── First attempt ────────────────────────────────────────────────────────────
  const firstCall = await client.compileFunctions(
    COMPILE_SYSTEM_PROMPT,
    text,
    FUNCTION_DECLARATIONS,
    'compile'
  );

  // Handle text (fallback, shouldn't happen with forced function calling)
  if ('text' in firstCall) {
    return {
      kind: 'clarify',
      chips: [{ label: 'Can you rephrase your question?' }],
    };
  }

  const { name: fnName, args } = firstCall as { name: string; args: unknown };

  // ── refuse ────────────────────────────────────────────────────────────────────
  if (fnName === 'refuse') {
    // Log the refuse step
    const refuseEvent = {
      traceId,
      ts: new Date().toISOString(),
      step: 'refuse' as const,
      userAction: text,
      input: { rawText: text },
      output: args,
    };
    log.append(refuseEvent);
    return buildRefuseResponse(args);
  }

  // ── clarify ───────────────────────────────────────────────────────────────────
  if (fnName === 'clarify') {
    return buildClarifyResponse(args);
  }

  // ── emit_query_spec ───────────────────────────────────────────────────────────
  if (fnName === 'emit_query_spec') {
    const { spec: rawSpec, vendorChips } = parseEmitQuerySpec(args, vendorMap);

    // If vendor resolution produced ambiguous chips, ask to clarify
    if (vendorChips.length > 0) {
      return {
        kind: 'clarify',
        chips: vendorChips.length > 0
          ? vendorChips
          : [{ label: 'Which vendor did you mean?' }],
      };
    }

    // Validate the spec
    const validation = validateSpec(rawSpec as QuerySpec, dims);

    if (validation.ok) {
      return { kind: 'spec', spec: validation.spec };
    }

    // ── Repair attempt ──────────────────────────────────────────────────────────
    const errorDescription = `Validation failed: ${validation.error.message} (field: ${validation.error.field}, code: ${validation.error.code})`;
    const repairText = `${text}\n\nPrevious attempt was invalid. Error: ${errorDescription}. Please fix and re-emit.`;

    const repairCall = await client.compileFunctions(
      COMPILE_SYSTEM_PROMPT,
      repairText,
      FUNCTION_DECLARATIONS,
      'repair'
    );

    // Handle text fallback
    if ('text' in repairCall) {
      return {
        kind: 'clarify',
        chips: [{ label: 'Could you clarify what you are looking for?' }],
      };
    }

    const { name: repairFnName, args: repairArgs } = repairCall as { name: string; args: unknown };

    if (repairFnName === 'refuse') {
      const refuseEvent = {
        traceId,
        ts: new Date().toISOString(),
        step: 'refuse' as const,
        userAction: text,
        input: { rawText: repairText },
        output: repairArgs,
      };
      log.append(refuseEvent);
      return buildRefuseResponse(repairArgs);
    }

    if (repairFnName === 'clarify') {
      return buildClarifyResponse(repairArgs);
    }

    if (repairFnName === 'emit_query_spec') {
      const { spec: repairedSpec, vendorChips: repairedChips } = parseEmitQuerySpec(repairArgs, vendorMap);

      if (repairedChips.length > 0) {
        return { kind: 'clarify', chips: repairedChips };
      }

      const repairValidation = validateSpec(repairedSpec as QuerySpec, dims);
      if (repairValidation.ok) {
        return { kind: 'spec', spec: repairValidation.spec };
      }
    }

    // Still invalid after repair → return clarify
    return {
      kind: 'clarify',
      chips: [{ label: 'Could not understand the query. Try rephrasing.' }],
    };
  }

  // Unknown function name → clarify
  return {
    kind: 'clarify',
    chips: [{ label: 'Unexpected response. Please try again.' }],
  };
}
