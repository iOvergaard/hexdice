import type { AiLevel, SeatConfig } from './types';

export const AI_NAMES: readonly string[] = ['Atlas', 'Brook', 'Cinder', 'Drift', 'Ember', 'Frost', 'Grove'];

/** You (identity 0) plus aiCount AI seats (identities 1..aiCount). */
export function defaultSeats(aiCount = 7, aiLevel: AiLevel = 'normal', humanName = 'You'): SeatConfig[] {
  if (aiCount < 1 || aiCount > AI_NAMES.length) throw new RangeError(`aiCount must be 1–${AI_NAMES.length}`);
  return [
    { name: humanName, kind: 'human', identity: 0 },
    ...AI_NAMES.slice(0, aiCount).map((name, i): SeatConfig => ({ name, kind: 'ai', aiLevel, identity: i + 1 })),
  ];
}

/** All-AI seats for simulations. */
export function aiSeats(levels: readonly AiLevel[]): SeatConfig[] {
  return levels.map((aiLevel, i): SeatConfig => ({ name: `${aiLevel}-${i}`, kind: 'ai', aiLevel, identity: i }));
}
