# Scoreboard and dice totals (19-11-2026)

Jacob asked for the total number of dice somewhere on screen, and for a scoreboard on the game-over card showing when each player went out and how many attacks and defences they had.

- **Player bar:** each chip now stacks the income (largest group) over a small die and the player's total dice on the map. Every chip keeps the same shape at any width. How to play and the README explain the new number.
- **Scoreboard:** the game-over card ends with a table in finishing order: place, player, the round they went out (or Winner, or Still in while play goes on), attacks won of made, and defences held of faced (a draw counts as held). The counts come from the game's event log (`src/game/summary.ts`).
  - On screens 900 px and wider, the card has two columns: chart and story on the left, scoreboard on the right.
  - On a phone it's one column that scrolls, with Replay and Title stuck to the bottom.

![Game over on a laptop](screens/game-over-desktop-ending.png)
![Game over on a 375 px phone](screens/game-over-phone-375.png)
![Player bar on a phone](screens/player-bar-phone.png)

| Scenario | Result |
|---|---|
| Attack and defence counts match the event log, and attacks won equal captures | Verified: unit test over a whole 8-player game |
| The scoreboard lists every player in finishing order, with the winner first and marked Winner, and the counts shown match the log | Verified: browser test, desktop and phone |
| Replay and Title stay on screen on a 375 px phone | Verified: browser test; the buttons stick to the bottom while the table scrolls under them |
| Laptop (1280×800): the whole scoreboard is visible without scrolling | Verified by screenshot |
| Each chip shows the right total dice, with nothing spilling out of the chip and no sideways scrolling | Verified: browser test, desktop (one-row bar) and phone (two rows of four) |
| Screen readers hear the dice total | Verified: the chip's label says ", N dice"; not tried with VoiceOver |
| A resumed game's scoreboard covers moves from before the reload | Partly verified: the existing resume test still passes, and the summary is rebuilt from the full event log |

Gates: `check` 197 passed, `e2e` 100 passed and 6 skipped, `build` passed.
