import type { Dimension, AskResponse } from '../../contracts';

export interface AppFilters {
  agency?: string[]; category?: string[]; subcategory?: string[];
  vendorIds?: string[]; fy?: (2022 | 2023)[];
}

export interface AppState {
  filters: AppFilters;
  measure: 'sum' | 'avg' | 'share' | 'yoy_delta' | 'distinct_count';
  netGross: 'net' | 'gross';
  topN: number;
  drillPath: { dimension: Dimension; value: string }[];
  compare?: { dimension: 'fy' | 'agency' | 'category'; a: string; b: string };
  activeTab: 'overview' | 'vendors' | 'compare' | 'changed' | 'ask';
  /** Populated when AskBar submits a query; drives the Report view */
  askResult?: AskResponse | null;
}

export interface StoreActions {
  // WS2 wires onSelect to this; WS7 cross-filter merge via buildSpecFromClick logic
  applySelection: (sel: { dimension: Dimension; value: string }) => void;
  setMeasure: (m: AppState['measure']) => void;
  setNetGross: (n: AppState['netGross']) => void;
  setFilters: (f: AppFilters) => void;
  setTopN: (n: number) => void;
  drillTo: (sel: { dimension: Dimension; value: string }) => void;
  drillUp: (toIndex: number) => void;
  reset: () => void;
  setAskResult: (result: AskResponse | null) => void;
  setActiveTab: (tab: AppState['activeTab']) => void;
}

export type Store = AppState & StoreActions;
