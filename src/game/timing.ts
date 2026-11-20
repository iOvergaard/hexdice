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

/**
 * Share of the placement time over which the reinforcement pile drains, one die landing at a time (the placement
 * plinks in sound.ts spread over the same 0.6). 0 shows no pile and lands every die at once.
 */
export const DRAIN_SHARE: Record<Speed, number> = { slow: 0.6, normal: 0.6, fast: 0, instant: 0 };

/** How long the game holds for a player's elimination (burst and banner), per speed. */
export const ELIMINATION_MS: Record<Speed, number> = { slow: 2600, normal: 1900, fast: 1100, instant: 0 };
