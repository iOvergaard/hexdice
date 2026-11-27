import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/engine/types';
import { trackFor } from '../../src/game/music';
import { fixtureBoardState } from '../fixtures/state';

/** Seat 0 is you, the rest are computer players; `alive` lists the seats still in. */
function table(players: number, alive: number[], winner: number | null = null): GameState {
  const s = structuredClone(fixtureBoardState(7, players));
  s.players.forEach((p) => {
    p.kind = p.id === 0 ? 'human' : 'ai';
    p.alive = alive.includes(p.id);
  });
  s.winner = winner;
  return s;
}

describe('trackFor', () => {
  it('plays nothing without a game', () => {
    expect(trackFor(null)).toBeNull();
  });

  it("plays The Bard's Tale while three or more are in", () => {
    expect(trackFor(table(4, [0, 1, 2, 3]))).toBe('bards-tale');
    expect(trackFor(table(4, [0, 1, 3]))).toBe('bards-tale');
  });

  it('plays Battle once two are left in a game that started with three or more', () => {
    expect(trackFor(table(3, [0, 2]))).toBe('battle');
    expect(trackFor(table(8, [0, 5]))).toBe('battle');
    expect(trackFor(table(8, [3, 5]))).not.toBe('battle'); // you're out: that's the defeat theme
  });

  it("keeps The Bard's Tale through a two-player game", () => {
    expect(trackFor(table(2, [0, 1]))).toBe('bards-tale');
  });

  it('plays the victory theme when you win and the defeat theme when you lose', () => {
    expect(trackFor(table(4, [0], 0))).toBe('victory');
    expect(trackFor(table(4, [2], 2))).toBe('defeat');
  });

  it("plays the defeat theme once you're knocked out, while the others play on", () => {
    expect(trackFor(table(4, [1, 2, 3]))).toBe('defeat');
  });

  it('a table of computer players gets the game music, then the defeat theme for its winner', () => {
    const s = table(4, [1, 2]);
    s.players.forEach((p) => (p.kind = 'ai'));
    expect(trackFor(s)).toBe('battle');
    s.winner = 1;
    s.players[2]!.alive = false;
    expect(trackFor(s)).toBe('defeat');
  });
});
