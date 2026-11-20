import { describe, expect, it } from 'vitest';
import { chooseAction } from '../../src/ai';
import { makeConfig } from '../../src/engine/config';
import { winProbability } from '../../src/engine/odds';
import { Rng } from '../../src/engine/rng';
import { applyAction } from '../../src/engine/rules';
import { defaultSeats } from '../../src/engine/seats';
import { createGame } from '../../src/engine/setup';
import type { GameEvent, GameState } from '../../src/engine/types';
import { ordinal, summarise } from '../../src/game/summary';

/** Plays the AI for every seat until `stop` says so or someone wins. */
function play(seed: number, players: number, stop: (s: GameState, events: GameEvent[]) => boolean = () => false) {
  const start = createGame(makeConfig(defaultSeats(players - 1, 'normal'), seed));
  const rng = new Rng(seed ^ 0x9e3779b9);
  let state = start;
  const events: GameEvent[] = [];
  while (state.winner === null && !stop(state, events)) {
    const result = applyAction(state, chooseAction(state, 'normal', rng));
    state = result.state;
    events.push(...result.events);
  }
  return { start, state, events };
}

describe('summarise', () => {
  it.each([
    [7, 4],
    [42, 8],
    [5, 3],
  ])('agrees with a whole game (seed %i, %i players)', (seed, players) => {
    const { start, state, events } = play(seed, players);
    const s = summarise(start, events, state);
    expect(s.winner).toBe(state.winner);
    expect(s.rounds).toBe(state.round);
    expect(s.players).toBe(players);
    for (const sample of s.timeline) expect(sample.counts.reduce((a, b) => a + b)).toBe(state.territories.length);
    expect(s.timeline[0]!.counts).toEqual(state.players.map((p) => start.territories.filter((t) => t.owner === p.id).length));
    expect(s.timeline.at(-1)!.counts).toEqual(state.players.map((p) => (p.id === state.winner ? state.territories.length : 0)));
    expect(s.timeline.map((x) => x.round)).toEqual([...Array.from({ length: state.round }, (_, i) => i + 1), state.round]);

    expect(s.standings.map((x) => x.place)).toEqual(Array.from({ length: players }, (_, i) => i + 1));
    const [first, ...rest] = s.standings;
    expect(first!.player).toBe(state.winner);
    expect(first!.outRound).toBeNull();
    for (const x of rest) {
      expect(x.outRound).not.toBeNull();
      expect(x.outBy).not.toBeNull();
    }
    // Later places went out no later than earlier ones.
    for (let i = 1; i < rest.length; i++) expect(rest[i]!.outRound!).toBeLessThanOrEqual(rest[i - 1]!.outRound!);

    for (const x of s.standings) {
      expect(x.knockouts).toBe(state.players[x.player]!.knockouts);
      // The peak counts every capture, not just the once-a-round samples.
      let held = s.timeline[0]!.counts[x.player]!;
      let peak = held;
      for (const e of events) {
        if (e.type !== 'territoryCaptured') continue;
        if (e.newOwner === x.player) peak = Math.max(peak, ++held);
        if (e.previousOwner === x.player) held--;
      }
      expect(x.peak).toBe(peak);
      expect(x.peak).toBeGreaterThanOrEqual(Math.max(...s.timeline.map((t) => t.counts[x.player]!)));
      expect(x.captures).toBe(events.filter((e) => e.type === 'territoryCaptured' && e.newOwner === x.player).length);
      const wins = events.filter((e) => e.type === 'attackRolled' && e.success && e.attacker === x.player);
      const upset = s.upsets[x.player];
      if (wins.length === 0) expect(upset).toBeNull();
      for (const w of wins) {
        if (w.type !== 'attackRolled') continue;
        expect(upset!.chance).toBeLessThanOrEqual(winProbability(w.attackRolls.length, w.defendRolls.length, w.shaken));
      }
    }
  });

  it('rates a win on a tie against a shaken defender at the odds it had', () => {
    const { start } = play(7, 4, () => true);
    const roll: GameEvent = { type: 'attackRolled', attacker: 0, defender: 1, from: 0, to: 1, attackRolls: [3, 3], defendRolls: [4, 2], attackSum: 6, defendSum: 6, success: true, shaken: true };
    expect(summarise(start, [roll], start).upsets[0]!.chance).toBeCloseTo(winProbability(2, 2, true), 12);
  });

  it('ranks those still in by territories held while play goes on', () => {
    const { start, state, events } = play(42, 8, (_, ev) => ev.some((e) => e.type === 'playerEliminated'));
    const s = summarise(start, events, state);
    const alive = state.players.filter((p) => p.alive).length;
    expect(s.winner).toBeNull();
    const out = s.standings.filter((x) => x.outRound !== null);
    expect(out).toHaveLength(1);
    expect(out[0]!.place).toBe(alive + 1);
    const inPlay = s.standings.filter((x) => x.outRound === null);
    expect(inPlay.map((x) => x.place)).toEqual(Array.from({ length: alive }, (_, i) => i + 1));
    const held = inPlay.map((x) => s.timeline.at(-1)!.counts[x.player]!);
    expect(held).toEqual([...held].sort((a, b) => b - a));
  });

  it('counts attacks made and won, and defences faced and held, for the scoreboard', () => {
    const { start, state, events } = play(42, 8);
    const s = summarise(start, events, state);
    const rolls = events.filter((e): e is Extract<GameEvent, { type: 'attackRolled' }> => e.type === 'attackRolled');
    for (const x of s.standings) {
      const made = rolls.filter((r) => r.attacker === x.player);
      const faced = rolls.filter((r) => r.defender === x.player);
      expect(x.attacks).toBe(made.length);
      expect(x.attacksWon).toBe(made.filter((r) => r.success).length);
      expect(x.defences).toBe(faced.length);
      expect(x.defencesHeld).toBe(faced.filter((r) => !r.success).length);
      // Every won attack takes a territory.
      expect(x.attacksWon).toBe(x.captures);
    }
    expect(s.standings.reduce((n, x) => n + x.attacks, 0)).toBe(rolls.length);
    expect(s.standings.reduce((n, x) => n + x.defences, 0)).toBe(rolls.length);
  });

  it('counts the biggest turn from the captures in one turn', () => {
    const { start, state, events } = play(7, 4);
    const s = summarise(start, events, state);
    for (const x of s.standings) {
      let best = 0;
      let run = 0;
      for (const e of events) {
        if (e.type === 'turnStarted') run = 0;
        if (e.type === 'territoryCaptured' && e.newOwner === x.player) best = Math.max(best, ++run);
      }
      expect(s.bigTurns[x.player]?.captures ?? 0).toBe(best);
    }
  });
});

describe('ordinal', () => {
  it('suffixes like English does', () => {
    expect([1, 2, 3, 4, 8, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '8th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st']);
  });
});
