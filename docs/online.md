# Online play

People and AI agents play Hexdice on a **host**: a small Node process that runs the same engine as the browser game and decides every roll. Browsers and agents connect to it over one WebSocket and send JSON messages. GitHub Pages only serves the game; `public/hosts.json` lists public hosts (empty until someone runs one), and **Play online** on the title screen shows only when that list has a host or the link carries `?host=`.

## Run a host

```bash
npm run host                      # ws://localhost:8787
npm run host -- --port 9000
```

- Rooms live in memory and close after 10 minutes with nobody connected. At most 200 open rooms, and 10 new rooms per address per minute.
- Nothing is stored. A player is a nickname; the host sees their IP address while they're connected.
- A browser on the HTTPS site can only reach a host over `wss://`, which needs TLS. Locally `ws://localhost` works. To let someone else in, put the host behind a tunnel, for example `cloudflared tunnel --url http://localhost:8787`, and use the `wss://…trycloudflare.com` address it prints.

## Play in the browser

Open the game with `?host=<address>` (or pick a host from `hosts.json`), then **Play online**:

- **New room**: seats (2 to 8), computer players for the seats nobody takes, time per turn. You get a room code and a link; **Start** when everyone is in.
- **Join a room**: type the code, or open the link someone sent (`?host=…&room=…`).
- **Rooms on this host**: join one that's waiting, or **Watch** any of them.

In the game your chip says You, the roll strip says whom you're waiting for (and if they've been away a minute), and Quit becomes **Leave**: the host's Hard player takes your seat. At the end the room's owner gets **Rematch**, and everyone gets Replay and Copy game, since the host reveals the seed.

## Rules the host enforces

- Only the seat whose turn it is may act, and only legal moves are played.
- **Turn time** is per turn, not per move. Run out and the host ends your turn; run out 3 times in a row and the host's Hard player takes your seat. 0 means no limit.
- A dropped connection keeps your seat: join again with your token. After a minute away, the others see you as away.
- The seed and the dice generator's state never leave the host while a game is on. `gameOver` reveals the seed and every action, so anyone can replay the game and check the dice.
- Known limit: the dice generator has one 32-bit state. A client that collects enough rolls could brute-force it and foresee the next ones. Fine among friends; for stakes, reseed per turn from the host's crypto source (marked `ponytail:` in `src/net/room.ts`).

## Agents

An agent is any program that speaks the protocol below. Three come with the repo:

| Command | What it is |
|---|---|
| `npm run agent -- --host URL --room CODE --name Atlas --level hard` | Reference agent: the built-in AI (`easy`, `normal`, `hard`) playing through the protocol only. Read `scripts/agent.ts` to write your own. |
| `npm run agent -- --host URL --create --seats 4 --games 100 --name Atlas` | Same, but makes a room for a series of games, prints the code and starts when every seat is taken. |
| `npm run seat -- …` | A seat you drive one command at a time, with the position printed as text. Made for LLM agents such as Claude Code (see below). |
| `npm run arena -- --games 300 --levels hard,normal,easy,easy --rooms 4` | Agents against each other on a host in the same process, 4 rooms side by side. About 20 games a second. Fails on a stall, a refused move or a desync. CI runs it. |

Agents sitting next to the host play an eight-player game in well under a second. Over the internet each move costs one round trip, and a game is about 100 to 500 moves; send whole turns with `turn` to cut that.

### An LLM agent with `npm run seat`

```bash
npm run seat -- join ABCDE --host ws://localhost:8787 --name Claude   # takes a seat, keeps the token in a file
npm run seat -- wait          # until it's your turn; prints the board, the legal attacks and their odds
npm run seat -- attack 3 7    # one attack, then the board again
npm run seat -- turn 3:7,5:9  # several attacks, then end the turn and wait
npm run seat -- end           # end the turn and wait for the next one
npm run seat -- show | start | leave
npm run seat -- create --host URL --name Claude --seats 2 --turn 0
```

Each command connects, takes the seat back with its token (`--file`, default `hexdice-seat.json` in the temp folder), does one thing and disconnects. `wait` gives up after 9 minutes (`--timeout` in seconds) with exit code 2: run it again. Give the room no turn limit, or a long one, when an LLM is playing.

### Agent against agent, across two machines

1. One of you runs a host and makes it reachable (`npm run host`, plus a tunnel as above), and shares the `wss://` address.
2. One of you makes a series room: `npm run agent -- --host wss://… --create --seats 2 --games 50 --name Mikulas-bot --level hard` (it prints the code and starts once the room is full).
3. The other joins with their own agent: `npm run agent -- --host wss://… --room CODE --name Jacob-bot --level normal`, or their own program.
4. Anyone can **Watch** the room from the browser with `?host=wss://…`. Each agent prints the score at the end.

## Protocol

JSON text frames, one message each. Every message has `t`. Types are in `src/net/protocol.ts`; that file is the contract.

Client to host:

| `t` | Fields | Meaning |
|---|---|---|
| `rooms` | | List the rooms |
| `create` | `name`, `options: { seats, fill, turnSeconds, games }` | Make a room and take its first seat. `fill`: `easy`, `normal`, `hard` or null. `games` > 1 plays a series |
| `join` | `room`, `name`, `token?` | Take a free seat, or with `token` take yours back |
| `watch` | `room` | Follow a room without a seat |
| `start` | | The room's owner starts it (again, once it's finished) |
| `act` | `action`, `i?` | `{type:'attack', from, to}` or `{type:'endTurn'}`. Send the `i` from your latest `yourTurn` so a stale move is refused |
| `turn` | `attacks: [[from, to], …]` | Each attack still legal is played in order, then the turn ends |
| `leave` | | Leave the room |

Host to client:

| `t` | Fields | Meaning |
|---|---|---|
| `rooms` | `rooms` | Answer to `rooms` |
| `joined` | `room`, `token`, `seat` | Your seat. Keep the token |
| `room` | `room` | The room changed: seats, owner, status, scores |
| `started` | `game`, `state`, `you`, `i` | A game began, or you joined one in progress. `state` is a full `GameState` with `config.seed` and `rngState` set to 0. `you` is your player id in turn order (null when watching) |
| `result` | `i`, `action`, `events`, `state` | Action `i` and what it caused. `state` is a snapshot: territory owners and dice, players, current, round, winner and the shaken lists. Apply it to the `started` state (`withSnapshot`) |
| `yourTurn` | `i`, `legal`, `deadline` | Your move. `legal` lists every legal attack with its chance to capture. `deadline` is a Unix time in ms, or null |
| `gameOver` | `game`, `winner`, `config`, `actions`, `room` | The seed and the moves. In a series the next game starts right after |
| `error` | `message` | A refused message. A refused move gets a fresh `yourTurn` |

A minimal agent: on `started` keep `state` and `you`; on `result` apply the snapshot; on `yourTurn` send `act` with an attack from `legal` or `endTurn`, and the `i` you were given.
