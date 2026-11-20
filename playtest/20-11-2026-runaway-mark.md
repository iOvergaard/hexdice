# Runaway mark in the player bar (20-11-2026)

Issue #2. The Normal AI gangs up on a runaway: anyone holding at least 1.5× the average territory count of the players still in, and at least 8, gets +0.6 on every attack against them, the human included. The player bar showed largest group and total dice, never territories held, so a player couldn't see who the table was after, or how close they were to the bar themselves. `playtest/20-11-2026-strategy-sim.md` found that staying under the bar until four players are left is worth +3.5 points of win rate at 8 players (16.3% against 12.8%).

**The change.**

1. **Territories held** on every chip: a third small number under the income and the total dice, by a little hexagon (the dice have a little square). The chip's `aria-label` gains ", N territories".
2. **The mark:** a crosshair on a paper disc on the top-left corner of the player's emblem. A shape, not a colour (the stylesheet keeps colour for the players), always shown, no hover needed. The chip's `aria-label` gains ", runaway: the computer players are ganging up on you" (or "them"); the disc's `title` repeats it as a tooltip on desktop.
3. **One source for the bar:** `src/ai/runaway.ts` exports `runawayBar(territories, alive)`, `runaways(state)` and `gangedUpOn(state)`. The Normal AI, the player bar (through the controller, as with `largestGroups`) and How to play all use it. The Normal AI's behaviour is unchanged: a 500-game `npm run sim` gives byte-identical results before and after the refactor (date and duration aside).
4. **How to play** gets a Runaways section: "On Normal, the computer players gang up on anyone who runs away with the map, you included. A crosshair on the emblem in the player bar shows who that is." and "A runaway holds 8 territories or more with six to eight players in, 9 with five, 12 with four and 15 with three." The numbers come from `runawayBar` and `territoryCount`. The README's "The computer players" gets the same, and both explain the new hexagon number.

The bar on a 30-territory map, from `runawayBar` and its unit test:

| Players left | 8 | 7 | 6 | 5 | 4 | 3 | 2 |
|---|---|---|---|---|---|---|---|
| Territories | 8 | 8 | 8 | 9 | 12 | 15 | 23 |

**When the mark shows.** Only for a runaway while (a) a Normal computer player other than them is still in, and (b) three or more players are left.

- (a) Easy doesn't gang up; it attacks at random. A mark at an Easy table, or on a Normal player who is the only Normal one left, would claim something that isn't happening. The territory count still shows, so the information is there either way.
- (b) With one opponent left, +0.6 on every attack changes nothing: Normal only uses the score to choose between attacks that already pass its odds test, and they all hit the same player. The strategy sim drew the same line.

A computer player with no level counts as Normal, as in the controller.

## Scenarios

| Scenario | Result |
|---|---|
| Bar values at 8 to 2 players (8, 8, 8, 9, 12, 15, 23), and the floor of 8 | Verified: unit tests (`tests/unit/runaway.test.ts`) |
| Runaways: at or over the bar, only players still in count towards the average, the current player included | Verified: unit tests |
| Ganged up on: human runaway with Normal AIs; nobody at an all-Easy table; not the only Normal player; nobody with two left; no level counts as Normal | Verified: unit tests |
| Normal AI unchanged by the refactor | Verified: `npm run sim -- --games 500` before and after, identical JSON apart from date and duration; the existing AI runaway tests pass |
| Territory count on every chip and in its accessible name | Verified: browser test `player-bar.spec.ts` (seed 42, 8 players, desktop 1280×800 and Pixel 7) |
| Mark on you at 8 territories with 8 players, not on a rival at 7; on both once the rival reaches 8; accessible name says "you" or "them" | Verified: browser test `runaway-mark.spec.ts`, desktop 1280×800 and phone at 375×812 |
| All-Easy table: territories shown, no mark | Verified: same browser test, and by hand: seed 2611, 8 players, `ai=easy`, autoplay to the end: 29 positions with a player over the bar, no mark |
| Mark follows the game live, after every capture | Verified by hand: seed 2611, 8 players, Normal, autoplay at 375×812, sampling the bar every 40–250 ms to the end of the game. 70 distinct positions, and the marks matched an independent recount of the bar every time. The eventual winner was first marked in round 1 (8 territories) and carried the mark for most of the game; it dropped off at two players left (27 of 30, bar 23) |
| Mark clear of the income, dice and territory numbers and of the You tag; nothing spills out of a chip; no sideways scroll | Verified: browser test checks the boxes don't overlap, desktop and 375 px. By eye at 375, 800 and 1280 px |
| Phone bar at 375 px: nothing wraps, chips keep four to a row | Verified: browser test at 375×812, and by hand |
| Cost on a phone | Measured at 375×812 with 8 players: each chip grows from 50 to 63 px (one more line), so the two rows of chips take 27 px more and the map shrinks from 264×374 to 248×351 px (about 6%). On a wide screen (≥ 1180 px) the bar stays one row with the controls; between 376 and 1179 px the chips grow by 13 px |
| How to play: Runaways section on a phone | Verified by hand at 375×812, and unit tests for the text (including a 40-territory map, to check the sentence still reads) |
| Hover tooltip on the mark | Partly verified: the `title` is set and checked in the DOM; not hovered by hand |
| Screen readers | Partly verified: the accessible name is checked in the browser test; not tried with VoiceOver |
| A resumed game, and Replay | Partly verified: the bar renders from the state on every update, the same path as play, so both show the mark; not tried by hand |

One caveat on the hands-on runs: `__hexdice.autoplay` plays your seat with the Normal move function. The mark rightly ignores it (your seat is still human), so in the all-Easy run your autoplayed seat may have ganged up without a mark. That only happens with the dev hook.

## Gates

- `npm run check`: 215 passed, tsc clean.
- `npm run e2e`: 108 passed, 6 skipped (desktop and Pixel 7), on the final tree.
- `npm run sim -- --games 500`: identical before and after the refactor; crashes 0, illegal 0, cap hits 0.

## Screenshots

`playtest/screens/` (gitignored):

- `runaway-mark-phone.png`, `runaway-mark-desktop.png`: from the browser test, you and a rival both marked (8 territories each, 8 players).
- `runaway-mark-help-phone.jpg`: How to play, Runaways section, at 375×812.
- `player-bar-{desktop,phone}.png`: the territory count on a fresh game (seed 42).

## For Jacob

- **The phone cost.** The map is about 6% smaller on a 375×812 phone with 8 players. If that's too much, the phone chips could lose 2 px of padding top and bottom, which wins back about 8 px of the 27.
- **It gives the AI away.** The issue named that trade-off. The mark shows who; the How to play line also gives the numbers, so you can plan to stay under the bar. Drop the second line if that's more than you want players to know.
