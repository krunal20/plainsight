/**
 * Zustand store implementing AppState + StoreActions (from storeTypes.ts).
 * URL-hash sync: state is encoded to/from location.hash for shareable deep links.
 */
import { create } from 'zustand';
import type { AppState, AppFilters, Store } from './storeTypes';
import type { Dimension, AskResponse } from '../../contracts';

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const DEFAULT_STATE: AppState = {
  filters: {},
  measure: 'sum',
  netGross: 'net',
  topN: 10,
  drillPath: [],
  compare: undefined,
  activeTab: 'overview',
  askResult: undefined,
};

// ---------------------------------------------------------------------------
// Hash encoding / decoding (compact JSON via base64url)
// ---------------------------------------------------------------------------

function encodeState(state: AppState): string {
  try {
    const compact = {
      f: state.filters,
      m: state.measure,
      ng: state.netGross,
      n: state.topN,
      dp: state.drillPath.length ? state.drillPath : undefined,
      cmp: state.compare,
      tab: state.activeTab !== 'overview' ? state.activeTab : undefined,
    };
    const json = JSON.stringify(compact);
    return btoa(encodeURIComponent(json));
  } catch {
    return '';
  }
}

function decodeState(hash: string): Partial<AppState> {
  try {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!raw) return {};
    const json = decodeURIComponent(atob(raw));
    const parsed = JSON.parse(json) as {
      f?: AppFilters;
      m?: AppState['measure'];
      ng?: AppState['netGross'];
      n?: number;
      dp?: AppState['drillPath'];
      cmp?: AppState['compare'];
      tab?: AppState['activeTab'];
    };
    return {
      filters: parsed.f ?? {},
      measure: parsed.m ?? DEFAULT_STATE.measure,
      netGross: parsed.ng ?? DEFAULT_STATE.netGross,
      topN: parsed.n ?? DEFAULT_STATE.topN,
      drillPath: parsed.dp ?? [],
      compare: parsed.cmp,
      activeTab: parsed.tab ?? 'overview',
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Load initial state from URL hash (if present)
// ---------------------------------------------------------------------------

function loadFromHash(): AppState {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  const fromHash = decodeState(window.location.hash);
  return { ...DEFAULT_STATE, ...fromHash };
}

// ---------------------------------------------------------------------------
// Write state to URL hash (no pushState — avoids polluting browser history
// on every filter change; replaceState keeps history navigable)
// ---------------------------------------------------------------------------

function writeToHash(state: AppState): void {
  if (typeof window === 'undefined') return;
  const encoded = encodeState(state);
  const newHash = encoded ? `#${encoded}` : '';
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, '', newHash || window.location.pathname);
  }
}

// ---------------------------------------------------------------------------
// Extract AppState portion from full Store
// ---------------------------------------------------------------------------

function pickAppState(s: AppState): AppState {
  return {
    filters: s.filters,
    measure: s.measure,
    netGross: s.netGross,
    topN: s.topN,
    drillPath: s.drillPath,
    compare: s.compare,
    activeTab: s.activeTab,
    askResult: s.askResult,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<Store>((set, _get) => ({
  // ── Initial state ──────────────────────────────────────────────────────
  ...loadFromHash(),

  // ── Actions ────────────────────────────────────────────────────────────

  applySelection: (sel: { dimension: Dimension; value: string }) => {
    set(s => {
      const filters = { ...s.filters };
      // Merge the selection into filters (WS7 will deepen cross-filter logic)
      switch (sel.dimension) {
        case 'agency':
          filters.agency = [sel.value];
          break;
        case 'category':
          filters.category = [sel.value];
          break;
        case 'subcategory':
          filters.subcategory = [sel.value];
          break;
        case 'vendor':
          filters.vendorIds = [sel.value];
          break;
        case 'fy': {
          const fyNum = Number(sel.value) as 2022 | 2023;
          if (!isNaN(fyNum)) filters.fy = [fyNum];
          break;
        }
        default:
          break;
      }
      const next = { ...s, filters };
      writeToHash(pickAppState(next));
      return next;
    });
  },

  setMeasure: (m: AppState['measure']) => {
    set(s => {
      const next = { ...s, measure: m };
      writeToHash(pickAppState(next));
      return next;
    });
  },

  setNetGross: (n: AppState['netGross']) => {
    set(s => {
      const next = { ...s, netGross: n };
      writeToHash(pickAppState(next));
      return next;
    });
  },

  setFilters: (f: AppFilters) => {
    set(s => {
      const next = { ...s, filters: f };
      writeToHash(pickAppState(next));
      return next;
    });
  },

  setTopN: (n: number) => {
    set(s => {
      const next = { ...s, topN: n };
      writeToHash(pickAppState(next));
      return next;
    });
  },

  drillTo: (sel: { dimension: Dimension; value: string }) => {
    set(s => {
      const drillPath = [...s.drillPath, sel];
      const filters = { ...s.filters };
      switch (sel.dimension) {
        case 'agency':      filters.agency = [sel.value]; break;
        case 'category':    filters.category = [sel.value]; break;
        case 'subcategory': filters.subcategory = [sel.value]; break;
        default: break;
      }
      const next = { ...s, drillPath, filters };
      writeToHash(pickAppState(next));
      return next;
    });
  },

  drillUp: (toIndex: number) => {
    set(s => {
      const drillPath = s.drillPath.slice(0, toIndex);
      // Rebuild filters from remaining drill path
      const filters: AppFilters = {};
      for (const step of drillPath) {
        switch (step.dimension) {
          case 'agency':      filters.agency = [step.value]; break;
          case 'category':    filters.category = [step.value]; break;
          case 'subcategory': filters.subcategory = [step.value]; break;
          default: break;
        }
      }
      const next = { ...s, drillPath, filters };
      writeToHash(pickAppState(next));
      return next;
    });
  },

  reset: () => {
    set(() => {
      const next = { ...DEFAULT_STATE };
      writeToHash(pickAppState(next));
      return next;
    });
  },

  setAskResult: (result: AskResponse | null) => {
    set(s => ({ ...s, askResult: result }));
  },

  setActiveTab: (tab: AppState['activeTab']) => {
    set(s => {
      const next = { ...s, activeTab: tab };
      writeToHash(pickAppState(next));
      return next;
    });
  },
}));

// ---------------------------------------------------------------------------
// Popstate listener (back/forward navigation)
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const fromHash = decodeState(window.location.hash);
    if (Object.keys(fromHash).length > 0) {
      useStore.setState({ ...DEFAULT_STATE, ...fromHash });
    }
  });
}

// Re-export decode/encode for tests
export { encodeState, decodeState, DEFAULT_STATE };
