# Playtest 18-11-2026: connection bonus

**Branch:** `proto/connection-bonus` (engine and simulator only, off by default; nothing in the UI yet).
**Idea** (`docs/plan.md` §11, Jacob): reward a capture that joins two or more of your groups, with dice on the linking territory.

## Simulation (front-line reinforcement default; 1,000 eight-player games, 1,000 Normal-vs-Easy 1v1s)

| Connection bonus | Links | Normal beats Easy | 8-player rounds: median / p99 | Halfway leader wins | 8-player seat spread |
|---|---|---|---|---|---|
| off (today) | – | 90.2% | 12 / 22 | 62.3% | 10.3–14.2% |
| +1 per extra group | 31,901 | 89.4% | 10 / 19 | 64.5% | 11.1–15.2% |
| +2 per extra group (`flat`) | 28,479 | 89.0% | 9 / 17 | 67.0% | 9.5–17.9% |
| size of the smaller groups (`smaller`) | 28,699 | 86.2% | 10 / 18 | 67.7% | 10.0–15.8% |

Links are frequent (about 14 per game across both formats), so even a small bonus moves a lot of dice. Every version makes games shorter and more snowbally (the halfway leader wins more often), costs a little skill expression, and lets the first seat's edge creep back. The bonus rewards growth that bigger connected groups already earn through reinforcement, so it mostly helps whoever is ahead.

## Options

1. Leave it off (simplest; the simulator sees no upside).
2. +1 per link for the feel of a visible "linked!" moment, accepting a little more momentum.
3. Redesign it as a catch-up rule, e.g. only for players below the average territory count, so connecting islands helps the player who's behind.

Gates: `npm run check` 136 passed; `npm run sim -- --games 2000` passes for every variant (all well inside the length gate).
