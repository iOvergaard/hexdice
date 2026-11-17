import type { Speed } from '../engine/types';

/** Roll-strip tumble for a human's own attacks, per speed. */
export const ROLL_MS: Record<Speed, number> = { slow: 1600, normal: 900, fast: 400, instant: 0 };

/** AI attacks tumble faster: you watch a whole round of them between your turns. */
export const AI_ROLL_MS: Record<Speed, number> = { slow: 900, normal: 450, fast: 200, instant: 0 };

/** Pause before each AI action, per speed. */
export const PAUSE_MS: Record<Speed, number> = { slow: 350, normal: 120, fast: 40, instant: 0 };

/** How long a human's reinforcement placements stay visible, per speed. */
export const PLACE_MS: Record<Speed, number> = { slow: 1200, normal: 700, fast: 300, instant: 0 };

/** Same for AI reinforcements. */
export const AI_PLACE_MS: Record<Speed, number> = { slow: 700, normal: 350, fast: 150, instant: 0 };

/** How long the game holds for a player's elimination (burst and banner), per speed. */
export const ELIMINATION_MS: Record<Speed, number> = { slow: 2600, normal: 1900, fast: 1100, instant: 0 };
