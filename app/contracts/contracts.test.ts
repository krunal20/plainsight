import cube from '../fixtures/cube.fixture.json';
import result from '../fixtures/result.fixture.json';
import dimensions from '../fixtures/dimensions.fixture.json';
import vendors from '../fixtures/vendors.fixture.json';
import aievents from '../fixtures/aievents.fixture.json';
import type { Cube, QueryResult, Dimensions, AIEvent } from './index';

it('fixtures match contracts', () => {
  const c: Cube = cube as unknown as Cube;
  const r: QueryResult = result as unknown as QueryResult;
  expect(c.cells.length).toBeGreaterThan(0);
  expect(r.meta.totalNet).toBeTypeOf('number');
  expect(r.rows.every(x => typeof x.value === 'number')).toBe(true);
});

it('dimensions fixture has correct shape', () => {
  const d: Dimensions = dimensions as unknown as Dimensions;
  expect(d.agency.length).toBeGreaterThan(0);
  expect(d.category.length).toBeGreaterThan(0);
  expect(d.subcategory.length).toBeGreaterThan(0);
  expect(d.agency[0]).toHaveProperty('id');
  expect(d.agency[0]).toHaveProperty('label');
});

it('vendors fixture has unambiguous and ambiguous entries', () => {
  const v = vendors as Record<string, { vendorId: string; display: string; aliases: string[] }>;
  const entries = Object.values(v);
  expect(entries.length).toBeGreaterThan(0);
  // unambiguous: MICROSOFT CORP
  const microsoft = entries.find(e => e.aliases.some(a => a.toLowerCase() === 'microsoft corp'));
  expect(microsoft).toBeDefined();
  // ambiguous pair: two vendors matching "lam"
  const lamVendors = entries.filter(e => e.aliases.some(a => a.toLowerCase().startsWith('lam')));
  expect(lamVendors.length).toBeGreaterThanOrEqual(2);
});

it('aievents fixture is a non-empty array with required fields', () => {
  const events: AIEvent[] = aievents as unknown as AIEvent[];
  expect(events.length).toBeGreaterThanOrEqual(2);
  expect(events.every(e => typeof e.traceId === 'string')).toBe(true);
  expect(events.every(e => typeof e.ts === 'string')).toBe(true);
  expect(events.every(e => typeof e.step === 'string')).toBe(true);
  expect(events.some(e => e.step === 'compile')).toBe(true);
  expect(events.some(e => e.step === 'compute')).toBe(true);
});
