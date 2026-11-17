# Playtest 17-11-2026: front-line reinforcement

**Branch:** `proto/frontline`. Setting `reinforcement` (`random` default, `frontline`, `weighted`); try it with `?reinforce=frontline`.
**Why:** Jacob's parked idea (`docs/plan.md` §11, "Getting dice to the front"): random reinforcements pile up on interior territories that can never use them.

## Simulation (all-Normal AIs; 1,000 eight-player games for length, 1,000 Normal-vs-Easy 1v1s)

| Rule | Normal beats Easy | 8-player rounds: median / p90 / p99 / longest | Dice on the front at round 10 | Halfway leader wins |
|---|---|---|---|---|
| random (today) | 89.4% | 22 / 35 / 54 / 76 | 72.6% | 77.1% |
| weighted (front ×3) | 90.3% | 17 / 25 / 38 / 51 | 79.6% | 73.6% |
| **frontline** | 90.2% | **12 / 17 / 22 / 34** | **86.0%** | **62.3%** |

- "Halfway leader wins": the player with the most territories at the game's halfway round goes on to win. Lower means more comebacks. (Measured at round 10 instead, frontline looked worse, but round 10 is nearly the end of a 12-round game.)
- Seat balance holds without retuning: 2 players 53.0 / 46.9, 4 players within 1.7 points of fair (frontline; 2,000 games each).

## Gates

`npm run check` 132 passed · `npm run sim -- --games 2000` passes for all three rules · unit tests pin frontline (border only, overflow to reserve) and weighted (about 3:1).

## Scenarios

| Scenario | Status | Notes |
|---|---|---|
| Dice only land on territories facing an enemy | Verified | Unit test; and in a live game every labelled placement faced an enemy. |
| Front full → reserve | Verified | Unit test. |
| How a 12-round game feels | Not tested by Jacob yet | The open question: is it too quick? |
