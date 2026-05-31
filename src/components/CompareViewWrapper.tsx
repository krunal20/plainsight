/**
 * CompareViewWrapper — loads the cube and passes it to CompareView.
 * This is the default export used by the lazy-loaded Tabs.
 */
import { useState, useEffect } from 'react';
import { loadCube } from '../lib/loadCube';
import type { Cube } from '../../../contracts';
import { CompareView } from './CompareView';
import { tokens } from '../theme/tokens';

export default function CompareViewWrapper() {
  const [cube,  setCube]  = useState<Cube | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCube()
      .then(setCube)
      .catch(() => setError('Failed to load data.'));
  }, []);

  if (error) return <div style={{ padding: 24, color: tokens.brick, fontFamily: tokens.fontSans, fontSize: 13 }}>{error}</div>;
  if (!cube)  return <div style={{ padding: 24, color: tokens.muted, fontFamily: tokens.fontSans, fontSize: 13 }}>Loading…</div>;

  return <CompareView cube={cube} />;
}
