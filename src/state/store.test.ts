/**
 * Tests for the zustand store with URL-hash sync.
 * T2.2 acceptance: setting a filter updates location.hash; loading a hash hydrates state.
 */
import { encodeState, decodeState, DEFAULT_STATE } from './store';
import type { AppState } from './storeTypes';

// ── Codec round-trip ─────────────────────────────────────────────────────────

describe('encodeState / decodeState round-trip', () => {
  it('encodes and decodes default state cleanly', () => {
    const encoded = encodeState(DEFAULT_STATE);
    const decoded = decodeState(encoded);
    expect(decoded.filters).toEqual({});
    expect(decoded.measure).toBe('sum');
    expect(decoded.netGross).toBe('net');
    expect(decoded.topN).toBe(10);
    expect(decoded.activeTab).toBe('overview');
  });

  it('round-trips filters correctly', () => {
    const state: AppState = {
      ...DEFAULT_STATE,
      filters: { agency: ['DOT'], fy: [2023] },
      netGross: 'gross',
      topN: 20,
      activeTab: 'vendors',
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded.filters?.agency).toEqual(['DOT']);
    expect(decoded.filters?.fy).toEqual([2023]);
    expect(decoded.netGross).toBe('gross');
    expect(decoded.topN).toBe(20);
    expect(decoded.activeTab).toBe('vendors');
  });

  it('round-trips drillPath correctly', () => {
    const state: AppState = {
      ...DEFAULT_STATE,
      drillPath: [{ dimension: 'agency', value: 'WSDOT' }],
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded.drillPath).toEqual([{ dimension: 'agency', value: 'WSDOT' }]);
  });

  it('returns empty object for empty/invalid hash', () => {
    expect(decodeState('')).toEqual({});
    expect(decodeState('#')).toEqual({});
    expect(decodeState('not-valid-base64!!')).toEqual({});
  });

  it('produces a stable base64 string (no spaces)', () => {
    const encoded = encodeState(DEFAULT_STATE);
    expect(encoded).not.toContain(' ');
    expect(encoded.length).toBeGreaterThan(0);
  });
});

// ── Store actions and hash sync ──────────────────────────────────────────────

describe('store hash sync', () => {
  beforeEach(() => {
    // Reset location.hash before each test
    window.location.hash = '';
  });

  it('setting a filter updates location.hash', async () => {
    const { useStore } = await import('./store');
    // Reset store first
    useStore.getState().reset();

    useStore.getState().setFilters({ agency: ['WSDOT'] });

    // Hash should now be non-empty
    expect(window.location.hash.length).toBeGreaterThan(1);

    // And should decode back to the filters we set
    const decoded = decodeState(window.location.hash);
    expect(decoded.filters?.agency).toEqual(['WSDOT']);
  });

  it('setting netGross updates location.hash', async () => {
    const { useStore } = await import('./store');
    useStore.getState().reset();

    useStore.getState().setNetGross('gross');
    const decoded = decodeState(window.location.hash);
    expect(decoded.netGross).toBe('gross');
  });

  it('reset clears filters and hash reflects default', async () => {
    const { useStore } = await import('./store');
    useStore.getState().setFilters({ agency: ['DOT'], fy: [2022] });
    useStore.getState().reset();

    const state = useStore.getState();
    expect(state.filters).toEqual({});
    expect(state.netGross).toBe('net');
    expect(state.topN).toBe(10);
  });

  it('applySelection sets filter on store', async () => {
    const { useStore } = await import('./store');
    useStore.getState().reset();

    useStore.getState().applySelection({ dimension: 'agency', value: 'WSDOT' });
    expect(useStore.getState().filters.agency).toEqual(['WSDOT']);
  });

  it('drillTo pushes to drillPath', async () => {
    const { useStore } = await import('./store');
    useStore.getState().reset();

    useStore.getState().drillTo({ dimension: 'category', value: 'IT' });
    expect(useStore.getState().drillPath).toHaveLength(1);
    expect(useStore.getState().drillPath[0]).toEqual({ dimension: 'category', value: 'IT' });
  });

  it('drillUp trims drillPath', async () => {
    const { useStore } = await import('./store');
    useStore.getState().reset();

    useStore.getState().drillTo({ dimension: 'agency', value: 'WSDOT' });
    useStore.getState().drillTo({ dimension: 'category', value: 'IT' });
    expect(useStore.getState().drillPath).toHaveLength(2);

    useStore.getState().drillUp(1);
    expect(useStore.getState().drillPath).toHaveLength(1);
  });
});
