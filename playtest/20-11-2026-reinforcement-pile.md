# Reinforcement pile and label clamp (20-11-2026)

Two changes from the 20-11-2026 issue triage, in one branch with two commits.

## 1. The reinforcement pile (#4)

Issue #4 asked for "a pile of dice next to the player bar that drains as each die lands", so that "your largest group is your income" is something you can see. Until now the end of a turn showed a line of text in the roll strip ("Brook +7 · largest group 7") while every "+N" label floated up at once over the territories, and the stacks were already at their new height.

**The change.** At Slow and Normal, the roll strip shows the player's emblem and name, a count, and a pile of cubes in their colour, with the old line under it as a caption. The dice then land one at a time over the first 60% of the placement time: each one takes a cube off the pile, lowers the count, adds a die to its territory's stack (count pill included), and raises or bumps that territory's "+N". The rest of the time lets the last labels be read before they fade, as before.

- **Same time as before.** The placement times in `src/game/timing.ts` are unchanged (Slow 1200 ms, Normal 700 ms for you; 700 and 350 ms for the AIs). A new `DRAIN_SHARE` table sets the 60%, which is also the span the placement plinks in `sound.ts` already used, so the plinks now land with the dice.
- **No pile at Fast and Instant,** as the issue asked: Fast keeps today's line of text and labels all at once (150 ms is too short to drain), Instant shows nothing on the board, as before.
- **Up to 12 cubes.** A bigger pile drains in proportion; the count is exact. On a 375 px phone 12 cubes, the name and a two-digit count fit one row.
- **The reserve stays in the pile.** The pile is every die on offer: largest group, knockout bonus and the old reserve. What doesn't fit on the board stays in the pile, so it drains down to the new reserve. To make the numbers add up, the caption (and the Fast message) now also says "N from reserve" when old reserve dice came in.
- **Caption wrapping.** A non-breaking space before each "·", so a wrapped line never starts with a dot.
- **UI only.** The engine's `reinforced` event already lists the dice in placement order; the board replays it. `data-dice`, the HUD chips and the saved game see the real state throughout; only the drawn stacks lag behind for the drain.

**Where it sits.** In the roll strip, not next to the player bar. The strip already carries the end-of-turn line, has a fixed height at every width (124 / 96 / 76 px), and is where your eye already is for "what just happened". Next to the bar it would have had to float over the board or grow the bar, and the phone bar has to stay one row at 375 px. Asked whether to keep it in the strip or move it by the bar, Jacob chose the strip (20-11-2026).

## 2. Floating labels at the edge of the board

The last-stand report (18-11-2026) saw a "+1" cut off at the top of a phone board and left it for later. Reproduced on today's code before the fix:

- Seed 1, 8 players, 375 × 812: you hold only territories at the top edge and end your turn. The "+2" over territory 6 sat 56 view units above the top of the board, so it couldn't be seen at all (`reinforcement-pile-clamp-before.png`).
- Over 40 seeds on a 375 px phone, a label over the top-most territories overflowed the top in 118 (territory, label) cases, by up to 111 units.
- Wide labels ("+2 linked!", "Last stand!") also ran off the left and right edges of the rotated phone board by up to 73 units (seed 9001), and one did in a real AI game.
- On a 1280 × 800 desktop the top-most label overflowed by 16 units (seed 1).

**The fix.** Every floating label ("+N", "−N", "+N linked!", "Last stand!") is nudged inside the view once it's placed, with a 4-unit margin, and with room above for the 14 units the float lifts it. A label at the top edge now overlaps its own token a little; its dark outline keeps it readable.

## Pacing

`npm run pacing -- --url http://localhost:5185 --speeds slow,normal,fast,instant --rounds 3`: 8 players, seed 9001, the seconds you wait between your turns.

| Speed | Before: first · rounds 1–3 | After: first · rounds 1–3 |
|---|---|---|
| Slow | 17.1 · 37.8 · 30.4 · 27.8 | 17.1 · 37.8 · 30.5 · 27.8 |
| Normal | 7.9 · 17.6 · 14.9 · 13.0 | 7.9 · 17.5 · 14.9 · 13.0 |
| Fast | 3.3 · 7.6 · 6.7 · 5.6 | 3.4 · 7.5 · 6.7 · 5.5 |
| Instant | 0.1 · 0.3 · 0.2 · 0.2 | 0.1 · 0.2 · 0.1 · 0.1 |

Same games (23, 16 and 16 AI attacks a round), and every wait within 0.1 s of before.

**Main thread.** Each landing redraws one stack and re-solves token overlaps. For a 27-die drain at Slow on a 375 px phone, Chromium reported no long tasks (> 50 ms); with the CPU slowed 4× (`Emulation.setCPUThrottlingRate`), one of exactly 50 ms in one run of two.

## Scenarios

| Scenario | Result |
|---|---|
| Slow, your opening turn (seed 42, 4 players): pile of 5, drains 5 → 3 → 1 → 0, "+1"s land on the board as it does, caption "+5 · largest group 5" | Verified: browser test on desktop and Pixel 7, and frames by hand at 375 × 812 |
| Slow, a big turn (24-territory group, 3 dice in reserve): 27 dice, 12 cubes drain in proportion, stacks grow as the count falls, caption "+27 · largest group 24 · 3 from reserve" | Verified by hand at 1280 × 800 and 375 × 812 |
| The longest caption (knockout bonus, dice from and left in the reserve) on a 375 px phone | Verified by hand: wraps to two lines inside the strip, no line starts with a dot, the cubes keep their size |
| Normal: your pile and the AIs' drain one die at a time | Verified by hand at 375 × 812 (seed 42, 4 players), logging every count the pile showed in one round: You 5 → 0 in 424 ms, Cinder 4 → 0 in 218 ms, Atlas 9 → 0 in 216 ms, Brook 4 → 0 in 211 ms (60% of 700 and 350 ms) |
| Fast: no pile, the line of text and the labels at once, as before | Verified: browser test on desktop and Pixel 7 records everything the strip shows during the round |
| Instant: nothing changes | Verified: pacing, and the existing instant browser tests |
| Turns aren't slower at any speed | Verified: pacing table above |
| Phone bar still one row at 375 px | Verified by hand: Round, speed, ?, sound and Quit on one row in every phone screenshot; the bar is untouched |
| A label over the top-most territory stays on the board | Verified: new browser test on desktop and Pixel 7 (fails without the fix: 16 and 69 units over) |
| No label leaves the view in real games | Verified by hand: 12 seeds × 8 players at Fast, autoplay, 200 labels each on 375 × 812 and 1280 × 800 ("+N", "−N", "+N linked!"), none outside |
| "Last stand!" label at an edge | Partly verified: same code path as the others, and the existing last-stand browser test passes; no last stand happened at an edge in the autoplay runs |
| Reduced motion | Verified by hand at 375 × 812 with `reducedMotion: 'reduce'`: the cubes vanish without the lift (transition 0 s), the pile still drains to 0 (`pile-reduced-motion-phone.png`) |
| Quit or a new game mid-drain | Partly verified: building a new board finishes the running placements first, so no label from the old board lands on the new one; the existing quit, resume and replay browser tests pass. Not tried by hand mid-drain |
| Screen readers | Partly verified: the count and the cubes are `aria-hidden`; the strip is still a polite live region, so the name and caption are read once. Not tried with VoiceOver |
| Background tab | Partly verified by reading: the drain runs on timers; if a hidden tab delays them, the end of the placement time still lands every die and updates the pile |

## Gates

- `npm run check`: 204 passed, tsc clean.
- `npm run e2e`: 110 passed, 6 skipped (desktop and Pixel 7). An earlier run failed 4 tests because I edited source while it ran and Vite reloaded the pages; that run also showed two of my new tests racing the shorter label and message life, so both now record what the page shows with a `MutationObserver` instead of polling.
- `npm run sim`: not run. Nothing in the engine or AI changed.

## Screenshots

`playtest/screens/` (gitignored):

- `reinforcement-pile-clamp-before.png`: the invisible "+2" at the top edge before the fix (seed 1, 375 × 812).
- `label-top-edge-{desktop,phone}.png`: the browser test's label at the top edge, after the fix.
- `pile-small-phone-slow-{40,350,650,1000}ms.png`: your opening pile at Slow, draining.
- `pile-big-desktop-slow-{40,350}ms.png`, `pile-big-phone-slow-40ms.png`: a 27-die pile.
- `pile-longest-caption-phone.png`: the longest caption on a 375 px phone.
- `pile-reduced-motion-phone.png`: the pile under reduced motion.
- `game-{desktop,phone}-reinforcements.png`: the browser test's pile.
