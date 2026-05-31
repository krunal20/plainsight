/**
 * WS7 Tests — cross-filter/drill, measure selector, breadcrumb,
 * Report (spec/clarify/refuse), AskBar→Report wiring, VendorSearch.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock chart components (canvas not available in jsdom)
vi.mock('../components/charts/Treemap', () => ({
  Treemap: ({ subtitle }: { subtitle: string }) => <div data-testid="treemap">{subtitle}</div>,
}));
vi.mock('../components/charts/Bar', () => ({
  Bar: ({ subtitle }: { subtitle: string }) => <div data-testid="bar">{subtitle}</div>,
}));
vi.mock('../components/charts/Line', () => ({
  Line: ({ subtitle }: { subtitle: string }) => <div data-testid="line">{subtitle}</div>,
}));
vi.mock('../lib/loadCube', () => ({
  loadCube: vi.fn(),
  loadDimensions: vi.fn().mockResolvedValue({ agency: [], category: [], subcategory: [] }),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { Breadcrumb } from '../components/Breadcrumb';
import { MeasureSelector } from '../components/MeasureSelector';
import { Report } from '../pages/Report';
import { AskBar } from '../components/AskBar';
import type { AskResponse, QueryResult } from '../../contracts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RESULT: QueryResult = {
  rows: [
    { label: 'WSDOT', value: 2_000_000 },
    { label: 'DOH',   value: 1_500_000 },
  ],
  columns: [
    { key: 'label', label: 'Agency',    type: 'string'   },
    { key: 'value', label: 'Net Spend', type: 'currency' },
  ],
  meta: { totalNet: 3_500_000, totalGross: 3_850_000, rowCount: 2, truncated: false },
  spec: {
    intent: 'rank',
    measure: 'amount',
    agg: 'sum',
    netGross: 'net',
    filters: {},
    groupBy: 'agency',
    sort: { by: 'measure', dir: 'desc' },
    topN: 10,
    chart: 'bar',
  },
  sql: 'SELECT agency, SUM(net) FROM cube GROUP BY agency',
  traceId: 'test-001',
};

const SPEC_RESPONSE: AskResponse = {
  kind: 'spec',
  result: MOCK_RESULT,
  interpretation: 'Total spend by agency, net, top 10',
  followups: [
    {
      intent: 'trend',
      measure: 'amount',
      agg: 'sum',
      netGross: 'net',
      filters: {},
      groupBy: 'fy',
      chart: 'line',
    },
  ],
};

const CLARIFY_RESPONSE: AskResponse = {
  kind: 'clarify',
  chips: [
    { label: 'By agency' },
    { label: 'By category' },
  ],
};

const REFUSE_RESPONSE: AskResponse = {
  kind: 'refuse',
  category: 'forecast',
  redirect: 'Try the WA OFM website for budget projections.',
};

// ── Tests: Breadcrumb ─────────────────────────────────────────────────────────

describe('Breadcrumb', () => {
  beforeEach(async () => {
    const { useStore } = await import('../state/store');
    useStore.getState().reset();
  });

  it('renders nothing when drillPath is empty', () => {
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it('renders breadcrumb after drillTo', async () => {
    const { useStore } = await import('../state/store');

    act(() => {
      useStore.getState().drillTo({ dimension: 'agency', value: 'WSDOT' });
    });

    render(<Breadcrumb />);
    expect(screen.getByText('WSDOT')).toBeDefined();
    expect(screen.getByText('All')).toBeDefined();
  });

  it('clicking All crumb calls drillUp(0)', async () => {
    const { useStore } = await import('../state/store');

    act(() => {
      useStore.getState().drillTo({ dimension: 'agency', value: 'WSDOT' });
      useStore.getState().drillTo({ dimension: 'category', value: 'IT' });
    });

    render(<Breadcrumb />);

    const allBtn = screen.getByText('All');
    act(() => { fireEvent.click(allBtn); });

    const state = useStore.getState();
    expect(state.drillPath).toHaveLength(0);
    expect(state.filters.agency).toBeUndefined();
  });

  it('clicking an intermediate crumb drills up to that index', async () => {
    const { useStore } = await import('../state/store');

    act(() => {
      useStore.getState().drillTo({ dimension: 'agency',   value: 'WSDOT' });
      useStore.getState().drillTo({ dimension: 'category', value: 'IT' });
    });

    render(<Breadcrumb />);

    const wsdotBtn = screen.getByText('WSDOT');
    act(() => { fireEvent.click(wsdotBtn); });

    const state = useStore.getState();
    expect(state.drillPath).toHaveLength(1);
    expect(state.drillPath[0].value).toBe('WSDOT');
  });
});

// ── Tests: MeasureSelector ────────────────────────────────────────────────────

describe('MeasureSelector', () => {
  beforeEach(async () => {
    const { useStore } = await import('../state/store');
    useStore.getState().reset();
  });

  it('renders with default measure sum', () => {
    render(<MeasureSelector />);
    const select = screen.getByRole('combobox', { name: /measure/i }) as HTMLSelectElement;
    expect(select.value).toBe('sum');
  });

  it('changing measure updates the store', async () => {
    const { useStore } = await import('../state/store');
    render(<MeasureSelector />);

    const select = screen.getByRole('combobox', { name: /measure/i });
    act(() => {
      fireEvent.change(select, { target: { value: 'yoy_delta' } });
    });

    expect(useStore.getState().measure).toBe('yoy_delta');
  });

  it('all 5 measure options are present', () => {
    render(<MeasureSelector />);
    const select = screen.getByRole('combobox', { name: /measure/i }) as HTMLSelectElement;
    expect(select.options.length).toBe(5);
  });
});

// ── Tests: Report (spec kind) ─────────────────────────────────────────────────

describe('Report – kind:spec', () => {
  it('renders interpretation chip', () => {
    render(<Report response={SPEC_RESPONSE} query="spend by agency" />);
    // InterpretationChip renders the spec description as button text
    expect(screen.getByRole('button', { name: /edit query interpretation/i })).toBeDefined();
  });

  it('renders follow-up chips', () => {
    render(<Report response={SPEC_RESPONSE} query="spend by agency" />);
    expect(screen.getByText(/explore further/i)).toBeDefined();
  });

  it('renders Show the SQL button', () => {
    render(<Report response={SPEC_RESPONSE} query="spend by agency" />);
    expect(screen.getByText(/show the sql/i)).toBeDefined();
  });

  it('renders a chart', () => {
    render(<Report response={SPEC_RESPONSE} query="spend by agency" />);
    expect(screen.getByTestId('bar')).toBeDefined();
  });

  it('renders narration text', () => {
    render(<Report response={SPEC_RESPONSE} query="spend by agency" />);
    // Interpretation appears in both the chip label and the narration panel — use getAllByText
    const matches = screen.getAllByText('Total spend by agency, net, top 10');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Replay button when query is provided', () => {
    render(<Report response={SPEC_RESPONSE} query="spend by agency" />);
    expect(screen.getByRole('button', { name: /replay/i })).toBeDefined();
  });
});

// ── Tests: Report (clarify kind) ──────────────────────────────────────────────

describe('Report – kind:clarify', () => {
  it('renders clarify chips', () => {
    render(<Report response={CLARIFY_RESPONSE} />);
    const chips = screen.getAllByTestId('clarify-chip');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toContain('By agency');
    expect(chips[1].textContent).toContain('By category');
  });

  it('renders clarification prompt text', () => {
    render(<Report response={CLARIFY_RESPONSE} />);
    expect(screen.getByText(/clarify/i)).toBeDefined();
  });
});

// ── Tests: Report (refuse kind) ───────────────────────────────────────────────

describe('Report – kind:refuse', () => {
  beforeEach(async () => {
    const { useStore } = await import('../state/store');
    useStore.getState().reset();
  });

  it('renders the refuse panel', () => {
    render(<Report response={REFUSE_RESPONSE} />);
    expect(screen.getByTestId('refuse-panel')).toBeDefined();
  });

  it('shows the refuse category label', () => {
    render(<Report response={REFUSE_RESPONSE} />);
    expect(screen.getByText(/forecast/i)).toBeDefined();
  });

  it('shows the redirect message', () => {
    render(<Report response={REFUSE_RESPONSE} />);
    expect(screen.getByText(/OFM/i)).toBeDefined();
  });

  it('shows a Back to Overview button', () => {
    render(<Report response={REFUSE_RESPONSE} />);
    expect(screen.getByRole('button', { name: /back to overview/i })).toBeDefined();
  });

  it('clicking Back to Overview sets activeTab to overview', async () => {
    const { useStore } = await import('../state/store');
    useStore.getState().setActiveTab('ask');

    render(<Report response={REFUSE_RESPONSE} />);
    const btn = screen.getByRole('button', { name: /back to overview/i });

    act(() => { fireEvent.click(btn); });
    expect(useStore.getState().activeTab).toBe('overview');
  });
});

// ── Tests: Report (blank) ─────────────────────────────────────────────────────

describe('Report – blank state', () => {
  it('renders blank state when no response', () => {
    render(<Report />);
    expect(screen.getByText(/ask a question/i)).toBeDefined();
  });
});

// ── Tests: AskBar → Report wiring ────────────────────────────────────────────

describe('AskBar → Report wiring', () => {
  beforeEach(async () => {
    const { useStore } = await import('../state/store');
    useStore.getState().reset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submitting AskBar sets askResult in store and switches to ask tab', async () => {
    const { useStore } = await import('../state/store');

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => SPEC_RESPONSE,
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<AskBar />);

    const input = screen.getByRole('textbox', { name: /ask anything/i });
    act(() => { fireEvent.change(input, { target: { value: 'top agencies' } }); });

    const form = input.closest('form')!;
    await act(async () => { fireEvent.submit(form); });

    await waitFor(() => {
      const state = useStore.getState();
      expect(state.activeTab).toBe('ask');
      expect(state.askResult).not.toBeNull();
    });

    // fetch was called with text field
    expect(mockFetch).toHaveBeenCalledWith('/api/ask', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"text"'),
    }));
  });
});

// ── Tests: store applySelection + drillUp ─────────────────────────────────────

describe('store: applySelection updates filters', () => {
  beforeEach(async () => {
    const { useStore } = await import('../state/store');
    useStore.getState().reset();
  });

  it('applySelection sets agency filter', async () => {
    const { useStore } = await import('../state/store');
    act(() => {
      useStore.getState().applySelection({ dimension: 'agency', value: 'WSDOT' });
    });
    expect(useStore.getState().filters.agency).toEqual(['WSDOT']);
  });

  it('applySelection sets category filter', async () => {
    const { useStore } = await import('../state/store');
    act(() => {
      useStore.getState().applySelection({ dimension: 'category', value: 'IT' });
    });
    expect(useStore.getState().filters.category).toEqual(['IT']);
  });

  it('applySelection sets vendorIds filter', async () => {
    const { useStore } = await import('../state/store');
    act(() => {
      useStore.getState().applySelection({ dimension: 'vendor', value: 'microsoft-corp' });
    });
    expect(useStore.getState().filters.vendorIds).toEqual(['microsoft-corp']);
  });

  it('drillUp pops the drill path and rebuilds filters', async () => {
    const { useStore } = await import('../state/store');

    act(() => {
      useStore.getState().drillTo({ dimension: 'agency',   value: 'WSDOT' });
      useStore.getState().drillTo({ dimension: 'category', value: 'IT'    });
    });

    expect(useStore.getState().drillPath).toHaveLength(2);

    act(() => { useStore.getState().drillUp(1); });

    const state = useStore.getState();
    expect(state.drillPath).toHaveLength(1);
    expect(state.filters.agency).toEqual(['WSDOT']);
    expect(state.filters.category).toBeUndefined();
  });
});

// ── Tests: store setAskResult + setActiveTab ──────────────────────────────────

describe('store: setAskResult and setActiveTab', () => {
  beforeEach(async () => {
    const { useStore } = await import('../state/store');
    useStore.getState().reset();
  });

  it('setAskResult stores the response', async () => {
    const { useStore } = await import('../state/store');
    act(() => { useStore.getState().setAskResult(SPEC_RESPONSE); });
    expect(useStore.getState().askResult).toEqual(SPEC_RESPONSE);
  });

  it('setAskResult can be cleared with null', async () => {
    const { useStore } = await import('../state/store');
    act(() => { useStore.getState().setAskResult(SPEC_RESPONSE); });
    act(() => { useStore.getState().setAskResult(null); });
    expect(useStore.getState().askResult).toBeNull();
  });

  it('setActiveTab changes the active tab', async () => {
    const { useStore } = await import('../state/store');
    act(() => { useStore.getState().setActiveTab('compare'); });
    expect(useStore.getState().activeTab).toBe('compare');
  });
});
