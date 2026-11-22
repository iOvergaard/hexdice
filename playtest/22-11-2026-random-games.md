# Random games and clicking around (22-11-2026)

Jacob asked for some random games and clicking around, to see what could be better. A Playwright bot played seven games as the human by tapping territories, at desktop sizes (1024 to 1920 wide) and on phone profiles (iPhone 13, iPhone SE, Pixel 7, Galaxy S9+, upright and on their side). It also clicked through the title, How to play, What's new, the map preview, Quit and Continue, Escape and Space, Skip to my turn, autoplay, Replay and Copy game. No console errors or page errors came up in any of it.

| Game | Seed, players, size | Result |
|---|---|---|
| 1 | 101, 8, desktop 1280×800 | Out in round 13, 3rd of 8 |
| 2 | 202, 8, iPhone 13 | Out in round 4, 7th of 8 |
| 3 | 303, 2, iPhone 13 | Won in round 6 |
| 4 | 404, 4, desktop | Out in round 4 |
| 5 | 505, 3, desktop, normal speed | Stopped by the bot in round 3 (see "Not a bug") |
| 6, 7 | 777 and others, 3 to 6, desktop and phone on its side | Autoplayed to the end, Replay offered |

Two bugs are fixed on this branch. Three smaller things are written up below for Jacob to decide on.

## Fixed: a phone on its side couldn't play

A phone held sideways is at least 720 px wide but only 320 to 430 px tall, so it got the desktop layout: roll strip, board and player bar stacked in one screen height. The board got what was left.

| Phone on its side (Playwright profile) | Viewport | Board height before, 2 / 8 players | After |
|---|---|---|---|
| iPhone 13 (Safari with its bars) | 750×342 | 97 / **25 px** | 326 px, 408 wide |
| Pixel 7 | 863×360 | 115 / 115 px | 344 px |
| iPhone 15 Pro Max | 814×380 | 135 / 63 px | 364 px |
| iPhone SE, Galaxy S9+ (under 720 wide) | 568×320, 658×320 | 320 px, but the page scrolled to 665 and 685 px | 304 px, no scroll |

![Before: the board is a 25 px strip](screens/22-11-2026-landscape-before.png)

**The change** (CSS only, `src/ui/ui.css`): on any landscape screen 520 px tall or less, the board takes the whole height on the left, and the roll strip, player chips and controls share a column on the right, `clamp(300px, 42vw, 380px)` wide. The column uses the phone styles (the stacked roll strip, four chips a row, no "Speed" label), with a few landscape tweaks:

- The roll strip gives up its padding, and the cost and result labels drop to 0.75rem, so "7 moved in" and a two-digit total fit one line. "Tie · captured" wraps onto two lines. At 300 px the first version cut "3 moved in" to "3 mov…".
- The chips scroll if they must; the controls and End turn always show. With 8 players they fit without scrolling from 342 px tall; at 320 px the second row's last line needs a short scroll.
- Round, speed, ?, sound and Quit fill one row; the speed menu gives way first.
- Padding keeps clear of a notch (`env(safe-area-inset-*)`).
- The ending takes the whole screen, as on an upright phone.
- The wide-screen roll strip and player bar rules now need 521 px of height. Any screen 720 px wide and 520 px tall or less is landscape, so upright screens and taller windows are unchanged.

A side effect: the preview prompt takes the bar's place in the column, so the board keeps its size when you say Yes to a map. On an upright phone it doesn't (see below).

![After: iPhone 13 on its side, 8 players](screens/22-11-2026-landscape-after.png)

![After: 568×320, the map turned to fill its box](screens/22-11-2026-landscape-after-568.png)

## Fixed: a seam where the painted sea stopped

The painted sea (depth bands, surf, waves) was clipped to the map's frame, the grid's rectangle. The view zooms to the continent and then grows to the box's shape, so wherever it reached past the frame, a hard straight line split the painted sea from the board's flat blue background. That happened at the sides on a wide desktop, above and below the map on a phone, and along the top of the title board. It was worst where the coast came near the grid's edge: a shallow light band cut off sharp.

![Before: the line at the right, 1920×1080](screens/22-11-2026-seam-before-1920.png)

![Before: lines above and below the map, 2 players on an iPhone 13](screens/22-11-2026-seam-before-phone.png)

**The change** (`src/ui/terrain.ts`, `src/ui/board-view.ts`): the depth bands already ran 7 cells past the grid; only the clip cut them off. The sea layer is no longer clipped, its deep base covers that margin, and waves are scattered there as densely as inside. Those waves come from their own random stream, so every existing map keeps its own waves and meadow tints. The board's crop may also reach past the frame now, so a coast near the grid's edge keeps its strip of sea. Map generation is untouched, so seeds and saves are unaffected.

![After, 1920×1080](screens/22-11-2026-seam-after-1920.png)

![After, iPhone 13](screens/22-11-2026-seam-after-phone.png)

## For Jacob: three smaller things, not changed

1. **On an upright iPhone, End turn starts half off the screen.** In Safari with its bars an iPhone 13 shows 390×664 (Playwright's profile). With 8 players the game is 717 px tall, so End turn's bottom 39 of 52 px sit below the screen and the page scrolls by 53 px. When a game starts you see only a sliver of it. The e2e phone, a Pixel 7 at 412×839, has room, which is why no test caught it. At 320 px wide the chips take three rows and End turn sits 245 px down. Options: compact chips on short upright phones (emblem and income only, one row of 8 at about 44 px each), or End turn on the controls row with the round number moved into the roll strip's idle message. Both are design calls. ![iPhone 13 upright: End turn is a white sliver at the bottom](screens/22-11-2026-iphone-end-turn-fold.png)
2. **On an upright phone the map can turn when you say Yes.** The preview hides the player bar, so the board's box is taller. On an iPhone 13 with 4 players it's taller than wide, so the map is turned on its side. After Yes the bar comes back, the box is wider than tall, and the map turns back, smaller. The map you said yes to changes shape under your thumb. Showing the preview prompt over the bar's space with the same height would keep it still.
3. **Chip names are cut to a letter or two from 641 to 1179 px wide** ("D…", "Br…", "At…" at 1024; "Y", "D" in the old landscape layout). Upright phones and screens from 1180 px show only You's name. Hiding the other names in that range too, or showing them only when they fit (a container query on the chip), would be tidier. ![Names cut at 1024 px](screens/22-11-2026-chip-names-1024.png)

There's also no `env(safe-area-inset-*)` padding on the upright layout or the title. The manifest asks for `standalone` and the page uses `viewport-fit=cover`, so on an iPhone home-screen install the home indicator probably overlaps End turn's bottom edge. Not testable here: Playwright doesn't emulate the insets.

## Not a bug

- **The stuck game (game 5).** The bot tapped about 2,000 times in round 3 with no attack. It taps the centre of a territory's bounding box, and territory 8's box spans a river, so the tap landed on water and deselected. A tap on the land attacks as it should (checked with a raw mouse click 0.8 px away, and with the token).
- **The Normal AI held up.** In 1,000 headless games per player count (seeds 300000 to 300999), the bot's strategy (attack only from a bigger stack, or from a full 8) played one seat against Normal AIs:

  | Players | That bot wins | Normal in the same seat wins | Fair share |
  |---|---|---|---|
  | 2 | 31.8% | 50.1% | 50% |
  | 3 | 20.2% | 34.6% | 33.3% |
  | 4 | 14.8% | 26.5% | 25% |
  | 8 | 10.5% | 13.4% | 12.5% |

  My 2-player win in game 3 was luck.
- **A frame that looked dimmed.** One screenshot caught the 150 ms opacity fade after a roll.

## Scenarios

| Scenario | Result |
|---|---|
| iPhone 13 on its side, 8 players: board 408×326, no page scroll, End turn and every control on screen | Verified: browser test (`tests/e2e/landscape.spec.ts`, phone project at 750×342); by hand in screenshots. The test fails on the old CSS (board 25 px) |
| 568×320 on its side, 8 players: no page scroll, End turn on screen, map turned to fill its box | Verified: browser test at 568×320; screenshot |
| Pixel 7, iPhone 15 Pro Max, Galaxy S9+ on their side, 2 and 8 players | Verified by measurement: board 304 to 364 px tall, no page scroll, controls inside the column |
| Tap to attack on a phone on its side; the roll strip's words stay whole | Verified: browser test (taps the tokens); by hand at slow speed (rolling, settled, the reinforcement pile) |
| "7 moved in" with a two-digit total, and "Tie · captured", fit at 750 and 568 wide | Verified: the UI harness with 8×8, 8×1 and 4×3 rolls; three autoplayed 8-player games with a watcher on every roll (one "Tie · captured" cut "3 moved in" before the wrap, none after) |
| Map preview, then Yes, on a phone on its side: the board keeps its size | Verified by hand in screenshots |
| Ending on a phone on its side: full screen, buttons on screen, the card scrolls | Verified by hand (autoplayed 6-player game) |
| Title on a phone on its side | Partly verified: unchanged; it scrolls as before |
| Upright phones and desktop unchanged | Verified: full e2e suite on desktop (1280×800) and Pixel 7 |
| No sea seam at 1920×1080, 1280×800, iPhone 13 and Pixel 7, and on the title | Verified by hand in screenshots (seeds 101 and 303) |
| Existing maps keep their waves and meadow tints | Verified by reading: the in-grid waves and tints use the same random stream as before; the outside waves use a new one |
| A notch on a phone on its side | Not testable: Playwright doesn't emulate safe-area insets |
| Safari and iOS | Not testable here: Chromium only |

## Gates

- `npm run check`: 237 tests passed.
- `npm run e2e`: 125 passed and 9 skipped (desktop-only or phone-only tests), desktop and Pixel 7. Run against the preinstalled Chromium through a scratch config with `executablePath`, because this container's browser build (1243) is older than the one `@playwright/test` 1.65.1 expects (1255).
- `sim`: not needed, no rule or AI change.
