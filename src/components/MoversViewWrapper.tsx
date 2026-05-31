/**
 * MoversViewWrapper — loads the cube and passes it to MoversView.
 */
import { useState, useEffect } from 'react';
import { loadCube } from '../lib/loadCube';
import type { Cube } from '../../../contracts';
import { MoversView } from './MoversView';
import { tokens } from '../theme/tokens';

export default function MoversViewWrapper() {
  const [cube,  setCube]  = useState<Cube | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCube()
      .then(setCube)
      .catch(() => setError('Failed to load data.'));
  }, []);

  if (error) return <div style={{ padding: 24, color: tokens.brick, fontFamily: tokens.fontSans, fontSize: 13 }}>{error}</div>;
  if (!cube)  return <div style={{ padding: 24, color: tokens.muted, fontFamily: tokens.fontSans, fontSize: 13 }}>Loading…</div>;

  return <MoversView cube={cube} />;
}
