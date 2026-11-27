# Online play: rooms for people and agents (27-11-2026)

A prototype, waiting on Jacob's call (`docs/plan.md` had online play as a non-goal). People and AI agents play in rooms on a host anyone can run (`npm run host`, Node with `ws`). The host runs the engine and keeps the seed and dice state secret until the game ends, then reveals both so the game can be replayed and checked. Browsers and agents use the same JSON protocol over one WebSocket (`docs/online.md`). Play online stays hidden on the live site until `public/hosts.json` lists a host.

## What's in it

- **Room core** (`src/net/room.ts`, pure): seats, owner, start, computer fill, turn deadlines, take-over by Hard after 3 missed turns or on leaving, rejoin by token, away after a minute, watchers, series of N games with a scoreboard, rematch.
- **Host** (`scripts/host.ts`): rooms over WebSocket, 200 rooms at most, 10 new rooms per address per minute, idle rooms dropped after 10 minutes, 16 KB message cap, malformed messages answered with an error.
- **Browser**: Play online (create, join by code or link, list, watch), lobby with link and seats, the game driven by the host's results, Leave, Rematch, Replay and Copy game after the reveal.
- **Agents**: `npm run agent` (built-in AI over the protocol), `npm run seat` (one command per move, for LLM agents), `npm run arena` (series between agents, CI gate).

## Numbers

| Run | Result |
|---|---|
| `npm run arena -- --games 300` (4 agents: hard, normal, easy, easy; 4 rooms) | 300 games in 13.0 s, 23 games/s. 0 desyncs, 0 refused moves |
| Same, 1 room | 300 games in 25.5 s, 11.8 games/s |
| Before: every agent replayed every game to check it | 50 games in 5.5 s (map generation five times a game) |
| Moves per game, Hard players, engine only | 2 players p50 90 / p90 174; 8 players p50 308 / p90 510; 14 ms a game |

Win shares in the 300-game arena: Hard about 55%, Normal 20%, the two Easys 10 to 14% each.

## Scenarios

| Scenario | Result | How |
|---|---|---|
| Two people: create, join by link, start, take turns | Verified | e2e `two people play one game…`, desktop and phone. Both boards match after every move; only the mover's End turn is enabled; the other reads "Waiting for Ann". ![setup](screens/online-phone-setup.png) ![lobby](screens/online-phone-lobby.png) ![your turn](screens/online-desktop-your-turn.png) |
| Attack by tapping, result on both boards | Verified | Same test, and a scratch driver playing 6 turns with an attack each |
| Leave mid-game: Hard takes the seat, the game goes on | Verified | Same test; unit test `frees a lobby seat on leave…` |
| Watch a room from the list | Verified | e2e `anyone can watch a room…`: read-only board, no You chip, "Ann's turn", follows every move. ![watching](screens/online-desktop-watching.png) |
| Computer players fill empty seats | Verified | Unit test and the watch e2e (3 seats, Easy fill) |
| Seed and dice state never sent before the end, revealed after; the replay gives the host's board | Verified | Unit test `never sends the seed…` scans every message; the arena replays all 300 games |
| Stale or illegal move refused, the mover asked again | Verified | Unit test `plays only the mover…` |
| Turn time runs out; three in a row hands the seat to Hard | Verified | Unit test with a fake clock. Not tried by hand with a real 30 s clock |
| Series with scores; dropped player takes the seat back | Verified | Unit test (3 games), arena (300) |
| Whole turn in one message (`turn`) | Verified | Unit test; seat CLI by hand (`turn 19:14,26:15`) |
| LLM agent via `npm run seat` | Verified | By hand: create, an Easy agent joins, start, attack, batched turn, positions printed |
| Rematch | Partly verified | Room unit test covers start after finished; the button not driven in e2e |
| Reconnect after a dropped connection in the browser | Partly verified | Rejoin by token is unit tested; the browser's retry loop wasn't tested with a real network drop |
| Phone on its side, online screens | Not tested | The game screen is the usual one; the online screens are a single column and were checked at 375 px only |
| Public host over `wss://` with a tunnel | Not testable here | Needs a public address |

## Known limits

- The dice generator is mulberry32 with one 32-bit state. A client that saw enough rolls could brute-force it. Fine among friends; the upgrade is marked `ponytail:` in `src/net/room.ts`.
- Rooms live in one host's memory: restarting the host ends every game.
- The browser has no skip button online; Speed (Instant) does the same.

## Gates

- `npm run check`: 272 passed.
- `npm run sim -- --games 500`: passes (rules unchanged).
- `npm run arena -- --games 300`: passes, numbers above.
- `npm run e2e`: 164 passed, 26 skipped (desktop and phone), 4 of them the new online tests.
