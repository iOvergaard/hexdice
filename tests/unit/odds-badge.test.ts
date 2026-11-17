import { describe, expect, it } from 'vitest';
import { formatOdds } from '../../src/ui/odds-badge';

describe('formatOdds', () => {
  it('rounds to whole percentages', () => {
    expect(formatOdds(0.74).text).toBe('74%');
    expect(formatOdds(0.736).text).toBe('74%');
    expect(formatOdds(0.5).text).toBe('50%');
  });

  it('bands at 60% and 40%', () => {
    expect(formatOdds(0.6).band).toBe('good');
    expect(formatOdds(0.5999).band).toBe('risky');
    expect(formatOdds(0.4).band).toBe('risky');
    expect(formatOdds(0.3999).band).toBe('poor');
    expect(formatOdds(0).band).toBe('poor');
    expect(formatOdds(1).band).toBe('good');
  });

  it('only shows 100% for certainty and 0% for impossibility', () => {
    expect(formatOdds(0.995).text).toBe('99%');
    expect(formatOdds(0.9999).text).toBe('99%');
    expect(formatOdds(1).text).toBe('100%');
    expect(formatOdds(0.001).text).toBe('1%');
    expect(formatOdds(0).text).toBe('0%');
  });
});
