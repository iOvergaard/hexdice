import type { GameState, TerritoryId } from '../engine/types';

export interface SelectionResult {
  selected: TerritoryId | null;
  attack: { from: TerritoryId; to: TerritoryId } | null;
}

type CanAttack = (from: TerritoryId, to: TerritoryId) => boolean;

/** Routes a tap to a selection change or an attack. Legality stays with the caller's `canAttack`. */
export function nextSelection(
  state: GameState,
  selected: TerritoryId | null,
  tapped: TerritoryId | null,
  canAttack: CanAttack,
): SelectionResult {
  const none: SelectionResult = { selected: null, attack: null };
  if (tapped === null || tapped === selected) return none;
  if (selected !== null && canAttack(selected, tapped)) return { selected: null, attack: { from: selected, to: tapped } };
  const t = state.territories[tapped];
  if (t && t.owner === state.current && t.dice >= 2) return { selected: tapped, attack: null };
  return none;
}

export function targetsFor(state: GameState, from: TerritoryId, canAttack: CanAttack): TerritoryId[] {
  return (state.territories[from]?.neighbours ?? []).filter((to) => canAttack(from, to));
}
