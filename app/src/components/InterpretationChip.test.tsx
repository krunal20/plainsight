/**
 * InterpretationChip tests
 * - renders plain-English label from spec
 * - clicking opens editor
 * - editing topN and applying calls onApply with updated spec
 * - cancel restores previous state
 * - changing agg and applying calls onApply with new agg
 * - changing netGross and applying calls onApply
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InterpretationChip } from './InterpretationChip';
import fixtureBase from '../../fixtures/result.fixture.json';
import type { QueryResult, QuerySpec } from '../../contracts';

const fixture = fixtureBase as QueryResult;
const spec = fixture.spec;

describe('InterpretationChip', () => {
  it('renders a chip with plain-English label', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    // Should contain aggregation info
    expect(screen.getByLabelText('Edit query interpretation')).toBeTruthy();
  });

  it('chip label includes "sum" or "Total"', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    const chip = screen.getByLabelText('Edit query interpretation');
    expect(chip.textContent).toMatch(/Total/i);
  });

  it('chip label includes the groupBy dimension', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    const chip = screen.getByLabelText('Edit query interpretation');
    expect(chip.textContent).toMatch(/Agency/i);
  });

  it('chip label includes topN', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    const chip = screen.getByLabelText('Edit query interpretation');
    expect(chip.textContent).toContain('10');
  });

  it('opens editor when chip is clicked', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    fireEvent.click(screen.getByLabelText('Edit query interpretation'));
    expect(screen.getByLabelText('Edit query')).toBeTruthy();
    expect(screen.getByLabelText('Top N')).toBeTruthy();
  });

  it('editing topN and applying calls onApply with updated topN', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    fireEvent.click(screen.getByLabelText('Edit query interpretation'));
    // Change Top N to 25
    fireEvent.change(screen.getByLabelText('Top N'), { target: { value: '25' } });
    fireEvent.click(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const called = onApply.mock.calls[0][0] as QuerySpec;
    expect(called.topN).toBe(25);
  });

  it('editing agg and applying calls onApply with new agg', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    fireEvent.click(screen.getByLabelText('Edit query interpretation'));
    fireEvent.change(screen.getByLabelText('Aggregation'), { target: { value: 'avg' } });
    fireEvent.click(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const called = onApply.mock.calls[0][0] as QuerySpec;
    expect(called.agg).toBe('avg');
  });

  it('editing netGross and applying calls onApply with gross', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    fireEvent.click(screen.getByLabelText('Edit query interpretation'));
    fireEvent.change(screen.getByLabelText('Net or Gross'), { target: { value: 'gross' } });
    fireEvent.click(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const called = onApply.mock.calls[0][0] as QuerySpec;
    expect(called.netGross).toBe('gross');
  });

  it('cancel closes editor without calling onApply', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    fireEvent.click(screen.getByLabelText('Edit query interpretation'));
    fireEvent.change(screen.getByLabelText('Top N'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onApply).not.toHaveBeenCalled();
    // Editor should be gone
    expect(screen.queryByLabelText('Edit query')).toBeNull();
  });

  it('cancel returns to chip view', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    fireEvent.click(screen.getByLabelText('Edit query interpretation'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByLabelText('Edit query interpretation')).toBeTruthy();
  });

  it('topN is clamped to max 50', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    fireEvent.click(screen.getByLabelText('Edit query interpretation'));
    fireEvent.change(screen.getByLabelText('Top N'), { target: { value: '999' } });
    fireEvent.click(screen.getByText('Apply'));
    const called = onApply.mock.calls[0][0] as QuerySpec;
    expect(called.topN).toBe(50);
  });

  it('topN is clamped to min 1', () => {
    const onApply = vi.fn();
    render(<InterpretationChip spec={spec} onApply={onApply} />);
    fireEvent.click(screen.getByLabelText('Edit query interpretation'));
    fireEvent.change(screen.getByLabelText('Top N'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Apply'));
    const called = onApply.mock.calls[0][0] as QuerySpec;
    expect(called.topN).toBe(1);
  });
});
