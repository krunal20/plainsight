/**
 * T5.4 — governedClient.ts
 *
 * Wraps an LLM so EVERY call appends an AIEvent (the "one door").
 * governedClient is the ONLY path to the model.
 *
 * Every call records:
 * - step (provided by caller: 'compile' | 'repair' | 'narrate' etc.)
 * - traceId
 * - raw input (systemPrompt hash not stored; rawText = userText)
 * - output
 * - tokens (if returned)
 * - latencyMs
 */

import type { AIEvent, LogApi } from '../../../contracts';
import type { LLM, FunctionDeclaration } from './llm';

export interface GovernedClient {
  compileFunctions(
    systemPrompt: string,
    userText: string,
    functions: FunctionDeclaration[],
    step: AIEvent['step']
  ): Promise<{ name: string; args: unknown } | { text: string }>;

  complete(
    systemPrompt: string,
    userText: string,
    step: AIEvent['step']
  ): Promise<{ text: string; tokens?: { input: number; output: number } }>;
}

export function createGovernedClient(
  llm: LLM,
  log: LogApi,
  traceId: string
): GovernedClient {
  return {
    async compileFunctions(systemPrompt, userText, functions, step) {
      const start = Date.now();
      const output = await llm.compileFunctions(systemPrompt, userText, functions);
      const latencyMs = Date.now() - start;

      const event: AIEvent = {
        traceId,
        ts: new Date().toISOString(),
        step,
        userAction: userText,
        input: { rawText: userText },
        output,
        latencyMs,
        model: 'gemini-2.5-flash',
      };

      log.append(event);
      return output;
    },

    async complete(systemPrompt, userText, step) {
      const start = Date.now();
      const output = await llm.complete(systemPrompt, userText);
      const latencyMs = Date.now() - start;

      const event: AIEvent = {
        traceId,
        ts: new Date().toISOString(),
        step,
        userAction: userText,
        input: { rawText: userText },
        output: { text: output.text },
        latencyMs,
        model: 'gemini-2.5-flash',
        ...(output.tokens ? { tokens: output.tokens } : {}),
      };

      log.append(event);
      return output;
    },
  };
}
