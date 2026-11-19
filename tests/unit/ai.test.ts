import { describe, expect, it } from 'vitest';
import { chooseAction } from '../../src/ai';
import { makeConfig } from '../../src/engine/config';
import { Rng } from '../../src/engine/rng';
import { isLegalAttack } from '../../src/engine/rules';
import { aiSeats } from '../../src/engine/seats';
import { createGame } from '../../src/engine/setup';
import type { AiLevel } from '../../src/engine/types';
import { buildState } from '../fixtures/state';

const LEVELS: AiLevel[] = ['easy', 'normal'];

describe('ai', () => {
  it('ends the turn when there is no legal attack', () => {
    const state = buildState({ owners: [0, 1], dice: [1, 5], edges: [[0, 1]] });
    for (const level of LEVELS) expect(chooseAction(state, level, new Rng(1))).toEqual({ type: 'endTurn' });
  });

  it('only returns legal actions', () => {
    for (let i = 0; i < 200; i++) {
      const players = 2 + (i % 7);
      for (const level of LEVELS) {
        const state = createGame(makeConfig(aiSeats(Array.from({ length: players }, () => level)), i + 1));
        const action = chooseAction(state, level, new Rng(i));
        if (action.type === 'attack') expect(isLegalAttack(state, action.from, action.to)).toBe(true);
      }
    }
  });

  it('normal takes an overwhelming attack', () => {
    const state = buildState({ owners: [0, 1], dice: [8, 1], edges: [[0, 1]] });
    expect(chooseAction(state, 'normal', new Rng(1))).toEqual({ type: 'attack', from: 0, to: 1 });
  });

  it('normal declines a hopeless attack', () => {
    const state = buildState({ owners: [0, 1], dice: [2, 8], edges: [[0, 1]] });
    expect(chooseAction(state, 'normal', new Rng(1))).toEqual({ type: 'endTurn' });
  });

  it('normal attacks when every border is full', () => {
    const state = buildState({
      owners: [0, 1, 0, 1],
      dice: [8, 8, 8, 8],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
    });
    expect(chooseAction(state, 'normal', new Rng(1)).type).toBe('attack');
  });

  describe('normal and a runaway', () => {
    // From territory 0 (4 dice) Normal can hit the runaway's 1 or the small player's 2 at the same odds.
    // Taking 2 joins its two groups of three; the runaway holds 1 plus a chain of extras.
    function board(runawayTerritories: number) {
      const extras = runawayTerritories - 1;
      const owners = [0, 1, 2, 0, 0, 0, 0, 0, 2, ...Array.from({ length: extras }, () => 1)];
      const dice = [4, 3, 3, 1, 1, 1, 1, 1, 1, ...Array.from({ length: extras }, () => 1)];
      const edges: Array<[number, number]> = [[0, 1], [0, 2], [2, 3], [0, 4], [4, 5], [3, 6], [6, 7], [2, 8]];
      for (let i = 0; i < extras; i++) edges.push([i === 0 ? 1 : 8 + i, 9 + i]);
      return buildState({ owners, dice, edges });
    }

    it('goes after a player holding well above the average', () => {
      expect(chooseAction(board(10), 'normal', new Rng(1))).toEqual({ type: 'attack', from: 0, to: 1 });
    });

    it('prefers joining its groups when nobody runs away', () => {
      expect(chooseAction(board(6), 'normal', new Rng(1))).toEqual({ type: 'attack', from: 0, to: 2 });
    });
  });

  it('easy attacks sometimes', () => {
    const state = buildState({ owners: [0, 1], dice: [5, 3], edges: [[0, 1]] });
    let attacks = 0;
    for (let seed = 0; seed < 100; seed++) {
      if (chooseAction(state, 'easy', new Rng(seed)).type === 'attack') attacks++;
    }
    expect(attacks).toBeGreaterThan(0);
  });

  it('easy attacks at random, even against long odds, and sometimes ends its turn early', () => {
    const state = buildState({ owners: [0, 1], dice: [2, 8], edges: [[0, 1]] });
    const picks = Array.from({ length: 100 }, (_, seed) => chooseAction(state, 'easy', new Rng(seed)).type);
    expect(picks).toContain('attack');
    expect(picks).toContain('endTurn');
  });

  it('is deterministic for the same rng seed', () => {
    const state = createGame(makeConfig(aiSeats(['easy', 'normal', 'normal', 'easy']), 7));
    for (const level of LEVELS) {
      expect(chooseAction(state, level, new Rng(5))).toEqual(chooseAction(state, level, new Rng(5)));
    }
  });
});
