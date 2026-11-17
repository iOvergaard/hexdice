import { describe, expect, it } from 'vitest';
import type { GameEvent, Speed } from '../../src/engine/types';
import { cuesFor, type CueContext } from '../../src/game/sound-cues';
import { AI_ROLL_MS, ELIMINATION_MS, PLACE_MS, ROLL_MS } from '../../src/game/timing';

const SPEEDS: Speed[] = ['slow', 'normal', 'fast', 'instant'];
const HUMAN = 0;
const AI = 1;

function roll(attackRolls: number[], defendRolls: number[], attacker = HUMAN, defender = AI): GameEvent {
  const attackSum = attackRolls.reduce((a, b) => a + b, 0);
  const defendSum = defendRolls.reduce((a, b) => a + b, 0);
  return { type: 'attackRolled', attacker, defender, from: 3, to: 4, attackRolls, defendRolls, attackSum, defendSum, success: attackSum > defendSum };
}

const capture = (attacker = HUMAN, defender = AI): GameEvent[] => [
  roll([6, 6, 6], [1, 1], attacker, defender),
  { type: 'territoryCaptured', territory: 4, previousOwner: defender, newOwner: attacker, dice: 2 },
];
const knockout = (attacker = HUMAN, defender = AI): GameEvent[] => [...capture(attacker, defender), { type: 'playerEliminated', player: defender, by: attacker }];
const endTurn = (player = HUMAN, next = AI): GameEvent[] => [
  { type: 'reinforced', player, largestGroup: 3, bonus: 0, placed: [1, 2, 3], reserve: 0 },
  { type: 'turnStarted', player: next, round: 2 },
];

const ctx = (over: Partial<CueContext> = {}): CueContext => ({ speed: 'normal', byAi: false, mode: 'play', humans: [HUMAN], ...over });

describe('cuesFor', () => {
  it('your attack at Normal: dice for the whole roll, then the result, both full volume', () => {
    const c = cuesFor(capture(), ctx());
    expect(c.dice).toEqual({ durationMs: ROLL_MS.normal, dice: 5, quiet: false });
    expect(c.result).toEqual({ cue: 'capture', quiet: false });
    expect(c.knockout).toBeNull();
    expect(c.sting).toBeNull();
  });

  it('tells held from draw', () => {
    expect(cuesFor([roll([1, 1], [6])], ctx()).result?.cue).toBe('held');
    expect(cuesFor([roll([3, 3], [6])], ctx()).result?.cue).toBe('draw');
  });

  it('your attacks sound at every speed but Instant', () => {
    for (const speed of SPEEDS) {
      const c = cuesFor(capture(), ctx({ speed }));
      expect(c.dice?.durationMs ?? 0, speed).toBe(ROLL_MS[speed]);
      expect(c.result !== null, speed).toBe(speed !== 'instant');
    }
  });

  it('AI attacks are quiet at Slow and Normal, silent at Fast and Instant', () => {
    for (const speed of SPEEDS) {
      const c = cuesFor(capture(AI, HUMAN), ctx({ speed, byAi: true }));
      if (speed === 'slow' || speed === 'normal') {
        expect(c.dice, speed).toEqual({ durationMs: AI_ROLL_MS[speed], dice: 5, quiet: true });
        expect(c.result, speed).toEqual({ cue: 'capture', quiet: true });
      } else {
        expect(c.dice, speed).toBeNull();
        expect(c.result, speed).toBeNull();
      }
    }
  });

  it('skipping plays at Instant: no dice, no results, no knockout', () => {
    const c = cuesFor(knockout(AI, 2), ctx({ speed: 'instant', byAi: true }));
    expect(c).toMatchObject({ dice: null, result: null, knockout: null, place: null });
  });

  it('a knockout lasts as long as the big bang, AI or not, until Instant', () => {
    for (const speed of SPEEDS) {
      const c = cuesFor(knockout(AI, 2), ctx({ speed, byAi: true }));
      expect(c.knockout, speed).toEqual(speed === 'instant' ? null : { durationMs: ELIMINATION_MS[speed] });
    }
  });

  it('plinks for your own reinforcement only', () => {
    expect(cuesFor(endTurn(), ctx()).place).toEqual({ count: 3, durationMs: PLACE_MS.normal });
    expect(cuesFor(endTurn(AI, 2), ctx({ byAi: true })).place).toBeNull();
    expect(cuesFor(endTurn(), ctx({ speed: 'instant' })).place).toBeNull();
  });

  it('chimes when a human seat starts its turn, at every speed', () => {
    for (const speed of SPEEDS) {
      expect(cuesFor(endTurn(AI, HUMAN), ctx({ speed, byAi: true })).yourTurn, speed).toBe(true);
      expect(cuesFor(endTurn(HUMAN, AI), ctx({ speed })).yourTurn, speed).toBe(false);
    }
  });

  it('no chime under autoplay or once you are out (no humans left)', () => {
    expect(cuesFor(endTurn(AI, HUMAN), ctx({ byAi: true, humans: [] })).yourTurn).toBe(false);
  });

  it('replay is a highlight reel: knockouts and the final sting only', () => {
    const win: GameEvent[] = [...knockout(), { type: 'gameOver', winner: HUMAN }];
    const c = cuesFor(win, ctx({ mode: 'replay', speed: 'fast' }));
    expect(c).toMatchObject({ dice: null, result: null, place: null, yourTurn: false, sting: 'win' });
    expect(c.knockout).toEqual({ durationMs: ELIMINATION_MS.fast });
    expect(cuesFor(endTurn(AI, HUMAN), ctx({ mode: 'replay', byAi: true })).yourTurn).toBe(false);
  });

  it('win and lose stings play at every speed', () => {
    for (const speed of SPEEDS) {
      const won = cuesFor([...knockout(), { type: 'gameOver', winner: HUMAN }], ctx({ speed }));
      expect(won.sting, speed).toBe('win');
      const lost = cuesFor(knockout(AI, HUMAN), ctx({ speed, byAi: true }));
      expect(lost.sting, speed).toBe('lose');
    }
  });

  it('loses only when the last human seat goes out; no sting while you watch the rest', () => {
    expect(cuesFor(knockout(AI, HUMAN), ctx({ byAi: true, humans: [HUMAN, 2] })).sting).toBeNull();
    expect(cuesFor([...knockout(AI, 2), { type: 'gameOver', winner: AI }], ctx({ byAi: true, humans: [] })).sting).toBeNull();
  });
});
