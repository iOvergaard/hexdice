import type { Speed } from '../engine/types';

/** Roll-strip tumble length per speed. */
export const ROLL_MS: Record<Speed, number> = { slow: 1600, normal: 900, fast: 400, instant: 0 };

/** Pause before each AI action per speed. */
export const PAUSE_MS: Record<Speed, number> = { slow: 500, normal: 250, fast: 80, instant: 0 };
