/**
 * AskBar — text input with "ASK" label and ⌘K hint.
 * Submits to /api/ask and routes the result to the Report view via the store.
 */
import { useState, useRef, useEffect } from 'react';
import { tokens } from '../theme/tokens';
import { useStore } from '../state/store';
import type { AskResponse } from '../../contracts';

export function AskBar() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setAskResult  = useStore(s => s.setAskResult);
  const setActiveTab  = useStore(s => s.setActiveTab);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q }),
      });
      let data: AskResponse;
      if (!res.ok) {
        // Server error (5xx/4xx) — show graceful message instead of crashing
        data = {
          kind: 'clarify',
          chips: [{
            label: "Live AI isn't available on this deployment yet — set a free GEMINI_API_KEY in the Vercel env to enable natural-language questions. Everything in the dashboard already works without it.",
          }],
        };
      } else {
        data = (await res.json()) as AskResponse;
      }
      // Route result to Report view via store
      setAskResult(data);
      setActiveTab('ask');
    } catch (err) {
      console.error('[AskBar] error:', err);
      // Network or JSON parse failure — show graceful message
      const fallback: AskResponse = {
        kind: 'clarify',
        chips: [{
          label: "Live AI isn't available on this deployment yet — set a free GEMINI_API_KEY in the Vercel env to enable natural-language questions. Everything in the dashboard already works without it.",
        }],
      };
      setAskResult(fallback);
      setActiveTab('ask');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        alignItems: 'center',
        background: tokens.paper,
        border: `1px solid ${tokens.line}`,
        borderRadius: 8,
        overflow: 'hidden',
        maxWidth: 520,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Ask anything…"
        aria-label="Ask anything"
        style={{
          flex: 1,
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: tokens.fontSans,
          fontSize: 14,
          color: tokens.ink,
        }}
      />
      {/* ⌘K hint */}
      <span
        style={{
          padding: '0 8px',
          fontFamily: tokens.fontMono,
          fontSize: 11,
          color: tokens.muted,
          borderRight: `1px solid ${tokens.line}`,
          whiteSpace: 'nowrap',
        }}
      >
        ⌘K
      </span>
      <button
        type="submit"
        disabled={loading || !query.trim()}
        style={{
          padding: '8px 14px',
          background: loading ? tokens.muted : tokens.ink,
          border: 'none',
          color: '#fff',
          fontFamily: tokens.fontSans,
          fontWeight: 600,
          fontSize: 12,
          letterSpacing: '0.05em',
          cursor: loading ? 'default' : 'pointer',
          transition: 'background 0.15s',
        }}
      >
        {loading ? '…' : 'ASK'}
      </button>
    </form>
  );
}
