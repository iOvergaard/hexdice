import { DEFAULT_RULES, makeConfig } from '../../src/engine/config';
import { hexDistance, neighbours } from '../../src/engine/hex';
import { Rng } from '../../src/engine/rng';
import { aiSeats, defaultSeats } from '../../src/engine/seats';
import type { GameState, PlayerId, RulesConfig, Territory, TerritoryId } from '../../src/engine/types';

export interface GraphSpec {
  /** owners[t] = owner of territory t */
  owners: PlayerId[];
  /** dice[t] = dice on territory t */
  dice: number[];
  /** Undirected adjacency. */
  edges: Array<[TerritoryId, TerritoryId]>;
  /** Defaults to max(owners) + 1. */
  players?: number;
  current?: PlayerId;
  reserves?: number[];
  seed?: number;
  rules?: Partial<RulesConfig>;
}

/**
 * Abstract-graph state for rules and AI tests. Geometry is fake (one cell per territory in a single row),
 * so only use neighbours, owners and dice from it, never the board layout.
 */
export function buildState(spec: GraphSpec): GameState {
  const count = spec.owners.length;
  const playerCount = spec.players ?? Math.max(...spec.owners) + 1;
  const seed = spec.seed ?? 1;
  const seats = aiSeats(Array.from({ length: playerCount }, () => 'normal' as const));
  const config = makeConfig(seats, seed, { gridWidth: count, gridHeight: 1, territoryCount: count, ...spec.rules });

  const adj: TerritoryId[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of spec.edges) {
    if (!adj[a]!.includes(b)) adj[a]!.push(b);
    if (!adj[b]!.includes(a)) adj[b]!.push(a);
  }

  const territories: Territory[] = spec.owners.map((owner, id) => ({
    id,
    cells: [id],
    neighbours: adj[id]!.sort((x, y) => x - y),
    centre: id,
    owner,
    dice: spec.dice[id]!,
  }));

  return {
    config,
    board: { width: count, height: 1, cellTerritory: territories.map((t) => t.id) },
    territories,
    players: seats.map((s, id) => ({
      id,
      name: s.name,
      kind: s.kind,
      aiLevel: s.aiLevel,
      identity: s.identity,
      reserve: spec.reserves?.[id] ?? 0,
      knockouts: 0,
      alive: spec.owners.includes(id),
    })),
    current: spec.current ?? 0,
    round: 1,
    rngState: seed,
    winner: null,
    finalStarted: playerCount <= 2,
    spent: [],
    shaken: [],
  };
}

/**
 * Realistic-looking board for UI work before map generation lands: Voronoi regions on the default hex grid.
 * Not guaranteed to satisfy the map rules (contiguity, sizes, connectivity). Never use it for engine tests.
 */
export function fixtureBoardState(seed = 7, playerCount = 8): GameState {
  const { gridWidth: W, gridHeight: H, territoryCount } = DEFAULT_RULES;
  const rng = new Rng(seed);
  const seats = defaultSeats(playerCount - 1);
  const config = makeConfig(seats, seed);

  const land: number[] = [];
  for (let cell = 0; cell < W * H; cell++) {
    const dx = ((cell % W) - (W - 1) / 2) / (W / 2);
    const dy = (Math.floor(cell / W) - (H - 1) / 2) / (H / 2);
    if (dx * dx + dy * dy < 0.8 + rng.next() * 0.25) land.push(cell);
  }
  const seeds = rng.shuffle([...land]).slice(0, territoryCount);

  const cellTerritory = new Array<number>(W * H).fill(-1);
  for (const cell of land) {
    let best = 0;
    for (let t = 1; t < seeds.length; t++) {
      if (hexDistance(cell, seeds[t]!, W) < hexDistance(cell, seeds[best]!, W)) best = t;
    }
    cellTerritory[cell] = best;
  }

  const order = rng.shuffle(seeds.map((_, t) => t));
  const territories: Territory[] = seeds.map((centre, id) => {
    const cells = land.filter((c) => cellTerritory[c] === id);
    const nbs = new Set<number>();
    for (const c of cells) {
      for (const n of neighbours(c, W, H)) {
        const t = cellTerritory[n]!;
        if (t !== -1 && t !== id) nbs.add(t);
      }
    }
    return {
      id,
      cells,
      neighbours: [...nbs].sort((a, b) => a - b),
      centre,
      owner: order.indexOf(id) % playerCount,
      dice: 1 + rng.int(8),
    };
  });

  return {
    config,
    board: { width: W, height: H, cellTerritory },
    territories,
    players: seats.map((s, id) => ({ id, ...s, reserve: id === 2 ? 5 : 0, knockouts: 0, alive: true })),
    current: 0,
    round: 3,
    rngState: rng.state,
    winner: null,
    finalStarted: false,
    spent: [],
    shaken: [],
  };
}
