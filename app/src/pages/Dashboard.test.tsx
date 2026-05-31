/**
 * Dashboard render test — mocks chart components and cube fetch,
 * asserts KPI strip and chart subtitle text render correctly.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { Cube } from '../../contracts';

// ── Mock echarts chart components (they use canvas, not available in jsdom) ──
// NOTE: vi.mock is hoisted — do NOT reference module-level vars here.

vi.mock('../components/charts/Treemap', () => ({
  Treemap: ({ subtitle }: { subtitle: string }) => (
    <div data-testid="treemap">{subtitle}</div>
  ),
}));

vi.mock('../components/charts/Bar', () => ({
  Bar: ({ subtitle }: { subtitle: string }) => (
    <div data-testid="bar">{subtitle}</div>
  ),
}));

vi.mock('../components/charts/Line', () => ({
  Line: ({ subtitle }: { subtitle: string }) => (
    <div data-testid="line">{subtitle}</div>
  ),
}));

vi.mock('../lib/loadCube', () => ({
  loadCube: vi.fn(),
  loadDimensions: vi.fn().mockResolvedValue({ agency: [], category: [], subcategory: [] }),
}));

// ── Minimal cube fixture (defined AFTER vi.mock blocks) ───────────────────────

const MOCK_CUBE: Cube = {
  cells: [
    { agency: 'WSDOT', category: 'IT',     subcategory: 'Software', month: 7, fy: 2022, net: 1_000_000, gross: 1_100_000 },
    { agency: 'WSDOT', category: 'IT',     subcategory: 'Software', month: 7, fy: 2023, net: 1_200_000, gross: 1_320_000 },
    { agency: 'DOH',   category: 'Health', subcategory: 'Services', month: 8, fy: 2022, net: 500_000,   gross: 550_000   },
    { agency: 'DOH',   category: 'Health', subcategory: 'Services', month: 8, fy: 2023, net: 600_000,   gross: 660_000   },
  ],
  vendorsByAgency: {
    WSDOT: [{ vendorId: 'v1', name: 'Acme Corp', net: 800_000, gross: 880_000 }],
    DOH:   [{ vendorId: 'v2', name: 'Beta LLC',  net: 400_000, gross: 440_000 }],
  },
  totals: {
    net: 3_300_000,
    gross: 3_630_000,
    byFy: {
      '2022': { net: 1_500_000, gross: 1_650_000 },
      '2023': { net: 1_800_000, gross: 1_980_000 },
    },
  },
};

// ── Import after mocks ────────────────────────────────────────────────────────

import { Dashboard } from './Dashboard';
import { KpiStrip } from '../components/KpiStrip';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dashboard', () => {
  beforeEach(async () => {
    const { loadCube } = await import('../lib/loadCube');
    (loadCube as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CUBE);
    // Reset store state
    const { useStore } = await import('../state/store');
    useStore.getState().reset();
  });

  it('renders chart subtitles after cube loads', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('treemap')).toBeDefined();
    });

    expect(screen.getByTestId('treemap').textContent).toMatch(/category/i);
    expect(screen.getAllByTestId('bar').length).toBe(2);
    expect(screen.getByTestId('line')).toBeDefined();
  });

  it('shows loading skeleton initially (no charts)', async () => {
    const { loadCube } = await import('../lib/loadCube');
    // Override to never resolve for this test
    (loadCube as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));

    render(<Dashboard />);
    // Should show loading cards — no chart testids yet
    expect(screen.queryByTestId('treemap')).toBeNull();
  });
});

// ── KpiStrip test ─────────────────────────────────────────────────────────────

describe('KpiStrip', () => {
  beforeEach(async () => {
    const { useStore } = await import('../state/store');
    useStore.getState().reset();
  });

  it('renders 5 KPI tiles', () => {
    render(<KpiStrip cube={MOCK_CUBE} />);
    const tiles = screen.getAllByTestId('kpi-tile');
    expect(tiles.length).toBe(5);
  });

  it('shows total net spend in KPI strip', () => {
    render(<KpiStrip cube={MOCK_CUBE} />);
    // Total net = cells sum = 1M + 1.2M + 0.5M + 0.6M = 3.3M
    expect(screen.getByText(/\$3\.\d+M/)).toBeDefined();
  });

  it('shows positive YoY percentage', () => {
    render(<KpiStrip cube={MOCK_CUBE} />);
    // FY22 net = 1.5M, FY23 net = 1.8M → +20%
    expect(screen.getByText(/\+20\.0%/)).toBeDefined();
  });
});
