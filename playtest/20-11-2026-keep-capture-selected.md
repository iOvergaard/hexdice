# Keep a fresh capture selected (20-11-2026)

Issue #5: after a winning attack, keep the captured territory selected, so you can attack on from it with one tap. Until now `nextSelection()` (`src/ui/selection.ts`) returned no selection with every attack, and `submit()` in `src/game/controller.ts` cleared it again.

**The change.** A new pure function, `selectionAfterAttack(state, attack, canAttack)` in `src/ui/selection.ts`, decides what stays selected once your attack has played out. It keeps the territory you just took when it now holds 2+ dice and has at least one legal target. Otherwise, and after any failed attack, nothing stays selected, as before. `submit()` calls it only for your own attacks, after the roll, the capture and any knockout animation, and before the busy lock lifts. AI turns, replay and `load()` never go through `submit()`, so they never keep a selection.

**Failed attacks.** The issue only asks for winning attacks, so a failed one clears the selection even when a draw leaves the attacker with 2+ dice. A loss is a moment to rethink, not to tap again.

**Cancelling.** Nothing new: tap the selected territory again, tap the sea, tap another of your stacks (which switches to it), press Escape, or end your turn. How to play and the README's "How to play" gain one line: "The territory you took stays selected while it can attack again: tap the next target to carry on, or tap it again to let go."

## Taps in long turns

The hands-on was a script driving the dev server with Playwright on a Pixel 7 (412×915, touch taps on the tokens). The player attacked whenever its stack was bigger than the target, attacked on from a kept capture when that capture had such a target, and otherwise tapped the best stack elsewhere. 6 seeds (11, 23, 42, 77, 101, 202), 8 players, the first 4 human turns of each: 24 turns.

| | Count |
|---|---|
| Attacks | 56 (48 captures, 8 failed) |
| Captures kept selected | 44 of 48 (the other 4 had 1 die left or no enemy next to them) |
| Kept, then attacked on with one tap | 21 |
| Kept, then the player switched to another stack | 10 |
| Kept, then the player ended the turn | 13 |
| Failed attacks that left a selection | 0 of 8 |
| Taps to attack, before → after | 112 → 91 (19% fewer) |
| Longest turn (seed 23, turn 4) | 5 attacks: 10 → 6 taps |
| Selection after an attack differing from the rule | 0 of 56 |

## Scenarios

| Scenario | Result |
|---|---|
| A capture with 2+ dice and a target stays selected, with odds on its targets | Verified: browser test on desktop and Pixel 7 (`tests/e2e/keep-capture.spec.ts`), and 44 kept captures in the scripted turns |
| The next tap on a target attacks on from the capture | Verified: browser test (action log `a→b`, then `b→c`) and 21 chained attacks in the scripted turns |
| Tapping the capture again lets go | Verified: browser test and scripted, Pixel 7 |
| A capture left with 1 die, or with no enemy next to it, clears | Verified: unit tests, and 4 such captures in the scripted turns cleared |
| A failed attack clears, even when a draw leaves 2+ dice | Verified: unit test; scripted, 10 failures out of 12 attacks of 4 dice into 5 (one a draw that left 3 dice), none left a selection, plus 8 failures in the long turns |
| A capture that wins the game leaves nothing selected | Verified: unit test; scripted on Pixel 7 from a loaded position, "You win" card with nothing selected |
| Busy lock: taps during the roll and capture animation are ignored | Verified: scripted at Slow on Pixel 7, four taps (target, own stack, the capture, target) during the roll: one action in the log, nothing selected during the animation, the capture selected afterwards |
| Tap meant for another of your stacks switches to it, no attack | Verified: scripted on Pixel 7 (selection moved from the capture to the other stack, action log unchanged), and 10 switches in the long turns, none of which attacked |
| Tapping the sea clears it | Verified: scripted on Pixel 7, a tap in the corner of the board |
| Escape clears it | Verified: scripted on desktop (1280×800) |
| End turn with a kept capture: nothing selected on AI turns or when your turn returns | Verified: scripted on Pixel 7, seed 11 with 4 players, sampled through the AI turns |
| Replay never shows a selection | Verified: scripted on Pixel 7, an autoplayed 2-player game (seed 5) replayed, sampled during and after |
| Misfire: a tap meant for one of your stacks lands on an enemy next to the kept capture and attacks | Partly verified. This is the one new way to attack by accident: before, a tap on an enemy with nothing selected did nothing. The highlight is clear at phone width (the capture outlined, its targets hatched with odds pills, everything else dimmed), and a deliberate tap on your own stack always switches. How often a real finger misses can't be measured by a script; it needs Jacob on a phone |
| Hands-on by mouse in the app's browser pane | Not testable here: at the pane's emulated 375×812 the clicks didn't reach the board's tokens, so the phone run was scripted instead |
| How to play and README: British English, no em dashes | Verified: the how-to-play unit test (em dash ban) and by reading |

## Gates

- `npm run check`: 210 passed, tsc clean.
- `npm run e2e`: 108 passed, 6 skipped (desktop and Pixel 7), including the new `keep-capture.spec.ts`. With the controller change switched off, the new test fails on the kept selection, so it tests the change.
- `npm run sim`: not run. Nothing in the engine or AI changed.

## Screenshots

`playtest/screens/` (gitignored):
- `keep-capture-{desktop,phone}.png`: from the browser test, the capture selected with odds on its targets.
- `keep-capture-rolling.png`, `keep-capture-kept.png`: Pixel 7 at Slow, during the roll and after it, the 7-dice capture still selected.
- `keep-capture-switched.png`: Pixel 7, after tapping another of your stacks while the capture was selected.
