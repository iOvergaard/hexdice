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
| **catch-up** (+2 per extra group, only below average territory count) | 13,659 | 88.2% | 13 / 26 | **58.6%** | 9.9–14.8% |

Links are frequent (about 14 per game across both formats), so even a small bonus moves a lot of dice. Every version makes games shorter and more snowbally (the halfway leader wins more often), costs a little skill expression, and lets the first seat's edge creep back. The bonus rewards growth that bigger connected groups already earn through reinforcement, so it mostly helps whoever is ahead.

## Options

1. Leave it off (simplest; the simulator sees no upside).
2. +1 per link for the feel of a visible "linked!" moment, accepting a little more momentum.
3. Redesign it as a catch-up rule, e.g. only for players below the average territory count, so connecting islands helps the player who's behind.

Gates: `npm run check` 136 passed; `npm run sim -- --games 2000` passes for every variant (all well inside the length gate).

## Catch-up version (Jacob's pick of option 3)

The only variant that gives **more** comebacks than today (halfway leader wins 58.6% vs 62.3%), at a cost of about 2 points of skill expression and one extra round. It helps the player behind, so small games needed their own seat compensation (`SEAT_COMPENSATION_CATCHUP`): 2 players first seat −5 (49.0% / 48.6% on two seed sets), 3 players −2/−1/+1 (worst seat 2–3 points off), 4 players none (1.7–3.2). 5–8 players keep the main table.

In the game a gold "+N linked!" floats over the linking territory. Try it with `?link=catchup`. The browser test `tests/e2e/link.spec.ts` checks the label and the bonus dice.

## Made the default (18-11-2026, Jacob)

`connectionBonus: 'catchup'` is now the default; `?link=off` turns it off. Saves made before the bonus existed replay with it off, so a game in progress carries on as it was played (unit test in `tests/unit/save.test.ts`).

### Hands-on with catch-up as the default (18-11-2026)

| Scenario | Result |
|---|---|
| A fresh game without `?link` runs catch-up | Verified (`state().config.connectionBonus` is `catchup`) |
| Every link shows its gold label, AI turns included | Verified: full eight-player game at Fast (seed 9001, autoplay), 10 rounds, 4 links by 4 different players, 4 "+2 linked!" labels, no console errors |
| Your own link shows the label and lands the dice | Verified by the browser test on desktop and phone (crafted state); not seen in a natural game of mine |
| A save from before the bonus resumes with it off | Partly verified: unit test only, not with a real save from the live site |
| Gates | `check` 140 passed; `sim` 2,000 games: Normal beats Easy 87.4%, p90 19, p99 26, seats 9.6–14.8% at eight players; `e2e` 66 passed |
