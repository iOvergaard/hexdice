import { describe, expect, it } from 'vitest';
import { gangedUpOn, runawayBar, runaways } from '../../src/ai/runaway';
import type { AiLevel, GameState, PlayerId } from '../../src/engine/types';
import { buildState } from '../fixtures/state';

/** No borders needed: the runaway test only counts territories. */
function held(counts: number[]): GameState {
  const owners = counts.flatMap((n, id) => Array.from({ length: n }, () => id));
  return buildState({ owners, dice: owners.map(() => 1), edges: [], players: counts.length });
}

function seat(state: GameState, id: PlayerId, kind: 'human' | AiLevel): void {
  const p = state.players[id]!;
  p.kind = kind === 'human' ? 'human' : 'ai';
  p.aiLevel = kind === 'human' ? undefined : kind;
}

describe('runaway bar', () => {
  it('is 8 territories at 8 to 6 players, 9 at 5, 12 at 4, 15 at 3 and 23 at 2 on a 30-territory map', () => {
    expect([8, 7, 6, 5, 4, 3, 2].map((alive) => runawayBar(30, alive))).toEqual([8, 8, 8, 9, 12, 15, 23]);
  });

  it('never drops below 8', () => {
    expect(runawayBar(10, 4)).toBe(8);
  });
});

describe('runaways', () => {
  it('are the players at or over the bar', () => {
    expect(runaways(held([15, 14, 1]))).toEqual(new Set([0]));
    expect(runaways(held([14, 14, 2]))).toEqual(new Set());
    expect(runaways(held([8, 3, 3, 3, 3, 3, 3, 4]))).toEqual(new Set([0]));
    expect(runaways(held([7, 4, 3, 3, 3, 3, 3, 4]))).toEqual(new Set());
  });

  it('count only the players still in', () => {
    // 30 territories, three of four players in: the bar is 15, not 12.
    const state = held([14, 14, 2, 0]);
    expect(state.players[3]!.alive).toBe(false);
    expect(runaways(state)).toEqual(new Set());
  });

  it('include the player whose turn it is', () => {
    const state = held([15, 14, 1]);
    state.current = 0;
    expect(runaways(state)).toEqual(new Set([0]));
  });
});

describe('ganged up on', () => {
  it('is every runaway while another Normal computer player is in', () => {
    const state = held([12, 12, 3, 3]);
    seat(state, 0, 'human');
    expect(gangedUpOn(state)).toEqual(new Set([0, 1]));
  });

  it('is nobody when the computer players are all Easy', () => {
    const state = held([12, 6, 6, 6]);
    seat(state, 0, 'human');
    for (const id of [1, 2, 3]) seat(state, id, 'easy');
    expect(runaways(state)).toEqual(new Set([0]));
    expect(gangedUpOn(state)).toEqual(new Set());
  });

  it('leaves out a runaway that is the only Normal player', () => {
    const state = held([6, 12, 6, 6]);
    seat(state, 0, 'human');
    seat(state, 2, 'easy');
    seat(state, 3, 'easy');
    expect(gangedUpOn(state)).toEqual(new Set());
    seat(state, 3, 'normal');
    expect(gangedUpOn(state)).toEqual(new Set([1]));
  });

  it('is nobody with two players left, since there is no one else to pick', () => {
    const state = held([23, 7]);
    seat(state, 0, 'human');
    expect(runaways(state)).toEqual(new Set([0]));
    expect(gangedUpOn(state)).toEqual(new Set());
  });

  it('treats a computer player with no level as Normal, as the controller does', () => {
    const state = held([12, 6, 6, 6]);
    seat(state, 0, 'human');
    for (const id of [1, 2, 3]) state.players[id]!.aiLevel = undefined;
    expect(gangedUpOn(state)).toEqual(new Set([0]));
  });
});
