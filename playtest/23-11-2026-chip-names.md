# Player names in the bar, and the knockout bonus (23-11-2026)

Issue [#31](https://github.com/iOvergaard/hexdice/issues/31): player names in the bar were cut to a letter or two with 5 or more players. Jacob picked option 2: show a name only when its chip has room for it. While on the chips, Jacob also asked for the knockout bonus (`+1/turn`) to fit at every width.

## What was wrong

Each chip in the player bar holds an emblem badge, the name and the numbers (income, dice, territories). From 641 to 1179 px wide every chip showed its name, and with 5 or more players the chips were too narrow, so names were cut with an ellipsis ("D…", "Br…", "At…"). Phones (640 px and under), a phone on its side, and screens from 1180 px hid every name but You's, even with 2 players where the names fit.

Measured at seed 101, every 10 px from 320 to 1920 px (1,127 sizes over 2 to 8 players):

| Players | Names cut (game start) | Names cut (late game: three-digit dice, a reserve, a bonus) |
|---|---|---|
| 2 | never | never |
| 3 | never | 650 to 720 px |
| 4 | never | 650 to 950 px |
| 5 | 650 to 720 px | 650 to 1170 px |
| 6 | 650 to 860 px | 650 to 1170 px |
| 7 | 650 to 1000 px | 650 to 1170 px |
| 8 | 650 to 1150 px | 650 to 1170 px |

On the issue's grid (every 6 px from 641 to 1179) the game-start numbers match the issue exactly: 15, 38, 61 and 86 of 90 widths cut with 5, 6, 7 and 8 players.

![Before, 8 players at 1024 px: names cut, and the bonus cut at the edge](screens/23-11-2026-chip-names-before-8p-1024x900.png)

The knockout bonus sat in line after the numbers wider than 640 px: cut at the chip's edge from 641 to 1179 px ("+2/"), and spilling into the next chip on the one-row bar from 1180 px. A reserve (`+12`) did the same, and both squeezed the name: with 4 players at 700 px a chip with a bonus cut "Cinder" and "You".

![Before, 4 players at 700 px: the bonus and a cut name](screens/23-11-2026-chip-names-before-4p-700x900.png)

![Before, 8 players at 1280 px: the bonus runs under the next chip](screens/23-11-2026-chip-names-before-8p-1280x900.png)

![Before, 2 players at 1920 px: room to spare, no names](screens/23-11-2026-chip-names-before-2p-1920x900.png)

## The change

CSS only, `src/ui/ui.css`, in two commits.

**Names.** Each chip is a size container (`container-type: inline-size`), and `@container (min-width: 8rem)` shows the names. 8rem is 128 px of the chip's content box. The widest chip needs 120.4 px in the test browser's font (Inter): badge 26, two gaps of 6, "Cinder" 46.4 at 0.9rem semibold, and the dice line with "240" 36. The other 7.6 px are for a wider font: by canvas measurement "Cinder" is 45.5 to 52.9 px in the other installed fonts (DejaVu Sans the widest, needing about 128.5). It's in rem, so a bigger default font hides the names sooner instead of cutting them. Below the threshold only You's name shows, as the tag above the chip; from it every name shows in line.

- **You when names show:** in line and bold, in the paper colour, as it was from 641 to 1179 px. The tag exists to keep You findable when no names show. Where they do, You's name is one of them in the same place, the chip keeps one line, and the bold weight (with the current player's white border) still picks it out. A tag there would also need room above the chips in the 641 to 1179 px layout, which has none.
- **The tag** is the phone's (0.7rem, 9 px up) at every width. From 1180 px it used to be a touch bigger (0.75rem, 10 px up).
- **Browsers without container queries** (Safari before 16) keep today's phone look everywhere: names hidden, You's tag.
- The width media queries that hid names (the phone block, which also serves a phone on its side, and the `min-width: 1180px` block) lose their name rules and keep everything else.

**The bonus and the reserve.** Every chip now wraps, as phones already did: the bonus takes a full line under the numbers, right-aligned, and the reserve goes under them when it doesn't fit beside them. Neither can squeeze a name any more, and with the wrap a name can't be cut even in a font wider than the threshold allows for: the numbers would drop a line instead. On the one-row bar from 1180 px a chip can be narrower than its emblem and numbers (64 px chips with 8 players). There they used to run into the padding; with the wrap they would drop a line and make the bar taller from the first round. So under 4.5rem of content (72 px: emblem, gap and three-digit dice take 68) the numbers keep to one line as before, and the reserve goes under them.

Without a reserve or a bonus the bar is exactly as tall as before at all 1,141 sizes measured (upright and on its side). A bonus adds a line to its row (21 px), and a reserve that doesn't fit beside the numbers adds another; on main they were cut or spilled instead.

![After, 8 players at 1024 px: You's tag, bonus lines under the numbers](screens/23-11-2026-chip-names-after-8p-1024x900.png)

![After, 4 players at 700 px: names in line, You in bold, bonus and reserve whole](screens/23-11-2026-chip-names-after-4p-700x900.png)

![After, 8 players at 1280 px](screens/23-11-2026-chip-names-after-8p-1280x900.png)

![After, 2 players at 1920 px: the names show on the one-row bar](screens/23-11-2026-chip-names-after-2p-1920x900.png)

Phone, 8 players at 375 px, and a phone on its side at 750×342 and 568×320: [375](screens/23-11-2026-chip-names-after-8p-375x900.png), [750×342](screens/23-11-2026-chip-names-after-8p-750x342.png), [568×320](screens/23-11-2026-chip-names-after-8p-568x320.png).

## The sweep after

Same 1,127 upright sizes, plus 750×342 and 568×320 on its side for 2 to 8 players, at game start and in a worst case (every computer player renamed Cinder, numbers 30, 240 and 30, a `+64` reserve and a `+7/turn` bonus on every chip):

- **No name is cut** anywhere, in either run (before: 662 cut names at game start, 1,505 in the worst case).
- **Names show** wherever the content box is 128 px or more. With 3 or fewer players that's every width from 640 px; with 8 players only 640 px (four chips a row on the phone layout), since from 641 px the chips are at most 141 px wide, 119 px of content. Where Cinder with 240 dice is hidden, it would have had at most 7.6 px to spare (10.6 on the phone layout, whose gaps are 4 px); where it shows, at least 7.6 px.

  | Players | Names in line (after) | Before |
  |---|---|---|
  | 2, 3 | 640 to 1920 px | 650 to 1170 px |
  | 4 | 640, 660 to 1170, 1250 to 1920 px | 650 to 1170 px |
  | 5 | 640, 820 to 1170, 1400 to 1920 px | 650 to 1170 px (cut up to 720) |
  | 6 | 640, 980 to 1170, 1560 to 1920 px | 650 to 1170 px (cut up to 860) |
  | 7 | 640, 1130 to 1170, 1720 to 1920 px | 650 to 1170 px (cut up to 1000) |
  | 8 | 640 px | 650 to 1170 px (cut up to 1150) |

- **The bonus and the reserve** are always whole, inside the chip, and the bonus always sits under the numbers (before, in the worst case: past the chip's edge or cut at 650 to 1920 px with 7 and 8 players, and in line after the numbers at every width from 650 px).
- **The You tag and the runaway crosshair** are never clipped: not by the page edge, and not by the scrolling player list on a phone on its side (2, 5 and 8 players at 12 sizes from 375 to 1920 px and both side-on sizes, with two runaways marked in the 5 and 8 player games).
- **The one-row bar from 1180 px** still fits: the controls stay on one row beside the chips, inside the window, with no sideways scroll.

## Scenarios

| Scenario | Result |
|---|---|
| No visible name is ever cut, 320 to 1920 px every 10 px, 2 to 8 players, upright and on its side | Verified: sweep, game start and worst case; browser test at 7 sizes |
| Names show wherever the chip has room for the longest name and three-digit dice | Verified: sweep (threshold 128 px against a widest need of 120.4 px); browser test |
| You: the tag above the chip when names are hidden, in line and bold when they show | Verified: browser test checks the tag sits above the chip; screenshots |
| The issue's numbers reproduce on the old CSS, and come to zero | Verified: 641 to 1179 px every 6 px, 15 / 38 / 61 / 86 widths cut before, none after |
| Knockout bonus on its own line under the numbers, right-aligned, never cut or past the chip, at every width | Verified: sweep worst case (`+7/turn` on every chip); browser test with a bonus on two chips |
| Reserve never squeezes a name or runs past the chip | Verified: sweep worst case (`+64`); browser test |
| The bar is no taller without a reserve or bonus | Verified: the tallest chip is the same at all 1,141 sizes, before and after |
| The one-row bar from 1180 px fits its controls; the You tag and the crosshair aren't clipped | Verified by measurement (above); `runaway-mark.spec.ts` passes |
| Late game with a three-digit dice count | Verified: a dealt position (184 to 232 dice on one player) in the browser test and screenshots. The autoplayed games below peaked at 91 dice |
| Real games with knockouts | Verified: 11 autoplayed games (8 players at 1024×768, 1280×800, 1920×1080, 390×844 and 750×342; 4 players at 700, 1024, 1280 and 1920; 5 players at 1024 and 1440), the bar checked every 40 ms or so to the end: no cut name, nothing past a chip, no console errors |
| The browser tests fail on the old CSS | Verified: the names test fails at 2 players and 1920 px (names hidden) and 8 players at 1024 px (cut); the bonus test fails at 1920, 700, 1024 and 1280 px. On the names-only commit the bonus test still fails (bonus beside the numbers) |
| Other fonts (SF Pro Rounded on Apple devices, Segoe UI, Roboto) | Partly verified: only Inter renders here. Canvas widths of the installed fonts put the widest at 128.5 px against the 128 px threshold; with the wrap the numbers would drop a line, the name would stay whole |
| A bigger default font size | Not tested: the threshold is in rem, so it grows with the font; reasoned, not measured |
| Safari and iOS, Firefox | Not testable here: Chromium only. Container queries need Safari 16; older browsers get names hidden and You's tag |

Found in passing, unchanged by this branch: on the one-row bar with 7 or 8 players, the 64 px minimum chip is narrower than an emblem and the numbers. At 1190 to 1230 px with 8 players the numbers already run up to 3 px past the chip's edge at game start, and with three-digit dice from 1180 to 1300 px (8 players) and 1180 to 1210 px (7). The same happens on main. The chips also take two rows at 1180 to 1189 px with 8 players, as on main.

## Gates

- `npm run check`: 237 tests passed.
- `npm run e2e`: 127 passed and 11 skipped (desktop-only or phone-only tests), desktop and Pixel 7, including two new tests in `tests/e2e/player-bar.spec.ts` (about 6 s each, desktop only, since they set their own window sizes). Run against the preinstalled Chromium through a scratch config with `executablePath`, because this container's browser build (1243) is older than the one `@playwright/test` 1.65.1 expects.
- `sim`: not needed, no rule or AI change.
