import { describe, expect, it } from 'vitest';
import { stackSplit } from '../../src/ui/units';

describe('stackSplit', () => {
  it('keeps up to 3 dice in one stack', () => {
    expect(stackSplit(1)).toEqual([1]);
    expect(stackSplit(3)).toEqual([3]);
  });

  it('splits 4 to 8 dice into two stacks of up to 4, the left one never shorter', () => {
    expect([4, 5, 6, 7, 8].map(stackSplit)).toEqual([[2, 2], [3, 2], [3, 3], [4, 3], [4, 4]]);
  });
});
