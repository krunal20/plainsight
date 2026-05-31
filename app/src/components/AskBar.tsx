/**
 * AskBar — text input with "ASK" label and ⌘K hint.
 * Submits to /api/ask; for now surfaces the result via console + future /report route.
 */
import { useState, useRef, useEffect } from 'react';
import { tokens } from '../theme/tokens';

export function AskBar() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      // WS7 will route this to the Report view
      console.info('[AskBar] /api/ask response:', data);
      // Placeholder: could navigate to /report in future
    } catch (err) {
      console.error('[AskBar] error:', err);
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
