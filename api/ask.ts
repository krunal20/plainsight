/**
 * T5.7 — api/ask.ts
 *
 * Vercel Node handler: POST /api/ask
 * Body: { text: string; explain?: boolean }
 * Response: AskResponse
 *
 * Flow:
 * 1. Generate ONE traceId for the request
 * 2. Parse { text }
 * 3. Build live deps (geminiLLM via governedClient; load dimensions.json + vendors.json SERVER-SIDE)
 * 4. compileSpec → if spec, runSqlQuery → optionally narrate (if explain=1)
 * 5. Return AskResponse { kind:'spec', result, interpretation, followups }
 *    OR the clarify/refuse AskResponse from compileSpec
 * 6. Log every step under the shared traceId
 *
 * interpretation = deterministic plain-English read-back of the spec (NOT model prose)
 * followups = 2-3 sensible related QuerySpecs (deterministic)
 *
 * IMPORTANT: vendors.json is SERVER-ONLY — loaded with fs, never bundled into client.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type { AskResponse, QuerySpec, LogApi } from '../contracts';
import type { LLM } from '../src/lib/ai/llm';
import { geminiLLM } from '../src/lib/ai/llm';
import { createLog } from '../src/lib/ai/log';
import { compileSpec } from '../src/lib/ai/compileSpec';
import { narrate } from '../src/lib/ai/narrate';
import { runSqlQuery } from './query';

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIMS_PATH    = resolve(__dirname, '..', 'public', 'data', 'dimensions.json');
const VENDORS_PATH = resolve(__dirname, '..', 'public', 'data', 'vendors.json');

// ---------------------------------------------------------------------------
// Deterministic interpretation of a QuerySpec
// ---------------------------------------------------------------------------
export function buildInterpretation(spec: QuerySpec): string {
  const parts: string[] = [];

  // Measure + agg
  const aggLabels: Record<string, string> = {
    sum: 'Sum',
    avg: 'Average',
    count: 'Count',
    distinct_count: 'Distinct Count',
    share: 'Share (%)',
    yoy_delta: 'YoY Delta',
  };
  parts.push(`${aggLabels[spec.agg] ?? spec.agg} of ${spec.measure}`);

  // GroupBy
  if (spec.groupBy) {
    const dimLabels: Record<string, string> = {
      agency: 'by Agency',
      category: 'by Category',
      subcategory: 'by Subcategory',
      vendor: 'by Vendor',
      fy: 'by Fiscal Year',
      month: 'by Month',
    };
    parts.push(dimLabels[spec.groupBy] ?? `by ${spec.groupBy}`);
  }

  // Filters
  if (spec.filters.fy?.length) {
    parts.push(`FY${spec.filters.fy.join('/')}`);
  }
  if (spec.filters.agency?.length) {
    parts.push(`Agency: ${spec.filters.agency.join(', ')}`);
  }
  if (spec.filters.category?.length) {
    parts.push(`Category: ${spec.filters.category.join(', ')}`);
  }
  if (spec.filters.vendorIds?.length) {
    parts.push(`Vendor IDs: ${spec.filters.vendorIds.join(', ')}`);
  }

  // TopN
  if (spec.topN) {
    parts.push(`top ${spec.topN}`);
  }

  // Sort
  if (spec.sort) {
    parts.push(`sorted by ${spec.sort.by} ${spec.sort.dir}`);
  }

  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Deterministic followup specs (2-3 related queries)
// ---------------------------------------------------------------------------
export function buildFollowups(spec: QuerySpec): QuerySpec[] {
  const followups: QuerySpec[] = [];

  // Followup 1: Trend over time (if not already trending)
  if (spec.intent !== 'trend') {
    followups.push({
      ...spec,
      intent: 'trend',
      groupBy: 'fy',
      chart: 'line',
      topN: undefined,
      sort: { by: 'label', dir: 'asc' },
    });
  }

  // Followup 2: Category breakdown (if not already by category)
  if (spec.groupBy !== 'category') {
    followups.push({
      ...spec,
      intent: 'breakdown',
      groupBy: 'category',
      chart: 'treemap',
      topN: 10,
      sort: { by: 'measure', dir: 'desc' },
    });
  }

  // Followup 3: Gross vs net comparison (if currently net)
  if (spec.netGross === 'net') {
    followups.push({
      ...spec,
      netGross: 'gross',
      intent: 'rank',
      chart: 'bar',
    });
  }

  return followups.slice(0, 3);
}

// ---------------------------------------------------------------------------
// buildAskHandler — testable core (dependency-injected)
// ---------------------------------------------------------------------------

export interface AskHandlerOptions {
  llm?: LLM;
  log?: LogApi;
}

export function buildAskHandler(options: AskHandlerOptions = {}) {
  return async function handleAsk(body: {
    text: string;
    explain?: boolean;
  }): Promise<AskResponse> {
    const traceId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const log = options.log ?? createLog();
    const llm = options.llm ?? geminiLLM();

    // Load dimensions SERVER-SIDE (synchronously via fs)
    let dims: import('../contracts').Dimensions;
    let vendorMap: Record<string, unknown>;
    try {
      const { readFileSync } = await import('fs');
      dims = JSON.parse(readFileSync(DIMS_PATH, 'utf8'));
      vendorMap = JSON.parse(readFileSync(VENDORS_PATH, 'utf8'));
    } catch {
      // In test environment, use empty fallbacks
      dims = { agency: [], category: [], subcategory: [] };
      vendorMap = {};
    }

    // Log the start of the request
    log.append({
      traceId,
      ts: new Date().toISOString(),
      step: 'compile',
      userAction: body.text,
      input: { rawText: body.text },
    });

    // compileSpec → returns either a spec or an AskResponse (clarify/refuse)
    const compileResult = await compileSpec(body.text, {
      llm,
      dims,
      vendorMap: vendorMap as Parameters<typeof compileSpec>[1]['vendorMap'],
      traceId,
      log,
    });

    // If clarify or refuse, return directly
    if (compileResult.kind === 'clarify' || compileResult.kind === 'refuse') {
      return compileResult;
    }

    // kind === 'spec': run the query
    const spec = compileResult.spec;

    log.append({
      traceId,
      ts: new Date().toISOString(),
      step: 'compute',
      userAction: body.text,
      input: { contextPayload: spec },
    });

    const result = await runSqlQuery(spec);
    // Inject the shared traceId
    (result as Record<string, unknown>).traceId = traceId;

    // Optionally narrate (only if explain=1)
    let interpretation: string;
    if (body.explain) {
      interpretation = await narrate(result, { llm, traceId, log });
    } else {
      interpretation = buildInterpretation(spec);
    }

    // Build deterministic followups
    const followups = buildFollowups(spec);

    return {
      kind: 'spec',
      result,
      interpretation,
      followups,
    };
  };
}

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------

interface Req {
  method?: string;
  body?: unknown;
  json?: () => Promise<unknown>;
  url?: string;
}

interface Res {
  status(code: number): Res;
  json(body: unknown): void;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: { text?: string; explain?: boolean };
  try {
    body = typeof req.json === 'function'
      ? await req.json()
      : (req.body as typeof body);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  if (!body?.text) {
    res.status(400).json({ error: 'Missing text' });
    return;
  }

  try {
    const handleAsk = buildAskHandler();
    const response = await handleAsk({ text: body.text, explain: body.explain });
    res.status(200).json(response);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
}
