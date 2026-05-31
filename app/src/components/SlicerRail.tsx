/**
 * SlicerRail — sidebar with filter controls bound to the store.
 * Fiscal Year, gross/net toggle, Agency/Category/SubCategory multi-selects,
 * and Top-N stepper. Slicer options populated from fetched dimensions.json.
 */
import { useEffect, useState } from 'react';
import { tokens } from '../theme/tokens';
import { useStore } from '../state/store';
import { loadDimensions } from '../lib/loadCube';
import type { Dimensions, DimItem } from '../../contracts';
import { VendorSearch } from './VendorSearch';

// ── Small section header ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: tokens.fontSans,
        fontWeight: 600,
        fontSize: 11,
        color: tokens.muted,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        marginBottom: 6,
        marginTop: 16,
      }}
    >
      {children}
    </div>
  );
}

// ── Multi-select list ─────────────────────────────────────────────────────────

interface MultiSelectProps {
  items: DimItem[];
  selected: string[] | undefined;
  onChange: (val: string[]) => void;
  maxHeight?: number;
}

function MultiSelect({ items, selected, onChange, maxHeight = 160 }: MultiSelectProps) {
  const sel = selected ?? [];

  function toggle(id: string) {
    if (sel.includes(id)) {
      onChange(sel.filter(v => v !== id));
    } else {
      onChange([...sel, id]);
    }
  }

  return (
    <div
      style={{
        maxHeight,
        overflowY: 'auto',
        border: `1px solid ${tokens.line}`,
        borderRadius: 6,
        background: tokens.card,
      }}
    >
      {items.map(item => {
        const active = sel.includes(item.id);
        return (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            title={item.gloss}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 10px',
              border: 'none',
              background: active ? `${tokens.lead}15` : 'transparent',
              borderLeft: active ? `3px solid ${tokens.lead}` : '3px solid transparent',
              fontFamily: tokens.fontSans,
              fontSize: 12,
              color: active ? tokens.lead : tokens.ink,
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
          >
            {item.label}
          </button>
        );
      })}
      {items.length === 0 && (
        <div
          style={{
            padding: '8px 10px',
            fontFamily: tokens.fontSans,
            fontSize: 12,
            color: tokens.muted,
            fontStyle: 'italic',
          }}
        >
          Loading…
        </div>
      )}
    </div>
  );
}

// ── Top-N stepper ─────────────────────────────────────────────────────────────

function TopNControl() {
  const topN = useStore(s => s.topN);
  const setTopN = useStore(s => s.setTopN);
  const OPTIONS = [5, 10, 20, 50];

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {OPTIONS.map(n => (
        <button
          key={n}
          onClick={() => setTopN(n)}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px solid ${topN === n ? tokens.lead : tokens.line}`,
            background: topN === n ? tokens.lead : 'transparent',
            color: topN === n ? '#fff' : tokens.muted,
            fontFamily: tokens.fontMono,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ── SlicerRail ────────────────────────────────────────────────────────────────

export function SlicerRail() {
  const filters = useStore(s => s.filters);
  const setFilters = useStore(s => s.setFilters);
  const reset = useStore(s => s.reset);

  const [dims, setDims] = useState<Dimensions>({
    agency: [],
    category: [],
    subcategory: [],
  });

  useEffect(() => {
    loadDimensions()
      .then(setDims)
      .catch(err => console.warn('[SlicerRail] Could not load dimensions:', err));
  }, []);

  function update(key: keyof typeof filters, val: string[] | undefined) {
    setFilters({ ...filters, [key]: val && val.length ? val : undefined });
  }

  const hasFilters =
    (filters.agency?.length ?? 0) > 0 ||
    (filters.category?.length ?? 0) > 0 ||
    (filters.subcategory?.length ?? 0) > 0;

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: `1px solid ${tokens.line}`,
        padding: '16px 12px',
        background: tokens.paper,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: tokens.fontSans,
            fontWeight: 700,
            fontSize: 13,
            color: tokens.ink,
          }}
        >
          Filters
        </span>
        {hasFilters && (
          <button
            onClick={reset}
            style={{
              background: 'none',
              border: 'none',
              color: tokens.lead,
              fontFamily: tokens.fontSans,
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Clear all
          </button>
        )}
      </div>

      <SectionLabel>Agency</SectionLabel>
      <MultiSelect
        items={dims.agency}
        selected={filters.agency}
        onChange={val => update('agency', val)}
      />

      <SectionLabel>Category</SectionLabel>
      <MultiSelect
        items={dims.category}
        selected={filters.category}
        onChange={val => update('category', val)}
      />

      <SectionLabel>Subcategory</SectionLabel>
      <MultiSelect
        items={dims.subcategory}
        selected={filters.subcategory}
        onChange={val => update('subcategory', val)}
        maxHeight={120}
      />

      <SectionLabel>Vendor</SectionLabel>
      <VendorSearch />

      <SectionLabel>Top N</SectionLabel>
      <TopNControl />
    </aside>
  );
}
