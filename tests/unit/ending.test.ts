import { describe, expect, it } from 'vitest';
import type { Ending } from '../../src/ui/ending';
import { endingCopy, leadOf } from '../../src/ui/ending';
import type { GameSummary, Standing } from '../../src/game/summary';

const players = [
  { name: 'You', identity: 0 },
  { name: 'Atlas', identity: 1 },
  { name: 'Brook', identity: 2 },
];

function st(player: number, place: number | null, out: [number, number] | null, peak = 10, peakRound = 1): Standing {
  return { player, place, outRound: out?.[0] ?? null, outBy: out?.[1] ?? null, peak, peakRound, captures: 0, knockouts: 0, attacks: 0, attacksWon: 0, defences: 0, defencesHeld: 0 };
}

function ending(over: Partial<Ending>, summary: Partial<GameSummary>): Ending {
  return {
    title: 'Atlas wins',
    mood: 'lost',
    players,
    you: 0,
    territories: 30,
    ...over,
    summary: {
      winner: 1,
      rounds: 12,
      players: 3,
      standings: [],
      timeline: [{ round: 1, counts: [10, 10, 10] }],
      upsets: [null, null, null],
      bigTurns: [null, null, null],
      ...summary,
    },
  };
}

describe('endingCopy', () => {
  it('tells a loser how big they got, who finished them and where they came', () => {
    const e = ending({}, { standings: [st(1, 1, null, 30, 12), st(0, 2, [12, 1], 14, 6), st(2, 3, [5, 0])] });
    expect(endingCopy(e)).toEqual({
      sub: 'Atlas took all 30 territories in 12 rounds.',
      caption: 'You held up to 14 territories in round 6. Atlas took your last one in round 12. You came 2nd of 3.',
    });
  });

  it('says you started with them if you never held more', () => {
    const e = ending({}, { standings: [st(1, 1, null, 30, 12), st(2, 2, [12, 1]), st(0, 3, [3, 2])] });
    expect(endingCopy(e).caption).toBe('You started with 10 territories. Brook took your last one in round 3. You came 3rd of 3.');
  });

  it("gives a winner their biggest turn and knockouts, two lines at most", () => {
    const e = ending(
      { title: 'You win', mood: 'won' },
      {
        winner: 0,
        standings: [st(0, 1, null, 30, 12), st(1, 2, [12, 0]), st(2, 3, [5, 0])],
        bigTurns: [{ round: 9, captures: 7 }, null, null],
        upsets: [{ round: 4, attackDice: 3, defendDice: 5, chance: 0.12 }, null, null],
      },
    );
    expect(endingCopy(e)).toEqual({
      sub: 'You took all 30 territories in 12 rounds.',
      caption: 'Biggest turn: 7 territories in round 9. You knocked out Atlas and Brook.',
    });
  });

  it('mentions a lucky win, but not an ordinary one', () => {
    const base = { winner: 0, standings: [st(0, 1, null), st(1, 2, [12, 2]), st(2, 3, [5, 1])] };
    const lucky = ending({ mood: 'won' }, { ...base, upsets: [{ round: 4, attackDice: 3, defendDice: 5, chance: 0.12 }, null, null] });
    expect(endingCopy(lucky).caption).toBe('Luckiest win: 3 dice beat 5 in round 4, a 12% chance.');
    const fair = ending({ mood: 'won' }, { ...base, upsets: [{ round: 4, attackDice: 8, defendDice: 8, chance: 0.47 }, null, null] });
    expect(endingCopy(fair).caption).toBe('');
  });

  it('skips a biggest turn under three territories', () => {
    const e = ending({ mood: 'won' }, { winner: 0, standings: [st(0, 1, null), st(1, 2, [2, 0]), st(2, 3, [2, 1])], bigTurns: [{ round: 2, captures: 2 }, null, null] });
    expect(endingCopy(e).caption).toBe('You knocked out Atlas.');
  });

  it('while play goes on, says where you came and who took your last territory', () => {
    const e = ending(
      { title: 'You were eliminated', mood: 'out' },
      { winner: null, rounds: 3, standings: [st(1, 1, null), st(2, 2, null), st(0, 3, [3, 2])], timeline: [{ round: 1, counts: [10, 10, 10] }, { round: 3, counts: [0, 14, 16] }] },
    );
    expect(endingCopy(e)).toEqual({ sub: 'You came 3rd of 3.', caption: 'You started with 10 territories. Brook took your last one in round 3.' });
    expect(leadOf(e)).toBe(0);
  });

  it('with no single human, talks about the winner by name', () => {
    const e = ending(
      { you: null },
      { rounds: 1, standings: [st(1, 1, null), st(0, 2, [1, 1]), st(2, 3, [1, 1])], bigTurns: [null, { round: 1, captures: 20 }, null] },
    );
    expect(endingCopy(e)).toEqual({
      sub: 'Atlas took all 30 territories in 1 round.',
      caption: 'Biggest turn: 20 territories in round 1. Atlas knocked out You and Brook.',
    });
    expect(leadOf(e)).toBe(1);
  });

  it('uses no em dashes', () => {
    const e = ending({}, { standings: [st(1, 1, null, 30, 12), st(0, 2, [12, 1], 14, 6), st(2, 3, [5, 0])] });
    const { sub, caption } = endingCopy(e);
    expect(`${sub} ${caption}`).not.toMatch(/—/);
  });
});
