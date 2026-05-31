/**
 * ShowSql tests
 * - hidden by default
 * - reveals SQL when button clicked
 * - SQL is in a read-only pre element
 * - toggle works (show → hide)
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShowSql } from './ShowSql';
import fixtureBase from '../../fixtures/result.fixture.json';
import type { QueryResult } from '../../contracts';

const fixture = fixtureBase as QueryResult;

describe('ShowSql', () => {
  it('renders disclosure button', () => {
    render(<ShowSql result={fixture} />);
    expect(screen.getByText('Show the SQL ›')).toBeTruthy();
  });

  it('SQL is hidden by default', () => {
    render(<ShowSql result={fixture} />);
    expect(screen.queryByLabelText('Generated SQL')).toBeNull();
    expect(screen.queryByText(/SELECT/i)).toBeNull();
  });

  it('reveals SQL when button is clicked', () => {
    render(<ShowSql result={fixture} />);
    fireEvent.click(screen.getByText('Show the SQL ›'));
    const pre = screen.getByLabelText('Generated SQL');
    expect(pre).toBeTruthy();
    expect(pre.textContent).toContain(fixture.sql);
  });

  it('SQL pre element is read-only', () => {
    render(<ShowSql result={fixture} />);
    fireEvent.click(screen.getByText('Show the SQL ›'));
    const pre = screen.getByLabelText('Generated SQL');
    expect(pre.getAttribute('aria-readonly')).toBe('true');
  });

  it('button text changes to "Hide SQL" after clicking', () => {
    render(<ShowSql result={fixture} />);
    fireEvent.click(screen.getByText('Show the SQL ›'));
    expect(screen.getByText('Hide SQL ›')).toBeTruthy();
  });

  it('hides SQL again when toggled back', () => {
    render(<ShowSql result={fixture} />);
    fireEvent.click(screen.getByText('Show the SQL ›'));
    fireEvent.click(screen.getByText('Hide SQL ›'));
    expect(screen.queryByLabelText('Generated SQL')).toBeNull();
  });

  it('renders the full SQL string in the pre', () => {
    render(<ShowSql result={fixture} />);
    fireEvent.click(screen.getByText('Show the SQL ›'));
    expect(screen.getByText(fixture.sql)).toBeTruthy();
  });
});
