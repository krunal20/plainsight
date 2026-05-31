/**
 * T5.3 — LLM adapter tests
 *
 * Tests fakeLLM for deterministic scripted responses.
 * No network calls, no real API key required.
 */

import { describe, it, expect } from 'vitest';
import { fakeLLM } from './llm';

describe('fakeLLM', () => {
  it('returns a scripted function call response from compileFunctions', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: { intent: 'rank' } },
    ]);
    const result = await llm.compileFunctions('sys', 'user', []);
    expect(result).toEqual({ name: 'emit_query_spec', args: { intent: 'rank' } });
  });

  it('returns a scripted text response from compileFunctions', async () => {
    const llm = fakeLLM([
      { type: 'text', text: 'I cannot answer that.' },
    ]);
    const result = await llm.compileFunctions('sys', 'user', []);
    expect(result).toEqual({ text: 'I cannot answer that.' });
  });

  it('returns a scripted complete response', async () => {
    const llm = fakeLLM([
      { type: 'complete', text: 'DSHS got $2.7M.', tokens: { input: 100, output: 20 } },
    ]);
    const result = await llm.complete('sys', 'user');
    expect(result.text).toBe('DSHS got $2.7M.');
    expect(result.tokens?.input).toBe(100);
  });

  it('advances through scripted responses in sequence', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'first', args: {} },
      { type: 'text', text: 'second' },
    ]);
    const r1 = await llm.compileFunctions('sys', 'user1', []);
    const r2 = await llm.compileFunctions('sys', 'user2', []);
    expect((r1 as { name: string }).name).toBe('first');
    expect((r2 as { text: string }).text).toBe('second');
  });

  it('throws when scripted responses exhausted', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'only', args: {} },
    ]);
    await llm.compileFunctions('sys', 'user', []);
    await expect(llm.compileFunctions('sys', 'user2', [])).rejects.toThrow();
  });

  it('complete returns text without tokens if not scripted', async () => {
    const llm = fakeLLM([
      { type: 'complete', text: 'Hello world' },
    ]);
    const result = await llm.complete('sys', 'user');
    expect(result.text).toBe('Hello world');
    expect(result.tokens).toBeUndefined();
  });
});
