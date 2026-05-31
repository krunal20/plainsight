import { calMonth, cleanStr, fyOfFMonth, canonicalize } from './transform';

it('maps biennium FMonth to calendar month', () => {
  expect(calMonth(1)).toBe(1);
  expect(calMonth(12)).toBe(12);
  expect(calMonth(13)).toBe(1);
  expect(calMonth(24)).toBe(12);
});

it('derives FY from FMonth', () => {
  expect(fyOfFMonth(12)).toBe(2022);
  expect(fyOfFMonth(13)).toBe(2023);
});

it('trims pad + decodes entities', () => {
  expect(cleanStr('Grants &amp; Benefits   ')).toBe('Grants & Benefits');
});

it('canonicalizes vendor names to a stable slug', () => {
  expect(canonicalize('MICROSOFT CORP.')).toBe(canonicalize('Microsoft Corp'));
  expect(canonicalize('ACME LLC')).toBe(canonicalize('ACME'));
});
