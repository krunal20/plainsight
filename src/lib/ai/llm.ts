/**
 * T5.3 — LLM adapter
 *
 * Defines the LLM interface and provides:
 * - geminiLLM: wraps @google/genai gemini-2.5-flash with forced function-calling
 * - fakeLLM: scripted responses for tests (no network required)
 *
 * The interface abstracts away the provider so governedClient, compileSpec, and
 * narrate never import @google/genai directly.
 */

// ---------------------------------------------------------------------------
// Function declaration shape (provider-agnostic)
// ---------------------------------------------------------------------------
export interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// LLM interface — the one door all AI calls go through
// ---------------------------------------------------------------------------
export interface LLM {
  /**
   * Call the model with a list of function declarations and forced function-
   * calling. Returns either a function call or a text response.
   */
  compileFunctions(
    systemPrompt: string,
    userText: string,
    functions: FunctionDeclaration[]
  ): Promise<{ name: string; args: unknown } | { text: string }>;

  /**
   * Call the model for text completion (narration). Returns the text and
   * optionally token counts.
   */
  complete(
    systemPrompt: string,
    userText: string
  ): Promise<{ text: string; tokens?: { input: number; output: number } }>;
}

// ---------------------------------------------------------------------------
// geminiLLM — wraps @google/genai gemini-2.5-flash (server-only)
// Reads process.env.GEMINI_API_KEY
// ---------------------------------------------------------------------------
export function geminiLLM(): LLM {
  return {
    async compileFunctions(systemPrompt, userText, functions) {
      // Lazy import to avoid bundling into the client
      const { GoogleGenAI } = await import('@google/genai');
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY not set');
      const ai = new GoogleGenAI({ apiKey: key });

      const allowedNames = functions.map(f => f.name);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        config: {
          systemInstruction: systemPrompt,
          tools: [
            {
              functionDeclarations: functions.map(f => ({
                name: f.name,
                description: f.description ?? '',
                parameters: f.parameters as Record<string, unknown> ?? {},
              })),
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: 'ANY' as const,
              allowedFunctionNames: allowedNames,
            },
          },
        },
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      // Look for a function call part first
      for (const part of parts) {
        if (part.functionCall) {
          return {
            name: part.functionCall.name ?? '',
            args: part.functionCall.args ?? {},
          };
        }
      }

      // Fallback to text
      const text = parts.map(p => p.text ?? '').join('');
      return { text };
    },

    async complete(systemPrompt, userText) {
      const { GoogleGenAI } = await import('@google/genai');
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY not set');
      const ai = new GoogleGenAI({ apiKey: key });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        config: {
          systemInstruction: systemPrompt,
        },
      });

      const candidate = response.candidates?.[0];
      const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';

      const usageMeta = response.usageMetadata;
      const tokens =
        usageMeta?.promptTokenCount !== undefined && usageMeta?.candidatesTokenCount !== undefined
          ? { input: usageMeta.promptTokenCount, output: usageMeta.candidatesTokenCount }
          : undefined;

      return { text, ...(tokens ? { tokens } : {}) };
    },
  };
}

// ---------------------------------------------------------------------------
// fakeLLM — scripted responses for tests (deterministic, no network)
// ---------------------------------------------------------------------------

type ScriptEntry =
  | { type: 'function'; name: string; args: unknown }
  | { type: 'text'; text: string }
  | { type: 'complete'; text: string; tokens?: { input: number; output: number } };

export function fakeLLM(script: ScriptEntry[]): LLM {
  const queue = [...script];

  function next(): ScriptEntry {
    const entry = queue.shift();
    if (!entry) throw new Error('fakeLLM: script exhausted — no more scripted responses');
    return entry;
  }

  return {
    async compileFunctions(_systemPrompt, _userText, _functions) {
      const entry = next();
      if (entry.type === 'function') {
        return { name: entry.name, args: entry.args };
      }
      if (entry.type === 'text') {
        return { text: entry.text };
      }
      // type === 'complete': treat text as plain text response
      return { text: entry.text };
    },

    async complete(_systemPrompt, _userText) {
      const entry = next();
      if (entry.type === 'complete') {
        return {
          text: entry.text,
          ...(entry.tokens ? { tokens: entry.tokens } : {}),
        };
      }
      if (entry.type === 'text') {
        return { text: entry.text };
      }
      // type === 'function': not expected for complete(), but return name as text
      return { text: String((entry as ScriptEntry & { name?: string }).name ?? '') };
    },
  };
}
