/**
 * GlassBox tests
 * - renders event count badge
 * - expands when header clicked
 * - shows plain-English row for each event
 * - cached badge appears for cached events
 * - engineer toggle reveals raw JSON
 * - seeds events from fixture
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GlassBox } from './GlassBox';
import type { AIEvent, LogApi } from '../../contracts';
import fixtureEvents from '../../fixtures/aievents.fixture.json';

function makeLog(initial: AIEvent[] = []): LogApi & { _emit: (e: AIEvent) => void } {
  const buffer = [...initial];
  const subs = new Set<(e: AIEvent) => void>();
  return {
    all: () => [...buffer],
    append: (e) => {
      buffer.push(e);
      subs.forEach((cb) => cb(e));
    },
    subscribe: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    _emit: (e) => {
      buffer.push(e);
      subs.forEach((cb) => cb(e));
    },
  };
}

const events = fixtureEvents as AIEvent[];

describe('GlassBox', () => {
  it('renders without crashing', () => {
    const log = makeLog();
    render(<GlassBox log={log} />);
    expect(screen.getByLabelText('Toggle AI activity log')).toBeTruthy();
  });

  it('shows event count badge with correct number', () => {
    const log = makeLog(events);
    render(<GlassBox log={log} />);
    // badge shows count of events (3 in fixture)
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('shows 0 badge when log is empty', () => {
    const log = makeLog([]);
    render(<GlassBox log={log} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('expands when header is clicked', () => {
    const log = makeLog(events);
    render(<GlassBox log={log} />);
    // Initially collapsed — events not visible
    expect(screen.queryByText(/Understood/)).toBeNull();
    // Click to expand
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    // compile step should show "Understood"
    expect(screen.getByText(/Understood/)).toBeTruthy();
  });

  it('renders plain-English description for compile step', () => {
    const log = makeLog(events);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    expect(screen.getByText(/Understood.*built a query/i)).toBeTruthy();
  });

  it('renders plain-English description for compute step', () => {
    const log = makeLog(events);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    expect(screen.getByText(/Computed results/i)).toBeTruthy();
  });

  it('renders plain-English description for narrate step', () => {
    const log = makeLog(events);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    expect(screen.getByText(/plain-English interpretation/i)).toBeTruthy();
  });

  it('shows "No AI activity yet" when log is empty and panel open', () => {
    const log = makeLog([]);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    expect(screen.getByText('No AI activity yet.')).toBeTruthy();
  });

  it('shows "cached" badge for cached events', () => {
    const cachedEvent: AIEvent = {
      ...events[0],
      cached: true,
    };
    const log = makeLog([cachedEvent]);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    expect(screen.getByText('cached')).toBeTruthy();
  });

  it('does NOT show cached badge for non-cached events', () => {
    const log = makeLog([{ ...events[0], cached: false }]);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    expect(screen.queryByText('cached')).toBeNull();
  });

  it('engineer toggle reveals raw JSON pre block', () => {
    const log = makeLog(events);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    // Engineer toggle should be a checkbox
    const toggle = screen.getByLabelText('Engineer mode');
    expect(toggle).toBeTruthy();
    // No pre blocks initially
    expect(document.querySelectorAll('pre').length).toBe(0);
    // Enable engineer mode
    fireEvent.click(toggle);
    // Now there should be pre blocks (one per event)
    expect(document.querySelectorAll('pre').length).toBeGreaterThan(0);
  });

  it('engineer JSON contains step field', () => {
    const log = makeLog([events[0]]);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    fireEvent.click(screen.getByLabelText('Engineer mode'));
    const pre = document.querySelector('pre');
    expect(pre?.textContent).toContain('"step"');
  });

  it('shows Download log button when events exist', () => {
    const log = makeLog(events);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    expect(screen.getByText('Download log')).toBeTruthy();
  });

  it('does NOT show Download log button when empty', () => {
    const log = makeLog([]);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    expect(screen.queryByText('Download log')).toBeNull();
  });

  it('subscribes to new events and updates count', () => {
    const log = makeLog([]);
    render(<GlassBox log={log} />);
    // Initially 0
    expect(screen.getByText('0')).toBeTruthy();
    // Append a new event
    act(() => {
      log.append(events[0]);
    });
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('shows new events in list after subscribe fires', () => {
    const log = makeLog([]);
    render(<GlassBox log={log} />);
    fireEvent.click(screen.getByLabelText('Toggle AI activity log'));
    act(() => {
      log.append(events[0]);
    });
    expect(screen.getByText(/Understood/)).toBeTruthy();
  });

  it('collapses when header clicked again', () => {
    const log = makeLog(events);
    render(<GlassBox log={log} />);
    const header = screen.getByLabelText('Toggle AI activity log');
    fireEvent.click(header); // open
    expect(screen.getByText(/Understood/)).toBeTruthy();
    fireEvent.click(header); // close
    expect(screen.queryByText(/Understood/)).toBeNull();
  });
});
