import { render, screen } from '@testing-library/react';
import App from './App';

// Minimal stub for fetch (cube/dimensions won't load in jsdom)
global.fetch = vi.fn().mockRejectedValue(new Error('no network in test'));

it('renders Plainsight logo text', () => {
  render(<App />);
  // AppHeader renders "Plainsight" as a span
  const logos = screen.getAllByText(/plainsight/i);
  expect(logos.length).toBeGreaterThan(0);
});
