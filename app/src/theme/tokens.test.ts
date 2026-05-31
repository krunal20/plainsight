import { tokens } from './tokens';

describe('tokens', () => {
  it('lead color is the brand orange', () => {
    expect(tokens.lead).toBe('#ef6a1e');
  });

  it('series palette has exactly 4 entries', () => {
    expect(tokens.series.length).toBe(4);
  });
});
