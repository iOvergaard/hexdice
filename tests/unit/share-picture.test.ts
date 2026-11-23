import { describe, expect, it } from 'vitest';
import { pictureDate, wrapText } from '../../src/ui/share-picture';

describe('wrapText', () => {
  const measure = (s: string): number => s.length;

  it('breaks between words so no line is wider than the limit', () => {
    expect(wrapText('You held up to 12 territories in round 4.', 16, measure)).toEqual(['You held up to', '12 territories', 'in round 4.']);
  });

  it('keeps a short text on one line, and gives a long word a line to itself', () => {
    expect(wrapText('Atlas wins', 20, measure)).toEqual(['Atlas wins']);
    expect(wrapText('a Supercalifragilistic b', 6, measure)).toEqual(['a', 'Supercalifragilistic', 'b']);
    expect(wrapText('  ', 6, measure)).toEqual([]);
  });
});

describe('pictureDate', () => {
  it('writes DD-MM-YYYY', () => {
    expect(pictureDate(new Date(2026, 10, 3))).toBe('03-11-2026');
  });
});
