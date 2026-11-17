import { Rng } from './rng';
import { IllegalActionError } from './types';
import type { Action, ActionResult, GameEvent, GameState, PlayerId, RulesConfig, Territory, TerritoryId } from './types';

export function isLegalAttack(state: GameState, from: TerritoryId, to: TerritoryId): boolean {
  if (state.winner !== null) return false;
  const src = state.territories[from];
  const dst = state.territories[to];
  if (!src || !dst) return false;
  return src.owner === state.current && dst.owner !== state.current && src.dice >= 2 && src.neighbours.includes(to);
}

/** Dice left on the attacking territory after a failed attack (a draw or a clear loss), per the loss rule. */
export function diceAfterFailedAttack(rules: RulesConfig, attackDice: number, defendDice: number, draw: boolean): number {
  const attrition = Math.max(1, Math.min(attackDice - 1, defendDice));
  switch (rules.lossRule) {
    case 'attrition':
      return attrition;
    case 'drawAttrition':
      return draw ? attrition : 1;
    case 'halfStack':
      return Math.max(1, Math.floor(attackDice / 2));
    default:
      return 1;
  }
}

export function legalAttacks(state: GameState): Array<{ from: TerritoryId; to: TerritoryId }> {
  const result: Array<{ from: TerritoryId; to: TerritoryId }> = [];
  if (state.winner !== null) return result;
  for (const t of state.territories) {
    if (t.owner !== state.current || t.dice < 2) continue;
    for (const to of t.neighbours) {
      if (isLegalAttack(state, t.id, to)) result.push({ from: t.id, to });
    }
  }
  return result;
}

/** Size, in territories, of the player's largest connected group of own territories. */
export function largestGroup(state: GameState, player: PlayerId): number {
  const seen = new Set<TerritoryId>();
  let best = 0;
  for (const start of state.territories) {
    if (start.owner !== player || seen.has(start.id)) continue;
    let size = 0;
    const stack = [start.id];
    seen.add(start.id);
    while (stack.length > 0) {
      const id = stack.pop()!;
      size++;
      for (const n of state.territories[id]!.neighbours) {
        if (state.territories[n]!.owner === player && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    best = Math.max(best, size);
  }
  return best;
}

export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.winner !== null) throw new IllegalActionError('The game is over');
  const next: GameState = {
    ...state,
    territories: state.territories.map((t) => ({ ...t })),
    players: state.players.map((p) => ({ ...p })),
  };
  const rng = new Rng(state.rngState);
  const events: GameEvent[] = [];

  if (action.type === 'attack') {
    if (!isLegalAttack(state, action.from, action.to)) {
      throw new IllegalActionError(`Illegal attack from ${action.from} to ${action.to}`);
    }
    resolveAttack(next, action.from, action.to, rng, events);
  } else {
    reinforce(next, rng, events);
    advanceTurn(next, events);
  }

  next.rngState = rng.state;
  return { state: next, events };
}

function rollDice(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.die());
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Mutates the (already cloned) state. */
function resolveAttack(s: GameState, from: TerritoryId, to: TerritoryId, rng: Rng, events: GameEvent[]): void {
  const src = s.territories[from]!;
  const dst = s.territories[to]!;
  const attacker = src.owner;
  const defender = dst.owner;

  const attackRolls = rollDice(rng, src.dice);
  const defendRolls = rollDice(rng, dst.dice);
  const attackSum = sum(attackRolls);
  const defendSum = sum(defendRolls);
  const success = attackSum > defendSum;
  events.push({ type: 'attackRolled', attacker, defender, from, to, attackRolls, defendRolls, attackSum, defendSum, success });

  if (!success) {
    src.dice = diceAfterFailedAttack(s.config, src.dice, dst.dice, attackSum === defendSum);
    return;
  }

  dst.owner = attacker;
  dst.dice = src.dice - 1;
  src.dice = 1;
  events.push({ type: 'territoryCaptured', territory: to, previousOwner: defender, newOwner: attacker, dice: dst.dice });

  if (!s.territories.some((t) => t.owner === defender)) {
    const loser = s.players[defender]!;
    loser.alive = false;
    loser.reserve = 0;
    s.players[attacker]!.knockouts++;
    events.push({ type: 'playerEliminated', player: defender, by: attacker });
  }
  if (s.territories.every((t) => t.owner === attacker)) {
    s.winner = attacker;
    events.push({ type: 'gameOver', winner: attacker });
  }
}

/** Mutates the (already cloned) state: places largest group + reserve dice for the current player. */
function reinforce(s: GameState, rng: Rng, events: GameEvent[]): void {
  const player = s.players[s.current]!;
  const group = largestGroup(s, player.id);
  const bonus = player.knockouts * s.config.eliminationBonus;
  let remaining = group + bonus + player.reserve;
  const placed: TerritoryId[] = [];
  const max = s.config.maxDice;
  const rule = s.config.reinforcement;
  const facesEnemy = (t: Territory) => t.neighbours.some((n) => s.territories[n]!.owner !== player.id);
  const open: Territory[] = s.territories.filter((t) => t.owner === player.id && t.dice < max && (rule !== 'frontline' || facesEnemy(t)));
  // With equal weights this draws exactly as before, so 'random' games are unchanged.
  const weight = (t: Territory) => (rule === 'weighted' && facesEnemy(t) ? 3 : 1);

  while (remaining > 0 && open.length > 0) {
    let r = rng.int(open.reduce((sum, t) => sum + weight(t), 0));
    let i = 0;
    while (r >= weight(open[i]!)) r -= weight(open[i++]!);
    const t = open[i]!;
    t.dice++;
    placed.push(t.id);
    remaining--;
    if (t.dice >= max) open.splice(i, 1);
  }

  player.reserve = Math.min(s.config.maxReserve, remaining);
  events.push({ type: 'reinforced', player: player.id, largestGroup: group, bonus, placed, reserve: player.reserve });
}

/** Mutates the (already cloned) state: hands play to the next alive player. */
function advanceTurn(s: GameState, events: GameEvent[]): void {
  const count = s.players.length;
  let id = s.current;
  do {
    id = (id + 1) % count;
    if (id === 0) s.round++;
  } while (!s.players[id]!.alive);
  s.current = id;
  events.push({ type: 'turnStarted', player: id, round: s.round });
}
