/**
 * ProvenanceStrip tests
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProvenanceStrip } from './ProvenanceStrip';

describe('ProvenanceStrip', () => {
  it('renders without crashing', () => {
    render(<ProvenanceStrip />);
    expect(screen.getByLabelText('Data provenance')).toBeTruthy();
  });

  it('shows source text', () => {
    render(<ProvenanceStrip />);
    expect(screen.getByText(/WA vendor payments/i)).toBeTruthy();
  });

  it('shows fiscal year range', () => {
    render(<ProvenanceStrip />);
    expect(screen.getByText(/FY2022/i)).toBeTruthy();
  });

  it('shows row count', () => {
    render(<ProvenanceStrip />);
    expect(screen.getByText(/935,853/)).toBeTruthy();
  });

  it('shows not invoice-level note', () => {
    render(<ProvenanceStrip />);
    expect(screen.getByText(/not invoice-level/i)).toBeTruthy();
  });

  it('shows unnormalized vendor names caveat', () => {
    render(<ProvenanceStrip />);
    expect(screen.getByText(/[Uu]nnormalized vendor names/)).toBeTruthy();
  });

  it('shows net of refunds note', () => {
    render(<ProvenanceStrip />);
    expect(screen.getByText(/Net of refunds/i)).toBeTruthy();
  });

  it('shows reversal count', () => {
    render(<ProvenanceStrip />);
    expect(screen.getByText(/1,083/)).toBeTruthy();
  });
});
