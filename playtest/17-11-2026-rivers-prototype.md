# Playtest 17-11-2026: rivers prototype

**Branch:** `proto/rivers` (from `main`). Not merged.
**Why:** Jacob noticed lakes don't protect anything: territories around a lake still touch each other around its ends.

## What lakes did (measured, 300 maps)

- About 3 lakes per map, 7 cells each. 47% of lakes separate no territory pair at all.
- Pairs of territories facing each other across water without touching: **3.0 per map**, against ~58 adjacencies.

## What the prototype adds

- **2 rivers** per map: one-cell-wide water lines of 10–17 cells from the coast inland, meandering, never touching lakes, the sea or each other, never cutting the continent in two.
- **1 ford per river**: a land cell in the middle stretch, drawn as a plank bridge. On a hex grid a connected line of water blocks adjacency, so territories only meet across a river at its ford.
- Rivers are drawn as smooth water lines with soft banks; without that the one-cell channels vanished under the smoothed coast.

## Numbers (300 maps for separation, 1,200 eight-player AI games for length)

| Variant | Separated pairs / map | Adjacencies / map | p99 rounds | Games > 60 rounds |
|---|---|---|---|---|
| Lakes only (main) | 3.0 | 58.2 | 54 | 2 |
| Rivers 9–16, 1 ford | 6.2 | 55.6 | 49 | 4 |
| **Rivers 10–17, 1 ford (chosen)** | **7.0** | **55.0** | **56** | **6** |
| Rivers 12–20, 1 ford | 7.9 | 54.1 | 62 | 12 |
| Rivers 12–20, 2 fords | 6.2 | 55.6 | 63 | 12 |

Stronger barriers bring back long standoffs; 10–17 cells with one ford keeps the game-length tail at main's level. Generation: ~6 ms per map (was ~3).

## Gates

`npm run check` 98 passed · `npm run sim -- --games 500` 0 crashes / illegal / cap hits, Normal beats Easy 86% · `npm run e2e` 45 passed, 1 skipped.

## Scenarios

| Scenario | Status | Notes |
|---|---|---|
| Rivers visible on desktop | Verified | Meandering water lines with plank bridges at fords. |
| Rivers visible on phone | Partly verified | Screenshot only (emulated Pixel 7). |
| Territories meet only at fords | Verified | Unit test: every ford has water on opposite sides; separation test ≥ 2× lakes. |
| Playing across a river by hand | Not tested | No hands-on game played on this branch yet. |
