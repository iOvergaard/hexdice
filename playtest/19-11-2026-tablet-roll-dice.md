# Bigger roll dice on tablets (19-11-2026)

Follow-up to `19-11-2026-roll-strip-fit.md`. From 720 px the roll strip is one row a side (name, dice, total). Below about 1100 px that row is short of room for 8 dice a side, so the dice shrank to fit: at 768 px a face was 8 to 10 px, smaller than on a phone. Jacob chose to tuck the cubes under each other there, as on phones.

**Branch:** `feat/tablet-roll-dice` (worktree `.claude/worktrees/roll-dice`), off main `9e0844a`.
**Played by:** Claude, in headless Chromium from 640 to 1280 px wide, scripted against dev servers of this branch and of main.

## What changed

- **720 to 1099 px:** the cubes tuck each side under the next die (no gap), and `--die` is `min(24px, 5.85vw - 32.5px)`. That size fits 8 dice a side with the longest names (Cinder against Cinder) and two-digit totals without shrinking, so the dice keep one size from the tumble to the result.
- **From 1100 px:** unchanged; the cubes stand apart at full size.

How the size was set: in the worst case the dice row gets 0.5 × width − 272 px (88 px at 720, 112 at 768, 240 at 1024; You against Brook gets about 20 px more), and 8 tucked cubes take 8.5 × `--die`.

## Before and after

![Tablets, before and after](screens/roll-tablet.png)

Also in `screens/`: `tab-{768,820,1024,1100}-{before,after}-cmp.png`, `tab-{768,820,1024}-{real,worst}.png`.

| Width | front face before (shrunk to fit) | front face after |
|---|---|---|
| 720 | 6 to 8 px | 9 px |
| 768 | 8 to 10 px | 12 px |
| 820 | 11 to 13 px | 15 px |
| 880 | 13.5 px (worst case) | 18 px |
| 960 to 1099 | 17 to 23 px | 22.5 to 22.8 px (full size from about 970) |
| 1100 and up | 22.8 px | 22.8 px, apart |

## Scenarios

| Scenario | Result |
|---|---|
| 8 vs 8 fits the strip from 720 to 1099 px | Verified: worst-case sweep (attacker win, defender win, draw, Cinder against Cinder, two-digit totals) at 720, 744, 768, 800, 820, 880, 960, 1024 and 1099 px; nothing outside its box, no die shrunk. The e2e test from the fit change still covers 720, 768 and 1024 px |
| Dice keep their size from the tumble to the result | Verified: same layout width while tumbling and settled at 720, 768, 820, 960, 1024 and 1100 px |
| Tucked faces stay apart | Verified: the dice never shrink at these widths, so the tuck keeps the phone's proportions (about 1 px of side between faces at 768 px) |
| Desktop from 1100 px unchanged | Verified: 1100 and 1280 px, cubes apart at full size |
| Phones and 641 to 719 px unchanged | Verified: the worst-case sweep at 640, 641 and 719 px is the same as before |
| Real tablets, Safari and Firefox | Not testable here: Chromium only |

## Gates

| Gate | Result |
|---|---|
| `npm run check` | 196 passed |
| `npm run e2e` | 98 passed, 6 skipped (desktop-only and phone-only tests) |
