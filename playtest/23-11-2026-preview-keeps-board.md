# The map keeps its shape after Yes (23-11-2026)

Fixes https://github.com/iOvergaard/hexdice/issues/30. Jacob picked the issue's option 1: keep the player bar's space while "Play on this map?" shows.

## What was wrong

The preview hid the player bar, so the slot under the board held only the shorter prompt and the board's box was taller until you said Yes. `BoardView.layout()` turns the map on its side whenever its box is taller than wide, so on an upright phone the map you said yes to could turn, or shrink, as the game began. Board box from the title (players, Start, Yes), measured in Chromium with Playwright's device profiles:

| Size | Players | Preview | Game |
|---|---|---|---|
| iPhone 13, 390×664 | 2 or 4 | 358×407, turned | 358×341, upright |
| iPhone 13 | 8 | 358×407, turned | 358×320, upright |
| Pixel 7, 412×839 | 2 or 4 | 380×582, turned | 380×516, turned |
| Pixel 7 | 8 | 380×582, turned | 380×442, turned |
| Desktop 1024×768 | 2, 4 or 8 | 992×576 | 992×523 |
| Desktop 1280×800 | 2, 4 or 8 | 1248×608 | 1248×608.7 |
| 320×568 | 2, 4 or 8 | 288×320, turned | 288×320, turned (the board's 320 px minimum) |
| On its side, 750×342 | 2, 4 or 8 | 393×326 | 393×326 (#28 already put the prompt in the bar's place) |

![Before: iPhone 13, 8 players, the map on its side in the preview](screens/23-11-2026-preview-iphone13-8p-before-preview.png)

![Before: the same map after Yes, upright and smaller](screens/23-11-2026-preview-iphone13-8p-before-game.png)

Found on the way: Space worked during the preview. If you went first, it ended your turn and the computer players played on behind the prompt (23 moves and into round 2 at Instant, with the prompt still up). If a computer player went first, it armed Skip to my turn, so their first turns would play instantly after Yes. The preview drew only the board, but the controller already treated the game as on.

## The change

- **CSS** (`src/ui/ui.css`): the bar slot is a one-cell grid. The player bar and the prompt both sit in that cell and both stay in the layout, so the slot is as tall as the taller of the two before and after Yes, and the board's box doesn't change. The one not in use carries `inert`, which the CSS also hides (`visibility: hidden`), so it can't be seen, tapped, tabbed to or read out. On an upright phone (up to 640 px wide) the prompt now has the bar's height, so it lays out as it does on a phone on its side: the question on top, No and Yes along the bottom, where End turn will be. On a phone on its side the cell's row is `minmax(0, 1fr)`, so the bar still fills the column and its chips still scroll.
- **PreviewPrompt** (`src/ui/screens.ts`): showing and hiding swap the `inert` attribute between the bar and the prompt instead of `hidden`. It sets the attribute rather than the property, so a browser without `inert` still hides the one not in use.
- **Controller** (`src/game/controller.ts`): the preview renders the whole screen, so the bar is drawn with the new game's players behind the prompt. A `previewing` flag keeps "can act" and "can skip" false until Yes: End turn is disabled, Space and Escape do nothing, and the game loop, saving and sounds still start only at Yes. No deals a new map with the same player count and draws the bar for it.

What it costs: the prompt takes the bar's height, more than it needs. With 8 players on an upright phone that's 257 px (iPhone 13, Pixel 7) or 367 px (320 wide) for about 130 px of content, so there's room to spare between the question and the answers. At 1280×800 the one-row bar was 71.3 px and the prompt 72, so the slot is 72 px in the game too and the board 0.7 px shorter there.

## After

Board box in the preview and in the game, compared in page coordinates (position, size and turn):

| Size | Players | Preview and game |
|---|---|---|
| iPhone 13 | 2 or 4 | 358×341, upright |
| iPhone 13 | 8 | 358×320, upright |
| Pixel 7 | 2 or 4 | 380×516, turned |
| Pixel 7 | 8 | 380×442, turned |
| 1024×768 | 2, 4 or 8 | 992×523 |
| 1280×800 | 2, 4 or 8 | 1248×608 |
| 320×568 | 2, 4 or 8 | 288×320, turned |
| On its side, 750×342 | 2, 4 or 8 | 393×326 |
| On its side, 568×320 | 8 | 226×304, turned |

The prompt's height, which is the bar's: 183 px with 2 to 4 players and 257 px with 8 on the iPhone 13 and Pixel 7; 263 and 367 px at 320 wide; 125 px at 1024×768; 72 px at 1280×800; 230 px at 750×342.

![After: iPhone 13, 8 players, the preview](screens/23-11-2026-preview-iphone13-8p-after-preview.png)

![After: the same map after Yes](screens/23-11-2026-preview-iphone13-8p-after-game.png)

![After: iPhone 13, 2 players, the preview](screens/23-11-2026-preview-iphone13-2p-after-preview.png)

![After: the same map after Yes](screens/23-11-2026-preview-iphone13-2p-after-game.png)

![After: Pixel 7, 8 players, the preview](screens/23-11-2026-preview-pixel7-8p-after-preview.png)

![After: the same map after Yes](screens/23-11-2026-preview-pixel7-8p-after-game.png)

![After: 1024×768, 8 players, the preview](screens/23-11-2026-preview-1024x768-8p-after-preview.png)

![After: the same map after Yes](screens/23-11-2026-preview-1024x768-8p-after-game.png)

![After: 1280×800, 8 players, the preview](screens/23-11-2026-preview-1280x800-8p-after-preview.png)

![After: on its side at 750×342, 8 players](screens/23-11-2026-preview-750x342-8p-after-preview.png)

![After: on its side at 568×320, 8 players](screens/23-11-2026-preview-568x320-8p-after-preview.png)

![Before: 320×568, 8 players](screens/23-11-2026-preview-320x568-8p-before-preview.png)

![After: 320×568, 8 players, the whole page](screens/23-11-2026-preview-320x568-8p-after-preview.png)

![After: the same map after Yes, the whole page](screens/23-11-2026-preview-320x568-8p-after-game.png)

## Scenarios

| Scenario | Result |
|---|---|
| The board keeps its box and its turn from the preview into the game: Pixel 7 and 390×664 (phone project), 1280×800 and 1024×768 (desktop), 2 and 8 players | Verified: browser test (`tests/e2e/preview.spec.ts`). It fails on the old code in all 8 cases (the box's height, and at 390×664 the turn too) and passes now |
| The same at iPhone 13, Pixel 7, 320×568, 750×342, 1024×768 and 1280×800 with 2, 4 and 8 players, and at 568×320 with 8 | Verified by measurement: all 19 identical |
| During the preview the bar is drawn for the new game, End turn disabled, out of sight | Verified: browser tests (the last player's chip is there but hidden; in the UI harness the prompt covers the bar's box exactly); by script (3 and 6 players: 3 and 6 chips, End turn disabled) |
| No deals a new map with the same player count, and the bar is drawn for it | Verified: browser test; by script (still 8 players after two Nos, at 568×320 and 320×568) |
| Yes starts the game: the prompt goes, the bar comes back, the game is saved | Verified: browser tests (`game.spec.ts` "title → preview → game" and the new tests); by script (the save is written at Yes, not before) |
| Nothing is saved, heard or played during the preview | Verified by script at Normal speed with sound on: no `hexdice:save`, an empty sound log, no moves |
| Space during the preview does nothing | Verified: browser test (deals until you go first). It fails on the old code (2 moves played) |
| Keyboard: during the preview Tab reaches only No and Yes; in the game never No or Yes | Verified: browser test on desktop |
| Screen readers | Partly verified: Chromium's accessibility tree holds only the prompt (No, Yes) during the preview and only the bar (How to play, Sound, Quit, End turn) in the game. No real screen reader here (VoiceOver, TalkBack) |
| The prompt fits and looks right at 1280×800, 1024×768, iPhone 13, Pixel 7, 320×568, 750×342 and 568×320 | Verified by hand in screenshots; by script, nothing in the prompt reaches outside it |
| Answering the prompt at 320×568 | Partly verified: the page scrolls in the preview exactly as in the game (723 px with 2 players, 827 px with 8), and Yes sits at the bottom of the bar, like End turn, below the first screen. Before, the prompt was 171 px and its buttons were on the first screen, but the question wrapped to three lines and the seed ran past the fold. The page height on short upright phones is the first item of `playtest/22-11-2026-random-games.md` and is being worked on separately; once the game fits the screen, so does the prompt |
| Phone on its side: board full height, no page scroll, controls on screen | Verified: `tests/e2e/landscape.spec.ts` at 750×342 and 568×320 |
| A browser without `inert` | Partly verified by reading: the attribute is set either way and the CSS hides by the attribute, and `visibility: hidden` alone keeps the hidden one out of the tab order and the accessibility tree. Not run in such a browser |
| Safari and iOS | Not testable here: Chromium only (the iPhone profiles ran in Chromium) |

## Gates

- `npm run check`: 237 tests passed.
- `npm run e2e`: 134 passed and 18 skipped (desktop-only or phone-only tests), desktop and Pixel 7. An earlier full run under heavy load (three browser suites at once) timed out two long autoplay tests on the link and resume paths, which never show the preview; both passed when run again. Run against the preinstalled Chromium through a scratch config with `executablePath`, because this container's browser build (1243) is older than the one `@playwright/test` 1.65.1 expects (1255).
- `sim`: not needed, no rule or AI change.
