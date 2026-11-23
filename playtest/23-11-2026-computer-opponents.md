# Title screen: "Computer opponents" instead of "Players, including you" (23-11-2026)

A first-time player said "Nice, but I cannot select singleplayer mode". They read the "2 players" … "8 players" chips as the number of people at the screen (hot seat), not as you plus computer players.

## Change

- The title's first choice is now **Computer opponents**, chips **1** … **7**. Internally it is still the total player count (opponents + 1), so the URL param `players`, saves and the remembered title choice are unchanged.
- Test ids move from `players-<total>` to `opponents-<count>`.
- Chips get `min-width: 44px` so a single digit is still a full tap target, and the title's chip gap is 5 px on a phone so all seven fit one row at 375 px.

## Hands-on

| Scenario | Result |
|---|---|
| Desktop: heading and seven chips in one row, 7 selected by default (last choice remembered) | Verified, `screens/23-11-2026-opponents-desktop.jpg` |
| Phone 375 px: seven chips in one row, no horizontal scroll | Verified, `screens/23-11-2026-opponents-phone.jpg` (row 343 px, chips 44 px) |
| Pick 1, Start, accept the map: a two-player game, you and one computer | Verified (`__hexdice.state().players` = human, ai) |
| Remembered choice from before the change (stored as the total) shows as total − 1 | Verified by reasoning only: storage format unchanged, the chip maps `n - 1` |
| README title screenshot (`docs/screenshots/title.jpg`) | Not updated: still shows the old chips; needs `npm run screenshots` |

## Gates

- `npm run check`: 237 unit tests pass.
- `npm run e2e`: 125 passed, 9 skipped (desktop + phone); the title test reran after the phone gap change and passes on both.
