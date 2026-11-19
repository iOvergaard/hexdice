# Roll strip fit: the winner's tick and big rolls on every width (19-11-2026)

Follow-up to `19-11-2026-roll-dice.md`. Two problems with 8 vs 8 rolls in the roll strip:

1. **The winner's tick (older than the cubes).** On a phone the winning total, its ✓ and "7 moved in" share one line of 119 px. The bigger winning total left no room, the ✓ wrapped onto its own line, and the highlighted box hung 17 to 23 px below the strip, over the map. It happened on most attacker wins, 4 vs 3 too. The same wrap hit a winning defender's total on tablets.
2. **Cube dice overflowing (from the cube change, live since `1c88ec0`).** The flat dice used to shrink to fit; the cubes kept their size. 8 vs 8 then overflowed below 375 px, wrapped to two rows from 641 to 719 px, and from 720 to 1024 px pushed the totals out of their box, up to 164 px, over "Captured" and the other side's dice.

**Branch:** `fix/roll-winner-overhang` (worktree `.claude/worktrees/roll-dice`), off main `80a764d`.
**Played by:** Claude, in headless Chromium at 320 to 1280 px wide, scripted against dev servers of this branch and of main.

## What changed

- **Phones:** the winning total keeps the strip's phone size (1.3rem, was 1.6rem), the ✓ hugs it, the columns sit 4 px apart, and "7 moved in" can end in "…" as a last resort.
- **All widths:** a total never wraps its ✓.
- **Below 720 px:** the die size follows the viewport (`--die: min(14px, 5.85vw - 8.3px)` on phones, `min(28px, 5vw - 13px)` from 641 to 719 px), so 8 a side fit one row and the dice keep one size from the tumble to the result. The dice row no longer wraps.
- **From 720 px:** the dice column gives way to the name and the total (`minmax(0, max-content)`), and the dice shrink with it. The total's column keeps one width (4.6rem), so the dice don't change size when the result appears.

## Before and after

![Phones and 641 px, before and after](screens/roll-fit-phone.png)
![Tablet and desktop, before and after](screens/roll-fit-wide.png)

Also in `screens/`: `fix-{360,375,641,768,1280}-{before,after}.png`.

## Worst case across widths

Cinder against Cinder (the longest names), 8 vs 8, two-digit totals, for an attacker win, a defender win and a draw. "Out" is how far anything (a side, its name, dice, total or cost, or a die) sits outside the box it belongs in.

| Width | main `80a764d` (cubes) | flat dice (`fe33510`) | this branch | die box on this branch |
|---|---|---|---|---|
| 320 | dice out 28 px, box below strip 23 px | box below strip 23 px | fits; "7 moved in" ends in "…" | 13 px |
| 360 | box below strip 23 px, dice out 8 px | box below strip 23 px | fits; "7 moved in" ends in "…" | 15.9 px |
| 375 | box below strip 23 px | box below strip 23 px | fits | 17 px |
| 412 | fits | fits | fits | 17.5 px |
| 641 to 719 | two rows, 26 px below strip | two rows at 641 and 680, 19 px below strip | fits | 24 to 29 px |
| 720 to 900 | totals out 74 to 164 px | totals out 26 to 116 px | fits | 8 to 19 px (shrunk to fit) |
| 960 to 1024 | totals out up to 44 px | fits | fits | 23 to 27 px |
| 1100, 1280 | fits | fits | fits | 30 px |

## Scenarios

| Scenario | Result |
|---|---|
| Attacker win on a phone: box stays inside the strip | Verified: 8 vs 8, 4 vs 3 and 8 vs 1 at 375 px, box 77.7 px tall in an 84 px strip, nothing clipped |
| Defender win and draw on a phone | Verified: 2 vs 8 at 375 px and the worst-case sweep above |
| ✓ never wraps, any width | Verified: totals are one line in every row of the sweep, 320 to 1280 px |
| 8 vs 8 fits one row below 720 px | Verified: 320, 360, 375, 412, 641, 680 and 719 px, no overflow, no wrap; new e2e test covers 320 to 1024 px |
| Dice keep their size from the tumble to the result | Verified below 720 px (same layout width while tumbling and settled at 320, 375 and 641 px). Partly verified from 720 px: they shrink 0.3 px when "vs" becomes "Captured", which you can't see |
| Desktop unchanged | Verified: 1280 px before and after are identical in the screenshots |
| Narrow phones (320, 360 px): "7 moved in" | Partly verified: it fits as "7 move…" when the attacker wins with a two-digit total. Everything else reads |
| Tablets in portrait (720 to 900 px), 8 vs 8 | Partly verified: everything stays in its box, but 8 dice a side shrink to 8 to 19 px boxes (11 to 13 px at 768 with You against Brook), smaller than on a phone. Fewer dice keep full size |
| Real devices, Safari and Firefox | Not testable here: Chromium only. `min()` with viewport units and `minmax(0, max-content)` are supported in all three |

## Gates

| Gate | Result |
|---|---|
| `npm run check` | 191 passed |
| `npm run e2e` | 94 passed, 6 skipped (desktop-only and phone-only tests); 1 new: 8 vs 8 inside the strip at 320, 360, 375, 641, 720, 768 and 1024 px |

The flaky tumble test (`ui-harness.spec.ts`, "rolling dice tumble …") is fixed separately in `6db5418` on `fix/tumble-test-race`. It passed in this branch's run.

## Open for Jacob

1. **Tablet portrait dice.** The one-row wide strip is too narrow below about 1000 px for 8 dice a side plus names and totals. The dice now shrink to fit instead of overlapping. Two ways to give tablets bigger dice: start the one-row strip at about 1000 px instead of 720 (tablets get the stacked strip, 48 px taller, which also hits phones in landscape), or tuck the cubes on the wide strip too, as on phones (about 30% more room).
2. **Phones narrower than 375 px** show "7 move…" on a two-digit attacker win.
