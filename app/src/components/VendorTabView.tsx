/**
 * VendorTabView — rendered in the Vendors tab.
 * Shows the EntityProfile for the currently filtered entity (if a single
 * agency or vendor is selected), or a prompt to select one.
 */
import { useState, useEffect } from 'react';
import { useStore } from '../state/store';
import { loadCube } from '../lib/loadCube';
import type { Cube } from '../../../contracts';
import { EntityProfile } from './EntityProfile';
import { tokens } from '../theme/tokens';

export default function VendorTabView() {
  const filters  = useStore(s => s.filters);
  const netGross = useStore(s => s.netGross);

  const [cube,  setCube]  = useState<Cube | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCube()
      .then(setCube)
      .catch(() => setError('Failed to load data.'));
  }, []);

  if (error) {
    return <div style={{ padding: 24, color: tokens.brick, fontFamily: tokens.fontSans, fontSize: 13 }}>{error}</div>;
  }
  if (!cube) {
    return <div style={{ padding: 24, color: tokens.muted, fontFamily: tokens.fontSans, fontSize: 13 }}>Loading…</div>;
  }

  // Determine entity from filters
  if (filters.vendorIds?.length === 1) {
    return (
      <EntityProfile
        entity={{ type: 'vendor', id: filters.vendorIds[0] }}
        cube={cube}
        netGross={netGross}
      />
    );
  }

  if (filters.agency?.length === 1) {
    return (
      <EntityProfile
        entity={{ type: 'agency', id: filters.agency[0] }}
        cube={cube}
        netGross={netGross}
      />
    );
  }

  // No single entity selected — show a prompt
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
        gap: 12,
        fontFamily: tokens.fontSans,
      }}
    >
      <div style={{ width: 40, height: 40, background: tokens.line, borderRadius: 8 }} />
      <p style={{ fontSize: 15, color: tokens.muted, margin: 0 }}>
        Select a single agency or vendor from the filters to see a profile.
      </p>
    </div>
  );
}
