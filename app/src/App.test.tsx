import { render, screen } from '@testing-library/react';
import App from './App';

it('renders Plainsight heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /plainsight/i })).toBeDefined();
});
