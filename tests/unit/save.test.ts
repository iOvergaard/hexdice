import { describe, expect, it } from 'vitest';
import { chooseAction } from '../../src/ai';
import { makeConfig } from '../../src/engine/config';
import { Rng } from '../../src/engine/rng';
import { applyAction } from '../../src/engine/rules';
import { defaultSeats } from '../../src/engine/seats';
import { createGame } from '../../src/engine/setup';
import type { Action, GameConfig, GameState } from '../../src/engine/types';
import { restore, serialise } from '../../src/game/save';

const config = makeConfig(defaultSeats(3, 'normal'), 42);

/** Plays the AI for every seat until the stop predicate says so or the game ends. */
function play(cfg: GameConfig, stop: (n: number) => boolean): { state: GameState; actions: Action[] } {
  const rng = new Rng(7);
  let state = createGame(cfg);
  const actions: Action[] = [];
  while (state.winner === null && !stop(actions.length)) {
    const action = chooseAction(state, 'normal', rng);
    actions.push(action);
    state = applyAction(state, action).state;
  }
  return { state, actions };
}

describe('save', () => {
  it('round-trips to the same state as playing the actions', () => {
    const { state, actions } = play(config, (n) => n >= 40);
    const restored = restore(serialise(config, actions))!;
    expect(restored.state).toEqual(state);
    expect(restored.actions).toEqual(actions);
    expect(restored.config).toEqual(config);
  });

  it('restores a fresh game with an empty log', () => {
    expect(restore(serialise(config, []))!.state).toEqual(createGame(config));
    expect(restore(serialise(config, []))!.events).toEqual([]);
  });

  it("gives back the actions' events, so a resumed game's summary covers all of it", () => {
    const { actions } = play(config, (n) => n >= 40);
    let state = createGame(config);
    const events = actions.flatMap((a) => {
      const result = applyAction(state, a);
      state = result.state;
      return result.events;
    });
    expect(restore(serialise(config, actions))!.events).toEqual(events);
  });

  it('keeps the AI random state, and tolerates saves without one', () => {
    const config = makeConfig(defaultSeats(3), 11);
    expect(restore(serialise(config, [], 123456789))?.aiRngState).toBe(123456789);
    expect(restore(JSON.stringify({ v: 1, config, actions: [] }))?.aiRngState).toBeNull();
  });

  it('replays saves from before overflow behind the front with the reserve rule', () => {
    const { frontlineOverflow: _, ...old } = makeConfig(defaultSeats(3), 11);
    expect(restore(JSON.stringify({ v: 1, config: old, actions: [] }))?.config.frontlineOverflow).toBe('reserve');
  });

  it('replays saves from before the last stand without it', () => {
    const { lastStandDice: _, ...old } = makeConfig(defaultSeats(3), 11);
    expect(restore(JSON.stringify({ v: 1, config: old, actions: [] }))?.config.lastStandDice).toBe(0);
  });

  it('replays saves from before the connection bonus without it', () => {
    const { connectionBonus: _, ...old } = makeConfig(defaultSeats(3), 11);
    expect(restore(JSON.stringify({ v: 1, config: old, actions: [] }))?.config.connectionBonus).toBe('off');
  });

  it('gives null for missing and corrupt saves', () => {
    expect(restore(null)).toBeNull();
    expect(restore('')).toBeNull();
    expect(restore('{not json')).toBeNull();
    expect(restore('null')).toBeNull();
    expect(restore('{"v":1,"config":{},"actions":[]}')).toBeNull();
    expect(restore(JSON.stringify({ v: 1, config, actions: [{ type: 'nope' }] }))).toBeNull();
  });

  it('gives null for the wrong version', () => {
    expect(restore(JSON.stringify({ v: 2, config, actions: [] }))).toBeNull();
  });

  it('gives null when an action is no longer legal', () => {
    const illegal: Action[] = [{ type: 'attack', from: 0, to: 0 }];
    expect(restore(serialise(config, illegal))).toBeNull();
  });

  it('gives null for a finished game', () => {
    const { state, actions } = play(config, () => false);
    expect(state.winner).not.toBeNull();
    expect(restore(serialise(config, actions))).toBeNull();
  });
});
