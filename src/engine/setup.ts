import { MAX_PLAYERS, MIN_PLAYERS } from './config';
import { generateMap } from './mapgen';
import { Rng } from './rng';
import type { GameConfig, GameState, Player, Territory } from './types';

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
    let spare = startingDice - own.length;
    if (spare > own.length * (config.maxDice - 1)) throw new Error('Starting dice do not fit on the territories');
    while (spare > 0) {
      const t = rng.pick(own);
      if (t.dice < config.maxDice) {
        t.dice++;
        spare--;
      }
    }
  }

  return { config, board, territories, players, current: 0, round: 1, rngState: rng.state, winner: null };
}
