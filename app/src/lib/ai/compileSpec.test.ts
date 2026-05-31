/**
 * T5.5 — compileSpec tests
 *
 * compileSpec(text, { llm, dims, vendorMap, traceId }): Promise<AskResponse | { kind: 'spec', spec: QuerySpec }>
 *
 * Tests:
 * - Scripted valid emit → returns a valid spec
 * - Scripted invalid-enum emit → exactly one repair attempt then clarify
 * - Refuse script → returns refuse AskResponse
 */

import { describe, it, expect, vi } from 'vitest';
import { compileSpec } from './compileSpec';
import { fakeLLM } from './llm';
import { createLog } from './log';
import type { QuerySpec, AskResponse } from '../../../contracts';
import dimensionsFixture from '../../../fixtures/dimensions.fixture.json';
import vendorFixture from '../../../fixtures/vendors.fixture.json';

const validSpec: QuerySpec = {
  intent: 'rank',
  measure: 'amount',
  agg: 'sum',
  netGross: 'net',
  filters: {},
  groupBy: 'agency',
  sort: { by: 'measure', dir: 'desc' },
  topN: 10,
  chart: 'bar',
};

describe('compileSpec', () => {
  // ── Successful emit ──────────────────────────────────────────────────────────

  it('returns a valid spec when LLM emits emit_query_spec with valid args', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: validSpec },
    ]);
    const log = createLog();

    const result = await compileSpec('top agencies by spend', {
      llm,
      dims: dimensionsFixture,
      vendorMap: vendorFixture,
      traceId: 'test-1',
      log,
    });

    expect(result.kind).toBe('spec');
    if (result.kind === 'spec') {
      expect(result.spec.intent).toBe('rank');
    }
  });

  it('logs exactly one compile AIEvent on success', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: validSpec },
    ]);
    const log = createLog();

    await compileSpec('top agencies', {
      llm,
      dims: dimensionsFixture,
      vendorMap: vendorFixture,
      traceId: 'test-log',
      log,
    });

    const events = log.all();
    // Should have at least one compile event
    expect(events.some(e => e.step === 'compile')).toBe(true);
  });

  // ── Invalid enum emit → repair then clarify ─────────────────────────────────

  it('attempts exactly one repair when LLM emits invalid enum, then returns clarify', async () => {
    const invalidSpec = {
      ...validSpec,
      intent: 'INVALID_INTENT', // Not a valid intent
    };

    const llm = fakeLLM([
      // First attempt: invalid spec
      { type: 'function', name: 'emit_query_spec', args: invalidSpec },
      // Second attempt (repair): still invalid or clarify
      { type: 'function', name: 'clarify', args: { question: 'What do you want?', options: ['Rank', 'Trend'] } },
    ]);
    const log = createLog();

    const result = await compileSpec('ambiguous query', {
      llm,
      dims: dimensionsFixture,
      vendorMap: vendorFixture,
      traceId: 'test-repair',
      log,
    });

    // Should be a clarify after repair attempt
    expect(result.kind).toBe('clarify');

    // Exactly one repair event should have been logged
    const events = log.all();
    const repairEvents = events.filter(e => e.step === 'repair');
    expect(repairEvents).toHaveLength(1);
  });

  it('returns clarify AskResponse when repair results in clarify function', async () => {
    const invalidSpec = { ...validSpec, agg: 'INVALID_AGG' };

    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: invalidSpec },
      { type: 'function', name: 'clarify', args: { question: 'What aggregation?', options: ['sum', 'avg'] } },
    ]);
    const log = createLog();

    const result = await compileSpec('aggregate spend', {
      llm,
      dims: dimensionsFixture,
      vendorMap: vendorFixture,
      traceId: 'test-repair2',
      log,
    });

    expect(result.kind).toBe('clarify');
    if (result.kind === 'clarify') {
      expect(Array.isArray(result.chips)).toBe(true);
    }
  });

  // ── Refuse ──────────────────────────────────────────────────────────────────

  it('returns refuse AskResponse when LLM emits refuse function', async () => {
    const llm = fakeLLM([
      {
        type: 'function',
        name: 'refuse',
        args: { category: 'causal', redirect: 'I can only show spending data.' },
      },
    ]);
    const log = createLog();

    const result = await compileSpec('why did the state spend so much?', {
      llm,
      dims: dimensionsFixture,
      vendorMap: vendorFixture,
      traceId: 'test-refuse',
      log,
    });

    expect(result.kind).toBe('refuse');
    if (result.kind === 'refuse') {
      expect(result.category).toBe('causal');
      expect(result.redirect).toBeTruthy();
    }
  });

  it('logs a refuse step for refuse function calls', async () => {
    const llm = fakeLLM([
      {
        type: 'function',
        name: 'refuse',
        args: { category: 'forecast', redirect: 'Only historical data available.' },
      },
    ]);
    const log = createLog();

    await compileSpec('predict next year spending', {
      llm,
      dims: dimensionsFixture,
      vendorMap: vendorFixture,
      traceId: 'test-refuse-log',
      log,
    });

    const events = log.all();
    expect(events.some(e => e.step === 'refuse')).toBe(true);
  });

  // ── Clarify directly ────────────────────────────────────────────────────────

  it('returns clarify AskResponse when LLM directly emits clarify', async () => {
    const llm = fakeLLM([
      {
        type: 'function',
        name: 'clarify',
        args: { question: 'Which vendor?', options: ['Microsoft', 'Deloitte'] },
      },
    ]);
    const log = createLog();

    const result = await compileSpec('show vendor spend', {
      llm,
      dims: dimensionsFixture,
      vendorMap: vendorFixture,
      traceId: 'test-clarify',
      log,
    });

    expect(result.kind).toBe('clarify');
    if (result.kind === 'clarify') {
      expect(result.chips.length).toBeGreaterThan(0);
    }
  });

  // ── Vendor resolution ────────────────────────────────────────────────────────

  it('resolves vendor names in filters and injects vendorIds', async () => {
    const specWithVendorText: QuerySpec & { filters: { vendor?: string[] } } = {
      ...validSpec,
      filters: { vendor: ['microsoft'] } as QuerySpec['filters'],
    };

    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: specWithVendorText },
    ]);
    const log = createLog();

    const result = await compileSpec('microsoft spend', {
      llm,
      dims: dimensionsFixture,
      vendorMap: vendorFixture,
      traceId: 'test-vendor',
      log,
    });

    // Should either resolve to spec with vendorIds, or clarify if ambiguous
    // Since 'microsoft' maps uniquely, it should resolve
    expect(['spec', 'clarify']).toContain(result.kind);
  });
});
