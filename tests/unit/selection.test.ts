import { describe, expect, it } from 'vitest';
import { nextSelection, selectionAfterAttack, targetsFor } from '../../src/ui/selection';
import { buildState } from '../fixtures/state';
import type { GameState } from '../../src/engine/types';

// Chain 0-1-2-3-4-5. Player 0 owns 0, 2, 3, 5 (3, 1, 4, 2 dice); player 1 owns 1 and 4 (2 and 5 dice).
const state = buildState({
  owners: [0, 1, 0, 0, 1, 0],
  dice: [3, 2, 1, 4, 5, 2],
  edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
  players: 2,
});

const canAttack = (s: GameState) => (from: number, to: number) => {
  const f = s.territories[from]!;
  const t = s.territories[to]!;
  return f.owner === s.current && t.owner !== f.owner && f.neighbours.includes(to) && f.dice >= 2;
};

describe('nextSelection', () => {
  const can = canAttack(state);

  it('tapping own territory with 2+ dice selects it', () => {
    expect(nextSelection(state, null, 0, can)).toEqual({ selected: 0, attack: null });
  });

  it('tapping a spent stack does not select it', () => {
    const spent = { ...state, spent: [0] };
    expect(nextSelection(spent, null, 0, can)).toEqual({ selected: null, attack: null });
    expect(nextSelection(spent, 3, 0, can)).toEqual({ selected: null, attack: null });
  });

  it('tapping own 1-die territory clears selection', () => {
    expect(nextSelection(state, 0, 2, can)).toEqual({ selected: null, attack: null });
    expect(nextSelection(state, null, 2, can)).toEqual({ selected: null, attack: null });
  });

  it('tapping the selected territory deselects', () => {
    expect(nextSelection(state, 3, 3, can)).toEqual({ selected: null, attack: null });
  });

  it('tapping another own 2+ territory switches', () => {
    expect(nextSelection(state, 0, 3, can)).toEqual({ selected: 3, attack: null });
  });

  it('tapping a legal target returns the attack and clears selection', () => {
    expect(nextSelection(state, 0, 1, can)).toEqual({ selected: null, attack: { from: 0, to: 1 } });
  });

  it('tapping an illegal enemy clears selection', () => {
    expect(nextSelection(state, 0, 4, can)).toEqual({ selected: null, attack: null });
    expect(nextSelection(state, null, 4, can)).toEqual({ selected: null, attack: null });
  });

  it('tapping sea clears selection', () => {
    expect(nextSelection(state, 0, null, can)).toEqual({ selected: null, attack: null });
  });
});

describe('selectionAfterAttack', () => {
  // After the attack: player 0 took 1 from 0 and moved in 2 dice; 2 (1 die) and 4 (5 dice) are still player 1's.
  const after = (dice1: number, owner1 = 0, winner: number | null = null): GameState => ({
    ...buildState({
      owners: [0, owner1, 1, 0, 1, 0],
      dice: [1, dice1, 1, 4, 5, 2],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
      players: 2,
    }),
    winner,
  });

  it('keeps a fresh capture with 2+ dice and a target selected', () => {
    const s = after(2);
    expect(selectionAfterAttack(s, { from: 0, to: 1 }, canAttack(s))).toBe(1);
  });

  it('then the next tap on a target attacks on from it', () => {
    const s = after(2);
    const selected = selectionAfterAttack(s, { from: 0, to: 1 }, canAttack(s));
    expect(nextSelection(s, selected, 2, canAttack(s))).toEqual({ selected: null, attack: { from: 1, to: 2 } });
  });

  it('clears a capture left with 1 die', () => {
    const s = after(1);
    expect(selectionAfterAttack(s, { from: 0, to: 1 }, canAttack(s))).toBeNull();
  });

  it('clears a capture with no enemy next to it', () => {
    const s = after(3);
    s.territories[2]!.owner = 0;
    expect(selectionAfterAttack(s, { from: 0, to: 1 }, canAttack(s))).toBeNull();
  });

  it('clears after a failed attack, even if the attacker still has 2+ dice', () => {
    const s = after(2, 1);
    expect(selectionAfterAttack(s, { from: 3, to: 2 }, canAttack(s))).toBeNull();
    expect(selectionAfterAttack(s, { from: 0, to: 1 }, canAttack(s))).toBeNull();
  });

  it('clears when the capture won the game', () => {
    const s = after(2, 0, 0);
    expect(selectionAfterAttack(s, { from: 0, to: 1 }, canAttack(s))).toBeNull();
  });
});

describe('targetsFor', () => {
  it('lists exactly the legal targets', () => {
    const can = canAttack(state);
    expect(targetsFor(state, 3, can)).toEqual([4]);
    expect(targetsFor(state, 0, can)).toEqual([1]);
    expect(targetsFor(state, 2, can)).toEqual([]);
  });
});
