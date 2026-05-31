/**
 * KpiStripWrapper — loads cube and renders KpiStrip once available.
 * Shows a minimal loading state (just height reservation) while cube is fetching.
 */
import { useEffect, useState } from 'react';
import type { Cube } from '../../contracts';
import { loadCube } from '../lib/loadCube';
import { KpiStrip } from './KpiStrip';
import { tokens } from '../theme/tokens';

export function KpiStripWrapper() {
  const [cube, setCube] = useState<Cube | null>(null);

  useEffect(() => {
    loadCube()
      .then(setCube)
      .catch(err => console.warn('[KpiStrip] cube load failed:', err));
  }, []);

  if (!cube) {
    return (
      <div
        style={{
          height: 72,
          background: tokens.paper,
          borderBottom: `1px solid ${tokens.line}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 8,
        }}
      >
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 48,
              background: tokens.line,
              borderRadius: 8,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    );
  }

  return <KpiStrip cube={cube} />;
}
