import { describe, expect, it } from 'vitest';
import { makeConfig } from '../../src/engine/config';
import { applyAction, legalAttacks } from '../../src/engine/rules';
import { defaultSeats } from '../../src/engine/seats';
import { createGame } from '../../src/engine/setup';
import type { GameState } from '../../src/engine/types';
import { boardDiff } from '../../src/game/log-check';
import { restore, serialise } from '../../src/game/save';

const start = createGame(makeConfig(defaultSeats(3, 'normal'), 42));

function firstAttack(s: GameState): GameState {
  const [a] = legalAttacks(s);
  return applyAction(s, { type: 'attack', from: a!.from, to: a!.to }).state;
}

describe('boardDiff', () => {
  it('finds nothing between a state and its replayed copy', () => {
    const played = firstAttack(start);
    const replayed = firstAttack(createGame(start.config));
    expect(boardDiff(played, replayed)).toEqual([]);
  });

  it('names the territories, the turn and the dice stream when an action is missing', () => {
    const played = firstAttack(start);
    const diff = boardDiff(played, start);
    expect(diff.some((d) => d.startsWith('territory '))).toBe(true);
    expect(diff).toContain(`rngState ${played.rngState} vs ${start.rngState}`);
  });

  it('notices whose turn it is', () => {
    const next = applyAction(start, { type: 'endTurn' }).state;
    expect(boardDiff(next, start)).toContain(`current ${next.current} vs ${start.current}`);
  });
});

describe('serialise with problems', () => {
  it('adds them to the record and still restores the game', () => {
    const raw = serialise(start.config, [], 1, ['at 3: live board differs from the log']);
    expect(JSON.parse(raw).problems).toEqual(['at 3: live board differs from the log']);
    expect(restore(raw)!.state).toEqual(start);
  });

  it('leaves them out when there are none', () => {
    expect(JSON.parse(serialise(start.config, [], 1, [])).problems).toBeUndefined();
  });
});
