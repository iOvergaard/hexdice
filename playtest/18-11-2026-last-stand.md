# Last stand (18-11-2026)

When two players are left, the bigger one usually holds about 25 of the 30 territories, and the final is over within two rounds. The new rule gives the smaller finalist a chance when the final is still a fight. The first time a turn ends with only two players left, in a game that started with three or more, the one holding fewer territories gains +1 die on each of their territories, up to 8. Nobody gets it on a tie. If the leader knocks out both of their last two rivals in one turn, nobody gets it at all.

![Last stand, desktop](screens/last-stand-desktop.png)
![Last stand, phone](screens/last-stand-phone.png)

## Numbers

2,000 Normal-AI games per size, with the same seeds for both columns. "Still a fight" means the smaller finalist holds 6 or more of the 30 territories when the final starts. That's a third to two fifths of the finals. In the rest, the smaller player holds 5 or fewer.

| Start | Smaller finalist wins, still a fight: off → on | 6–8 | 9–11 | 12+ | On 5 or fewer | Seat wins (on) | p90 / p99 rounds |
|---|---|---|---|---|---|---|---|
| 3 players | 23% → **39%** | 5% → 15% | 23% → 37% | 41% → 65% | 0% → 0% | 32/33/35% (was 32/33/36%) | 13 / 19, unchanged |
| 4 players | 20% → **32%** | 5% → 11% | 20% → 33% | 37% → 55% | 0% → 0% | 24/23/27/25% (was 24/24/27/25%) | 15 / 21 (was 14 / 21) |
| 8 players | 22% → **32%** | 5% → 7% | 22% → 35% | 44% → 60% | 0% → 0% | unchanged | 19 / 27 (was 19 / 28) |

The aim was about 1/3 when the final is still a fight. The rule hits it at every size, and a nearly wiped-out player stays out. When the final is nearly even (12 or more territories each), the smaller player becomes slightly favoured (55–65%).

The other options I probed, with a throwaway script that added dice to the game state from outside the engine (8 players):
- +2 dice: 39%. With 3 and 4 players it gives 57% and 47%.
- Fill every territory to 6: 41%.
- Fill every territory to 8: 70%.
- Extra income for the smaller player, even equal to the leader's: no change, because a short front line is already full.

`npm run sim -- --games 2000`: Normal beats Easy 87.4%; 8-player p90 19, p99 27; 788 last stands across the 1,000 eight-player games; 0 crashes, 0 illegal moves.

## Scenarios

| Scenario | Result |
|---|---|
| Fires once, for the smaller of the last two, at the end of the turn, after reinforcements and before the next turn | Verified: unit tests in `tests/unit/rules.test.ts` |
| +1 per territory, stops at 8, the event lists one territory per die gained | Verified: unit tests, including `lastStandDice: 2` |
| Nobody gets it on a tie, and it never comes later | Verified: unit test |
| Nothing while three or more are in; never in a two-player game | Verified: unit tests (`createGame` marks a two-seat game as already in the final) |
| Off at `lastStandDice: 0`; saves from before replay without it | Verified: unit tests |
| You end the turn that leaves two players: the AI's territories gain a die, gold "Last stand!" plus +1 labels, and "Last stand · Cinder +1 on each territory" in the roll strip | Verified: browser test, desktop and phone; by hand at Normal speed in the browser pane |
| The AI's turn leaves two players and you are the smaller one: "Last stand · You +1 on each territory" | Verified by hand in the browser pane: 6 of your territories gained, the 2 already at 8 stayed |
| How to play shows "The final" (and drops it when the rule is off) | Verified: unit test; by hand in game |
| Knocking out both last rivals in one turn skips it | Verified by the rule (it only fires at the end of a turn with exactly two players left); about 1 in 5 games end that way by accident in the simulator |
| The Normal AI plays for the double knockout | Not built, by choice: the AI doesn't know the rule |
| A label for a territory at the top edge of the board is cut off on a phone (seen on a +1) | Partly verified: this already happens with reinforcement labels, so it isn't new to this change; it's left for the dice-stacks work |
| No sound for the last stand | Not built, by choice: it reuses no cue; the turn chime still plays |

Gates: `check` 159 passed, `sim` passed (above), `e2e` 72 passed and 4 skipped.
