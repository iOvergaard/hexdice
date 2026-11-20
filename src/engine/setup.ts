import { MAX_PLAYERS, MIN_PLAYERS } from './config';
import { generateMap } from './mapgen';
import { Rng } from './rng';
import type { GameConfig, GameState, Player, Territory } from './types';

/**
 * Starting-dice change per seat in turn order, by table size. Moving first is a big edge in small games (2 players:
 * the first seat won 84%) and moving last in big ones (8 players: the last seat won 17%). Tuned with all-Normal AIs over 2,000 games per size
 * (17-11-2026) and checked on a second set of seeds: every seat within about 2–3 points of a fair share.
 */
export const SEAT_COMPENSATION: Readonly<Record<number, readonly number[]>> = {
  2: [-7, 0],
  3: [-3, 0, 1],
  4: [-1, 0, 0, 0],
  5: [-1, 0, 0, 0, 0],
  6: [-1, 0, 0, 0, 0, 0],
  7: [0, 1, 0, 0, 0, 0, 0],
  8: [0, 0, 0, 0, 1, 0, -1, -1],
};

/** With the catch-up connection bonus the player behind gets help, so small games need less compensation (18-11-2026). */
export const SEAT_COMPENSATION_CATCHUP: Readonly<Record<number, readonly number[]>> = {
  ...SEAT_COMPENSATION,
  2: [-5, 0],
  3: [-2, -1, 1],
  4: [0, 0, 0, 0],
};

/**
 * Retuned 19-11-2026 on that day's rules (all-Normal, three sets of 6,000 games per size): the last seat in 3-player games and the
 * first in 6 and 7 had drifted 2–5 points off a fair share. In 7-player games the first two seats start with 5 territories, not 4.
 */
export const SEAT_COMPENSATION_CATCHUP_2: Readonly<Record<number, readonly number[]>> = {
  ...SEAT_COMPENSATION_CATCHUP,
  3: [-2, -1, 0],
  6: [0, 0, 0, 0, 0, 0],
  7: [1, 1, 0, 0, 0, 0, 0],
};

export function createGame(config: GameConfig): GameState {
  const n = config.seats.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new RangeError(`Games need ${MIN_PLAYERS}–${MAX_PLAYERS} seats, got ${n}`);
  }
  const rng = new Rng(config.seed);

  const players: Player[] = rng.shuffle([...config.seats]).map((s, id) => ({
    id,
    name: s.name,
    kind: s.kind,
    aiLevel: s.aiLevel,
    identity: s.identity,
    reserve: 0,
    knockouts: 0,
    alive: true,
  }));

  const { board, territories: shapes } = generateMap(config, rng);
  const territories: Territory[] = shapes.map((t) => ({ ...t, owner: 0, dice: 1 }));
  rng.shuffle(shapes.map((_, i) => i)).forEach((id, i) => {
    territories[id]!.owner = i % n;
  });

  const startingDice = Math.floor((config.startingDiceFactor * territories.length) / n);
  for (const p of players) {
    const own = territories.filter((t) => t.owner === p.id);
    const catchup = config.seatTables >= 2 ? SEAT_COMPENSATION_CATCHUP_2 : SEAT_COMPENSATION_CATCHUP;
    const table = config.connectionBonus === 'catchup' ? catchup : SEAT_COMPENSATION;
    const adjust = config.seatCompensation ? (table[n]?.[p.id] ?? 0) : 0;
    let spare = startingDice + adjust - own.length;
    if (spare > own.length * (config.maxDice - 1)) throw new Error('Starting dice do not fit on the territories');
    while (spare > 0) {
      const t = rng.pick(own);
      if (t.dice < config.maxDice) {
        t.dice++;
        spare--;
      }
    }
  }

  return { config, board, territories, players, current: 0, round: 1, rngState: rng.state, winner: null, finalStarted: n <= 2 };
}
