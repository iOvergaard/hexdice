import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/engine/rng';
import { applyAction, isLegalAttack, largestGroup, legalAttacks } from '../../src/engine/rules';
import { IllegalActionError } from '../../src/engine/types';
import type { AttackRolledEvent, GameEvent, GameState } from '../../src/engine/types';
import { buildState } from '../fixtures/state';

/** Line 0-1-2-3-4: P0 owns 0 and 2, P1 owns 1, 3 and 4. */
function line(seed = 1): GameState {
  return buildState({
    owners: [0, 1, 0, 1, 1],
    dice: [3, 1, 4, 2, 5],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
    seed,
  });
}

const rolled = (events: GameEvent[]): AttackRolledEvent =>
  events.find((e): e is AttackRolledEvent => e.type === 'attackRolled')!;

describe('legality', () => {
  it('cannot attack from a 1-die territory', () => {
    const s = buildState({ owners: [0, 1], dice: [1, 3], edges: [[0, 1]] });
    expect(isLegalAttack(s, 0, 1)).toBe(false);
    expect(() => applyAction(s, { type: 'attack', from: 0, to: 1 })).toThrow(IllegalActionError);
  });

  it('cannot attack own territory', () => {
    const s = buildState({ owners: [0, 0, 1], dice: [3, 3, 1], edges: [[0, 1], [1, 2]] });
    expect(isLegalAttack(s, 0, 1)).toBe(false);
  });

  it('cannot attack a non-neighbour', () => {
    expect(isLegalAttack(line(), 0, 3)).toBe(false);
  });

  it("cannot attack from another player's territory", () => {
    const s = buildState({ owners: [0, 1], dice: [3, 3], edges: [[0, 1]] });
    expect(isLegalAttack(s, 1, 0)).toBe(false);
  });

  it('no actions after game over', () => {
    const s = { ...buildState({ owners: [0, 1], dice: [3, 3], edges: [[0, 1]] }), winner: 0 };
    expect(isLegalAttack(s, 0, 1)).toBe(false);
    expect(legalAttacks(s)).toEqual([]);
    expect(() => applyAction(s, { type: 'endTurn' })).toThrow(IllegalActionError);
    expect(() => applyAction(s, { type: 'attack', from: 0, to: 1 })).toThrow(IllegalActionError);
  });

  it('legalAttacks lists exactly the legal pairs', () => {
    // P0 owns 0 (3), 2 (4), 4 (1 die); P1 owns 1, 3. Edges: 0-1, 1-2, 2-3, 3-4, 0-3.
    const s = buildState({
      owners: [0, 1, 0, 1, 0],
      dice: [3, 2, 4, 5, 1],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 3]],
    });
    expect(legalAttacks(s)).toEqual([
      { from: 0, to: 1 },
      { from: 0, to: 3 },
      { from: 2, to: 1 },
      { from: 2, to: 3 },
    ]);
  });
});

describe('applyAction', () => {
  it('does not mutate its input', () => {
    for (const action of [{ type: 'attack', from: 0, to: 1 }, { type: 'endTurn' }] as const) {
      const s = line();
      const before = structuredClone(s);
      const { state } = applyAction(s, action);
      expect(s).toEqual(before);
      expect(state.config).toBe(s.config);
      expect(state.board).toBe(s.board);
    }
  });

  it('same state and action give the same result', () => {
    const a = applyAction(line(5), { type: 'attack', from: 0, to: 1 });
    const b = applyAction(line(5), { type: 'attack', from: 0, to: 1 });
    expect(a).toEqual(b);
  });

  it('draws attacker dice, then defender dice, then one per placed die', () => {
    const s = buildState({ owners: [0, 1], dice: [3, 2], edges: [[0, 1]], seed: 9 });
    const rng = new Rng(9);
    const attackRolls = [rng.die(), rng.die(), rng.die()];
    const defendRolls = [rng.die(), rng.die()];
    const { state, events } = applyAction(s, { type: 'attack', from: 0, to: 1 });
    expect(rolled(events).attackRolls).toEqual(attackRolls);
    expect(rolled(events).defendRolls).toEqual(defendRolls);
    expect(state.rngState).toBe(rng.state);

    const t = buildState({ owners: [0, 0, 1], dice: [1, 1, 1], edges: [[0, 1], [1, 2]], seed: 4 });
    const r2 = new Rng(4);
    r2.int(2);
    r2.int(2);
    expect(applyAction(t, { type: 'endTurn' }).state.rngState).toBe(r2.state);
  });

  for (const [ad, dd] of [[8, 1], [3, 3]] as const) {
    it(`attack outcomes, ${ad} vs ${dd}`, () => {
      let wins = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const s = buildState({ owners: [0, 1, 1], dice: [ad, dd, 1], edges: [[0, 1], [1, 2]], seed });
        const { state, events } = applyAction(s, { type: 'attack', from: 0, to: 1 });
        const e = rolled(events);
        expect(e.attackRolls).toHaveLength(ad);
        expect(e.defendRolls).toHaveLength(dd);
        for (const r of [...e.attackRolls, ...e.defendRolls]) expect(r >= 1 && r <= 6).toBe(true);
        expect(e.attackSum).toBe(e.attackRolls.reduce((a, b) => a + b, 0));
        expect(e.defendSum).toBe(e.defendRolls.reduce((a, b) => a + b, 0));
        expect(e.success).toBe(e.attackSum > e.defendSum);
        expect(state.territories[0]!.dice).toBe(1);
        if (e.success) {
          wins++;
          expect(state.territories[1]!.owner).toBe(0);
          expect(state.territories[1]!.dice).toBe(ad - 1);
          expect(events).toContainEqual({ type: 'territoryCaptured', territory: 1, previousOwner: 1, newOwner: 0, dice: ad - 1 });
        } else {
          expect(state.territories[1]!.owner).toBe(1);
          expect(state.territories[1]!.dice).toBe(dd);
          expect(events.some((x) => x.type === 'territoryCaptured')).toBe(false);
        }
      }
      expect(wins).toBeGreaterThan(0);
    });
  }

  it('ties go to the defender', () => {
    let ties = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const s = buildState({ owners: [0, 1], dice: [2, 2], edges: [[0, 1]], seed });
      const e = rolled(applyAction(s, { type: 'attack', from: 0, to: 1 }).events);
      if (e.attackSum === e.defendSum) {
        ties++;
        expect(e.success).toBe(false);
      }
    }
    expect(ties).toBeGreaterThan(0);
  });

  it('capturing the last territory eliminates the player', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = buildState({
        owners: [0, 1, 2],
        dice: [8, 1, 2],
        edges: [[0, 1], [1, 2]],
        reserves: [0, 7, 0],
        seed,
      });
      const { state, events } = applyAction(s, { type: 'attack', from: 0, to: 1 });
      if (!rolled(events).success) continue;
      expect(events).toContainEqual({ type: 'playerEliminated', player: 1, by: 0 });
      expect(state.players[1]!.alive).toBe(false);
      expect(state.players[1]!.reserve).toBe(0);
      expect(state.winner).toBeNull();
      return;
    }
    throw new Error('no winning seed found');
  });

  it('last player standing wins', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = buildState({ owners: [0, 1], dice: [8, 1], edges: [[0, 1]], seed });
      const { state, events } = applyAction(s, { type: 'attack', from: 0, to: 1 });
      if (!rolled(events).success) continue;
      expect(state.winner).toBe(0);
      expect(events.at(-1)).toEqual({ type: 'gameOver', winner: 0 });
      return;
    }
    throw new Error('no winning seed found');
  });
});

describe('reinforcement', () => {
  const total = (s: GameState, p: number): number =>
    s.territories.filter((t) => t.owner === p).reduce((a, t) => a + t.dice, 0);

  it('uses the largest connected group', () => {
    // P0: group {0,1,2} and group {4,5}; P1 owns 3.
    const s = buildState({
      owners: [0, 0, 0, 1, 0, 0],
      dice: [1, 1, 1, 1, 1, 1],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    });
    const { state, events } = applyAction(s, { type: 'endTurn' });
    expect(total(state, 0) - total(s, 0)).toBe(3);
    expect(events.find((e) => e.type === 'reinforced')).toMatchObject({ player: 0, largestGroup: 3 });
    expect(largestGroup(s, 0)).toBe(3);
  });

  it('adds the reserve', () => {
    const s = buildState({ owners: [0, 0, 1], dice: [1, 1, 1], edges: [[0, 1], [1, 2]], reserves: [4, 0] });
    const { state } = applyAction(s, { type: 'endTurn' });
    expect(total(state, 0) - total(s, 0)).toBe(6);
    expect(state.players[0]!.reserve).toBe(0);
  });

  it('overflow goes to the reserve, capped at 64', () => {
    const s = buildState({ owners: [0, 0, 1], dice: [8, 8, 1], edges: [[0, 1], [1, 2]], reserves: [63, 0] });
    const { state, events } = applyAction(s, { type: 'endTurn' });
    expect(state.players[0]!.reserve).toBe(64);
    expect(events.find((e) => e.type === 'reinforced')).toMatchObject({ placed: [], reserve: 64 });
    const s2 = buildState({ owners: [0, 0, 1], dice: [8, 8, 1], edges: [[0, 1], [1, 2]], reserves: [3, 0] });
    expect(applyAction(s2, { type: 'endTurn' }).state.players[0]!.reserve).toBe(5);
  });

  it('never exceeds 8 dice', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = buildState({ owners: [0, 0, 0, 1], dice: [7, 8, 6, 1], edges: [[0, 1], [1, 2], [2, 3]], reserves: [10, 0], seed });
      const { state } = applyAction(s, { type: 'endTurn' });
      for (const t of state.territories) expect(t.dice).toBeLessThanOrEqual(8);
      // Room for 1 + 0 + 2 = 3 dice out of 3 + 10, so 10 go back to the reserve.
      expect(state.players[0]!.reserve).toBe(10);
    }
  });

  it('reinforced event lists one territory per placed die', () => {
    const s = buildState({ owners: [0, 0, 1], dice: [1, 1, 1], edges: [[0, 1], [1, 2]], reserves: [2, 0] });
    const ev = applyAction(s, { type: 'endTurn' }).events.find((e) => e.type === 'reinforced');
    if (!ev || ev.type !== 'reinforced') throw new Error('no reinforced event');
    expect(ev.placed).toHaveLength(4);
    expect(ev.placed.every((t) => t === 0 || t === 1)).toBe(true);
  });
});

describe('turn order', () => {
  const three = (current: number, owners = [0, 1, 2]): GameState =>
    buildState({ owners, dice: [1, 1, 1], edges: [[0, 1], [1, 2]], players: 3, current });

  it('passes to the next alive player', () => {
    const { state } = applyAction(three(0), { type: 'endTurn' });
    expect(state.current).toBe(1);
    expect(state.round).toBe(1);
  });

  it('skips eliminated players', () => {
    const { state } = applyAction(three(0, [0, 2, 2]), { type: 'endTurn' });
    expect(state.current).toBe(2);
    expect(state.round).toBe(1);
  });

  it('round increments on wrap', () => {
    const { state } = applyAction(three(2), { type: 'endTurn' });
    expect(state.current).toBe(0);
    expect(state.round).toBe(2);
  });

  it('round increments once when wrapping past eliminated players', () => {
    const { state } = applyAction(three(2, [1, 1, 2]), { type: 'endTurn' });
    expect(state.current).toBe(1);
    expect(state.round).toBe(2);
  });

  it('emits turnStarted', () => {
    const { events } = applyAction(three(2), { type: 'endTurn' });
    expect(events.at(-1)).toEqual({ type: 'turnStarted', player: 0, round: 2 });
  });
});
