import { describe, expect, it } from 'vitest';
import { makeConfig } from '../../src/engine/config';
import { aiSeats, defaultSeats } from '../../src/engine/seats';
import { SEAT_COMPENSATION, SEAT_COMPENSATION_CATCHUP, createGame } from '../../src/engine/setup';

const game = (players: number, seed = 1) => createGame(makeConfig(defaultSeats(players - 1), seed));

describe('createGame', () => {
  it('compensates seats by turn order', () => {
    for (const [n, base] of [[8, 11], [4, 22], [2, 45]] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const s = game(n, seed);
        s.players.forEach((p, seat) => {
          const total = s.territories.filter((t) => t.owner === p.id).reduce((a, t) => a + t.dice, 0);
          expect(total, `${n} players, seat ${seat}`).toBe(base + SEAT_COMPENSATION_CATCHUP[n]![seat]!);
        });
      }
    }
  });

  it('uses the main table when the catch-up connection bonus is off', () => {
    const s = createGame(makeConfig(defaultSeats(1), 3, { connectionBonus: 'off' }));
    const totals = s.players.map((p) => s.territories.filter((t) => t.owner === p.id).reduce((a, t) => a + t.dice, 0));
    expect(totals).toEqual([45 + SEAT_COMPENSATION[2]![0]!, 45 + SEAT_COMPENSATION[2]![1]!]);
  });

  it('has a compensation for every table size, one entry per seat', () => {
    for (let n = 2; n <= 8; n++) {
      expect(SEAT_COMPENSATION[n]).toHaveLength(n);
      expect(SEAT_COMPENSATION_CATCHUP[n]).toHaveLength(n);
    }
  });

  it('rejects fewer than 2 or more than 8 seats', () => {
    expect(() => createGame(makeConfig(defaultSeats(1).slice(0, 1), 1))).toThrow(RangeError);
    expect(() => createGame(makeConfig(aiSeats(Array(9).fill('easy')), 1))).toThrow(RangeError);
  });

  it('players are the seats in a seeded random order', () => {
    const seats = defaultSeats(7);
    const s = createGame(makeConfig(seats, 3));
    s.players.forEach((p, i) => {
      expect(p.id).toBe(i);
      expect(p.reserve).toBe(0);
      expect(p.alive).toBe(true);
    });
    const key = (x: { name: string; kind: string; aiLevel?: string; identity: number }) =>
      `${x.name}|${x.kind}|${x.aiLevel}|${x.identity}`;
    expect(s.players.map(key).sort()).toEqual(seats.map(key).sort());
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => game(8, seed).players.map((p) => p.name).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('deals every territory, evenly', () => {
    for (const n of [2, 3, 5, 7, 8]) {
      const s = game(n, 10 + n);
      const counts = s.players.map((p) => s.territories.filter((t) => t.owner === p.id).length);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(30);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('starting dice are equal per player without seat compensation', () => {
    for (const [n, total] of [[8, 11], [4, 22], [2, 45]] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const s = createGame(makeConfig(defaultSeats(n - 1), seed, { seatCompensation: false }));
        for (const p of s.players) {
          expect(s.territories.filter((t) => t.owner === p.id).reduce((a, t) => a + t.dice, 0)).toBe(total);
        }
        for (const t of s.territories) {
          expect(t.dice).toBeGreaterThanOrEqual(1);
          expect(t.dice).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it('initial state', () => {
    const s = game(8, 9);
    expect(s.current).toBe(0);
    expect(s.round).toBe(1);
    expect(s.winner).toBeNull();
    expect(createGame(s.config)).toEqual(s);
    expect(s.territories.map((t) => t.id)).toEqual(s.territories.map((_, i) => i));
  });
});
