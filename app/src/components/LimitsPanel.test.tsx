/**
 * LimitsPanel tests
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LimitsPanel } from './LimitsPanel';

describe('LimitsPanel', () => {
  it('renders the heading', () => {
    render(<LimitsPanel />);
    expect(screen.getByText("What this data can't tell you")).toBeTruthy();
  });

  it('mentions invoice limitation', () => {
    render(<LimitsPanel />);
    expect(screen.getByText(/invoice/i)).toBeTruthy();
  });

  it('mentions geography limitation', () => {
    render(<LimitsPanel />);
    expect(screen.getByText(/geography/i)).toBeTruthy();
  });

  it('mentions budget-vs-actual limitation', () => {
    render(<LimitsPanel />);
    expect(screen.getByText(/budget-vs-actual/i)).toBeTruthy();
  });

  it('mentions vendor type limitation', () => {
    render(<LimitsPanel />);
    expect(screen.getByText(/vendor type/i)).toBeTruthy();
  });

  it('mentions causal why limitation', () => {
    render(<LimitsPanel />);
    expect(screen.getByText(/causal/i)).toBeTruthy();
  });

  it('mentions forecast limitation', () => {
    render(<LimitsPanel />);
    expect(screen.getByText(/forecast/i)).toBeTruthy();
  });

  it('renders a list with aria-label', () => {
    render(<LimitsPanel />);
    expect(screen.getByLabelText('Data limitations')).toBeTruthy();
  });

  it('renders 6 limitation items', () => {
    render(<LimitsPanel />);
    const list = screen.getByLabelText('Data limitations');
    const items = list.querySelectorAll('li');
    expect(items.length).toBe(6);
  });
});
