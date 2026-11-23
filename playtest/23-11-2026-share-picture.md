# Share picture on the end card (23-11-2026)

## Why

Jacob asked for a way to share a result from the game-over card, like a screenshot.

## What changed

- The end card has a new quiet button next to Copy game. It draws the card onto a canvas as a 1080 px wide PNG: the header in the lead player's colour with their emblem, the title and the line under it, the territories chart with the knockout marks, the caption, the scoreboard, and a footer with hexdice.snebold.dk, the seed and the date (`src/ui/share-picture.ts`).
- How the picture gets out depends on the browser:
  - **Share picture**: a touch screen that can share files opens the share sheet. Closing the sheet says nothing; any other failure saves the file instead.
  - **Copy picture**: elsewhere, if the clipboard takes images. Status: "Picture copied. Paste it into a message or post." A failed write saves the file instead.
  - **Save picture**: with neither, it downloads `hexdice-DD-MM-YYYY.png`. Status: "Picture saved to your downloads."
- The picture is drawn when the card opens, not on the press, so the share sheet opens while the press still counts as a user gesture (iOS is strict about that).
- `ending.ts` now builds the chart and scoreboard from plain data (`chartShapes`, `scoreRows`), which both the card and the picture draw, so they can't drift apart.
- A phone on its side: the card is up to 600 px wide and the quiet buttons are compact, so all four buttons stay on one row instead of covering half the screen.
- The picture needs no action log, so it is there after a debug load too, where Copy game isn't.

## Checks

| Scenario | Result |
|---|---|
| `npm run check` (new unit tests: `wrapText`, `pictureDate`, `scoreRows`, `chartShapes`) | Verified: 22 files, 247 tests pass |
| `npm run e2e`, desktop and phone (new `share-picture.spec.ts`: copy, share, cancelled share, failed share, download) | Verified: 131 passed and 9 skipped as usual; 2 desktop tests (Copy game without a clipboard, the ending leads with the winner) timed out waiting for autoplay while other browsers ran on the machine, and passed when re-run alone, along with the rest of `copy-game`, `game-over` and `share-picture` |
| Picture of a 4-player loss (seed 42): header, chart, caption, scoreboard, footer | Verified by eye: `screens/share-picture-desk.png` |
| Picture of "You were eliminated" with 8 players (seed 8): eight rows, caption wraps | Verified by eye: `screens/share-picture-out.png` |
| Buttons on a 375 px phone, and on its side at 750×342 and 568×320 | Verified: two rows upright, one row on its side |
| The real share sheet on iOS Safari and Android Chrome | Not testable here: headless Chromium has no share sheet, so the spec stubs `navigator.share`. Worth a tap on a real phone after deploy |
| Pasting the copied picture into a chat app | Not testable here; the clipboard holds an `image/png` of the right size |
