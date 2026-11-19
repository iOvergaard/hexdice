# Overflow behind the front line (19-11-2026)

Jacob noticed that the reserve kept growing once his front line got short, above all in the final: new dice only land on territories that border an enemy, so once those held 8 each, everything else waited in the reserve. Now dice that don't fit on the front line go to the territories just behind it, nearest the front first (ties at random). They wait in the reserve only once every territory you hold is full. The setting is `frontlineOverflow`: `behind` (default) or `reserve` (the old rule, used to replay older saves).

![Overflow behind the front](screens/overflow-behind-front.jpg)

## Numbers

Measured first with a throwaway script that moved the reserve onto territories behind the front after each turn (800 to 1,000 Normal-AI games per row), then confirmed with the real rule in `npm run sim -- --games 2000` on the same seeds.

| Overflow goes to | Normal beats Easy | 8-player p90 / p99 | Round-5 leader wins (8p) | Smaller finalist with 6+ territories wins (4p / 8p) | Leader's reserve in the final |
|---|---|---|---|---|---|
| Reserve (old rule) | 90.7% | 22 / 32 | 40% | 26% / 31% | 8 to 11 dice |
| Random territories behind the front (probe) | 90% | 22 / 32 | 40% | 29% / 29% | 0 |
| Behind the front, nearest first (built) | 90.7% | 22 / 31 | 40% | 29% / 30% | 0 |

The differences are within noise (about 200 to 270 finals per cell). Across a whole game the AIs barely use the reserve (0.3 dice on average after a turn), because they attack every turn and their fronts rarely fill. The reserve piled up in the final, which is where this changes things: the leader's 8 to 11 banked dice now stand behind the front, where a breakthrough or an advance would meet them. Seat balance doesn't move (8-player wins by seat within a few games of the old rule).

## Scenarios

| Scenario | Result |
|---|---|
| Front has room: it fills first, then the territories behind it | Verified: unit test, `placed` [3, 3, 2, 2] |
| Front full: dice go to the territory one step behind, then two steps | Verified: unit test, `placed` [2, 2, 1, 1] |
| Every territory full: the dice wait in the reserve | Verified: unit test, reserve 4 |
| `frontlineOverflow: 'reserve'` keeps the old rule | Verified: unit test |
| Saves from before replay with the reserve rule | Verified: unit test |
| How to play explains it, and leaves it out under random reinforcement | Verified: unit test; text read in the panel |
| In a game: a short front of 8s, You end your turn | Verified by hand in the browser pane: all 18 new dice went to territories just behind the front (+6, +3, +2 …), reserve 0, "You +18 · largest group 18" |
| AI games: skill, length, comebacks | Verified: simulator, table above |
| Whether a human feels the extra defence in depth | Not testable here: needs your games |

Gates: `check` 195 passed (one earlier run had a single failure I couldn't reproduce in four reruns; the machine was busy with other sessions' tests), `sim` passed, `e2e` 97 passed and 5 skipped.
