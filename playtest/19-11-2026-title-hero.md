# Title screen with the board behind it (19-11-2026)

The 19-11-2026 art review found the title screen was the weakest first impression. It was a menu column on empty navy, while the painted map and cube dice, the game's best visuals, only showed up after Start. The title now has a dealt board behind the menu. It is always the same deal (seed 2026, six players) and is purely scenery: no taps, no test hooks, hidden from screen readers. On a phone the menu sits at the bottom on ink, and any height left over shows more board above and behind the name. On a wide screen the board fills the right and fades out under the menu on the left.

Jacob picked this layout from three directions shown at 1280×800 and 375×812:

- A: menu on the left, the board in a rounded frame on the right; a strip of map under the name on a phone.
- B: this one.
- C: the board tilted like a table top, with the name standing on its near edge.

![Desktop 1280×800](screens/title-hero-desktop.png)
![Phone 375×812](screens/title-hero-phone.png)
![Phone with a game to continue](screens/title-hero-continue-phone.png)
![1920×1080](screens/title-hero-wide.png)
![iPad portrait 1024×1366](screens/title-hero-ipad-portrait.png)

## How it works

- `showTitle` takes a function that makes the scene. The controller creates the game once per visit and keeps it. `BoardView` has a new `scenery` mode: no tap handler, no `data-territory`, `data-token-for` or `data-testid`, and `aria-hidden` instead of the "Game board" label.
- The board is built two animation frames after the title goes into the page. A single frame isn't enough, because a frame's callback runs before that frame paints. Measured in headless Chromium, three loads each at 1280×800 and 375×812: the menu first paints at 80–120 ms and the board appears at 130–170 ms. Building the board took 16–40 ms across every run in this session, and 8.5–9.4 ms on returning to the title, when the game is already made.
- The board's frame stays wider than tall, so `BoardView` never turns the map on its side. Portrait windows use the phone layout, even 900 px or wider.
- On phones the player chips fit three to a row instead of two (padding 12 px up to 480 px wide), which keeps Start on the first screen at 375×812.

## Scenarios

| Scenario | Result |
|---|---|
| Board behind the menu at 1280×800, fading out under the menu | Verified: browser test and screenshot |
| Phone 375×812: Start on the first screen, How to play, What's new and sound on one row, no sideways scroll | Verified: browser test `title.spec.ts`, desktop and phone projects |
| Other sizes: 412×915 (Pixel 7), 375×667, 768×1024, 1024×1366, 1920×1080, 1366×640, 812×375 | Verified: screenshots; How to play, What's new and sound stay on one row at every size |
| 375×667 | Verified: fits without scrolling; the board only shows behind the name |
| 320×568 | Partly verified: works, but the page scrolls by 122 px and Start sits below the first screen (two chips a row at that width). Not compared against the old title at this size |
| 1366×640 and 812×375 | Partly verified: works, and the page scrolls by 35 px and 246 px |
| The scene can't be mistaken for the game board: no `board` test id, no `data-territory`, `aria-hidden`, `pointer-events: none` | Verified: browser test; with `scenery` off it fails on the `board` test id |
| A tap on the board does nothing; Start still leads to the board preview | Verified: browser test |
| Keyboard: the first Tab lands on "2 players" and nothing in the scene can take focus | Verified: scripted check |
| Back to the title after Quit and after a game ends: the board is back and the game screen is gone | Verified: scripted check |
| Continue game on the title | Verified: screenshot, phone |
| Reduced motion | Verified: nothing on the title animates (`document.getAnimations()` is 0), so there's nothing to turn off |
| Background tab | Partly verified: in the hidden browser pane no frames run, so the board isn't built; I didn't see it appear when the tab came to the front |
| How to play, What's new and the sound toggle on the new layout | Verified: the existing browser tests (`help`, `whats-new`, `sound`) pass |
| Screen readers | Partly verified: the scene is `aria-hidden` and has no role or label; not tried with VoiceOver |
| Real phones (iOS Safari) | Not testable here: emulated Chromium only. The CSS uses `dvh`, `inset`, `min()`, `isolation` and `min-aspect-ratio`, all supported from Safari 15.4 |

Gates: `check` 175 passed, `e2e` 86 passed (4 skipped).
