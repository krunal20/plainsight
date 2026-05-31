/**
 * Replay component tests
 * - encodeSpec / decodeSpec round-trip (via permalink)
 * - Replay button calls runQuery with the spec
 * - shows "Reproduced identically" on match
 * - shows diff on mismatch
 * - Copy link button renders
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Replay } from './Replay';
import { encodeSpec, decodeSpec } from '../lib/permalink';
import fixtureBase from '../../fixtures/result.fixture.json';
import type { QueryResult, Cube } from '../../contracts';

// Mock runQuery so we don't need a real cube or network
vi.mock('../lib/query/runQuery', () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from '../lib/query/runQuery';

const fixture = fixtureBase as QueryResult;

// Minimal cube stub
const stubCube: Cube = {
  cells: [],
  vendorsByAgency: {},
  totals: { net: 0, gross: 0, byFy: {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset clipboard mock
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  });
});

describe('Replay', () => {
  it('renders Replay button', () => {
    render(<Replay result={fixture} cube={stubCube} />);
    expect(screen.getByLabelText('Replay query')).toBeTruthy();
  });

  it('renders Copy link button', () => {
    render(<Replay result={fixture} cube={stubCube} />);
    expect(screen.getByLabelText('Copy permalink')).toBeTruthy();
  });

  it('calls runQuery with the spec on click', async () => {
    const mockRunQuery = vi.mocked(runQuery);
    mockRunQuery.mockResolvedValueOnce(fixture);

    render(<Replay result={fixture} cube={stubCube} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Replay query'));
    });
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
    expect(mockRunQuery).toHaveBeenCalledWith(
      fixture.spec,
      expect.objectContaining({ cube: stubCube }),
    );
  });

  it('shows "Reproduced identically" when results match', async () => {
    const mockRunQuery = vi.mocked(runQuery);
    mockRunQuery.mockResolvedValueOnce(fixture);

    render(<Replay result={fixture} cube={stubCube} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Replay query'));
    });
    expect(screen.getByText('Reproduced identically')).toBeTruthy();
  });

  it('shows diff when results differ', async () => {
    const mockRunQuery = vi.mocked(runQuery);
    const different: QueryResult = {
      ...fixture,
      rows: [{ label: 'OTHER', value: 999 }],
    };
    mockRunQuery.mockResolvedValueOnce(different);

    render(<Replay result={fixture} cube={stubCube} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Replay query'));
    });
    expect(screen.getByText('Results differ:')).toBeTruthy();
  });

  it('shows error message when runQuery throws', async () => {
    const mockRunQuery = vi.mocked(runQuery);
    mockRunQuery.mockRejectedValueOnce(new Error('query failed'));

    render(<Replay result={fixture} cube={stubCube} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Replay query'));
    });
    expect(screen.getByText(/Error:.*query failed/)).toBeTruthy();
  });

  it('Copy link calls clipboard with encoded spec in URL hash', async () => {
    render(<Replay result={fixture} cube={stubCube} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Copy permalink'));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const url = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('#spec=');
    // Decode and verify it round-trips
    const hashPart = url.split('#spec=')[1];
    expect(decodeSpec(hashPart)).toEqual(fixture.spec);
  });

  it('encode/decode permalink round-trip is lossless', () => {
    const encoded = encodeSpec(fixture.spec);
    expect(decodeSpec(encoded)).toEqual(fixture.spec);
  });
});
