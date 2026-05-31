/**
 * VendorSearch — search input in the SlicerRail that resolves vendor names
 * by calling GET /api/vendor-search?q=<query>.
 * On picking a result, injects filters.vendorIds into the store.
 *
 * vendors.json is SERVER-ONLY — this component never imports it directly.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { tokens } from '../theme/tokens';
import { useStore } from '../state/store';
import { loadCube } from '../lib/loadCube';

interface VendorMatch {
  vendorId: string;
  display: string;
}

// Client-side vendor index built once from the cube's per-agency top-vendor lists
// (no /api dependency). Dedupes by vendorId across agencies.
let _vendorIndex: VendorMatch[] | null = null;
async function getVendorIndex(): Promise<VendorMatch[]> {
  if (_vendorIndex) return _vendorIndex;
  const cube = await loadCube();
  const seen = new Map<string, string>();
  for (const list of Object.values(cube.vendorsByAgency ?? {})) {
    for (const v of list) {
      if (!seen.has(v.vendorId)) seen.set(v.vendorId, v.name);
    }
  }
  _vendorIndex = Array.from(seen, ([vendorId, display]) => ({ vendorId, display }));
  return _vendorIndex;
}

export function VendorSearch() {
  const setFilters = useStore(s => s.setFilters);
  const filters    = useStore(s => s.filters);

  const [query,    setQuery]    = useState('');
  const [matches,  setMatches]  = useState<VendorMatch[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [open,     setOpen]     = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const index = await getVendorIndex();
        const ql = q.trim().toLowerCase();
        // Empty query → show a starter list so users can pick without typing.
        const hits = (ql
          ? index.filter(v => v.display.toLowerCase().includes(ql))
          : index
        ).slice(0, 20);
        setMatches(hits);
        setOpen(true);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Warm the vendor index on mount so the first keystroke is instant.
  useEffect(() => { void getVendorIndex(); }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  }

  function handlePick(match: VendorMatch) {
    setFilters({ ...filters, vendorIds: [match.vendorId] });
    setQuery(match.display);
    setOpen(false);
    setMatches([]);
  }

  function handleClear() {
    setQuery('');
    setMatches([]);
    setOpen(false);
    const { vendorIds: _unused, ...rest } = filters;
    setFilters(rest);
  }

  const selected = filters.vendorIds;

  return (
    <div style={{ position: 'relative', marginTop: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          border: `1px solid ${tokens.line}`,
          borderRadius: 6,
          background: tokens.card,
          overflow: 'hidden',
        }}
      >
        <input
          type="search"
          aria-label="Search vendors"
          value={query}
          onChange={handleChange}
          onFocus={() => { void search(query); }}
          onBlur={() => { setTimeout(() => setOpen(false), 150); }}
          placeholder="Search vendor…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            padding: '6px 8px',
            fontFamily: tokens.fontSans,
            fontSize: 12,
            color: tokens.ink,
            background: 'transparent',
          }}
        />
        {loading && (
          <span style={{ paddingRight: 6, fontSize: 11, color: tokens.muted }}>…</span>
        )}
        {(query || selected?.length) && (
          <button
            onClick={handleClear}
            aria-label="Clear vendor filter"
            style={{
              background: 'none',
              border: 'none',
              padding: '0 6px',
              color: tokens.muted,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Selected indicator */}
      {selected?.length && !query && (
        <div
          style={{
            marginTop: 4,
            padding: '3px 8px',
            background: `${tokens.lead}15`,
            borderLeft: `3px solid ${tokens.lead}`,
            borderRadius: 2,
            fontSize: 11,
            color: tokens.lead,
            fontWeight: 600,
          }}
        >
          {selected.join(', ')}
        </div>
      )}

      {/* Dropdown */}
      {open && matches.length > 0 && (
        <div
          role="listbox"
          aria-label="Vendor suggestions"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 200,
            background: tokens.card,
            border: `1px solid ${tokens.line}`,
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            marginTop: 2,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {matches.map(m => (
            <button
              key={m.vendorId}
              role="option"
              aria-selected={selected?.includes(m.vendorId) ?? false}
              onMouseDown={() => handlePick(m)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 10px',
                border: 'none',
                background: selected?.includes(m.vendorId) ? `${tokens.lead}15` : 'transparent',
                fontFamily: tokens.fontSans,
                fontSize: 12,
                color: tokens.ink,
                cursor: 'pointer',
              }}
            >
              {m.display}
            </button>
          ))}
        </div>
      )}

      {open && matches.length === 0 && query.trim() && !loading && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 200,
            background: tokens.card,
            border: `1px solid ${tokens.line}`,
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 12,
            color: tokens.muted,
            fontStyle: 'italic',
            marginTop: 2,
          }}
        >
          No vendors found.
        </div>
      )}
    </div>
  );
}
