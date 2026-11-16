import type { Speed } from '../engine/types';

/** Roll-strip tumble length per speed. */
export const ROLL_MS: Record<Speed, number> = { slow: 1600, normal: 900, fast: 400, instant: 0 };

/** Pause before each AI action per speed. */
export const PAUSE_MS: Record<Speed, number> = { slow: 500, normal: 250, fast: 80, instant: 0 };

/** How long reinforcement placements stay visible per speed. */
export const PLACE_MS: Record<Speed, number> = { slow: 1200, normal: 700, fast: 300, instant: 0 };
