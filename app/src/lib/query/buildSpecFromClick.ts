import type { QuerySpec, Dimension } from '../../../contracts';

export interface Selection {
  dimension: Dimension;
  value: string;
}

/**
 * Pure function: given the current QuerySpec and a chart selection,
 * returns a NEW QuerySpec with the selection merged as a filter.
 *
 * Rules:
 * - agency / category / subcategory → set filters[dim] = [value]
 * - vendor → set filters.vendorIds = [value]
 * - fy     → set filters.fy = [Number(value)]
 * - month  → set filters.monthRange = [month, month]  (single month)
 *
 * Always returns a new object — never mutates the input spec or its filters.
 * Overwrites (not appends) the specific dimension filter on click (drill replaces).
 */
export function buildSpecFromClick(current: QuerySpec, sel: Selection): QuerySpec {
  const filters = { ...current.filters };

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
    case 'fy':
      filters.fy = [Number(sel.value) as 2022 | 2023];
      break;
    case 'month': {
      const m = Number(sel.value);
      filters.monthRange = [m, m];
      break;
    }
  }

  return { ...current, filters };
}
