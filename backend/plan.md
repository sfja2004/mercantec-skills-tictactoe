# Plan: Multiplayer WebSocket backend for Infinity TicTacToe

> Note: plan mode restricts edits to this file. On execution we'll mirror this into `backend/plan.md` and start implementing.

## Context

Frontend (`frontend/src/`) already has a single-player infinite-canvas TicTacToe (`game.ts`, `board.ts`, `renderer.ts`) with menu hooks for "Create lobby" / "Connect to lobby" that currently throw `not implemented`. We need a backend so N players (host-configurable cap) can share a lobby + game state in real time over WebSocket. MVP: lobbies, configurable game rules, turn-based placement on the shared infinite grid, win/draw detection, a typed client wrapper so the frontend doesn't touch raw sockets.

## Runtime + libs

- **Bun** with `Bun.serve({ websocket })`. Native TS, no build step, built-in pub/sub maps to "lobby = topic".
- No framework needed for MVP. A single WS endpoint + a `/health` HTTP route is enough.
- Shared types in `backend/src/protocol.ts`, also imported by frontend (relative path import or a small workspace setup - decide at impl time; simplest = relative import from `../../backend/src/protocol.ts`).

## Transport model: WS only, no REST

Everything goes over a single WebSocket. A REST API is not needed because:
- The only "stateless" lookup would be "does lobby code X exist" - we get the answer for free as a failed `lobby:join`.
- One transport = one auth / reconnect story.

We add `/health` (HTTP GET) only for liveness checks.

### Why not raw events: the client API problem

Raw WS = the frontend writes `socket.send(JSON.stringify(...))` and parses every message. That's miserable. We wrap it in a typed client (`frontend/src/net/client.ts`) with two patterns:

1. **Request/response** via a correlation id (`msgId`). The client returns a `Promise` that resolves when the server replies with the same `msgId`.
   ```ts
   await client.createLobby({ name: "kgni", maxPlayers: 4, winLength: 5, timer: { seconds: 300, incrementBelow: 20, incrementBy: 2 } });
   await client.placeTile({ x: 3, y: -7 });
   ```
2. **Event subscriptions** for unsolicited broadcasts (`game:placed`, `lobby:player_joined`, ...).
   ```ts
   client.on("game:placed", ({ x, y, symbol }) => board.set(x, y, symbol));
   ```

This gives the frontend a REST-feeling API for actions while keeping push semantics for game events.

## Decisions (from user answers)

| Topic | Decision |
| --- | --- |
| Win rule | Host-set `winLength` (min 3, default 5). Stored on lobby. |
| Draw timer | Host-set `seconds`. Optional chess-style increment: `incrementBelow` (sec threshold) + `incrementBy` (sec added per move). Off by default. |
| Max players | Host-set on lobby create. Hard cap (e.g. 16) to keep server sane. |
| Spectators | **TODO** - not in MVP, but scaffold lobby role field (`"player" \| "spectator"`) so we don't refactor later. |
| Chat / emotes | **TODO** - reserve `chat:*` message types in protocol, no handler yet. |
| Symbol assignment | **TODO** - MVP picks from fixed palette `["X","O","△","□","◇","☆", ...]` server-side. |
| Persistence | In-memory `Map<code, Lobby>`. **TODO**: pick a datastore later (recommendation in "Open" section below). |

## Wire protocol (envelope w/ msgId)

```ts
type ClientMsg = { type: string; msgId?: string; [k: string]: unknown };
type ServerMsg = { type: string; msgId?: string; [k: string]: unknown }; // msgId echoed for replies
```

Server replies to a client request reuse the client's `msgId`. Broadcasts have no `msgId`.

### Client -> server

| type | payload |
| --- | --- |
| `lobby:create` | `{ name, maxPlayers, winLength, timer: { seconds, incrementBelow?, incrementBy? } }` |
| `lobby:join` | `{ code, name }` |
| `lobby:leave` | `{}` |
| `lobby:start` | `{}` (host only) |
| `game:place` | `{ x, y }` |
| `ping` | `{}` |

### Server -> client

| type | payload |
| --- | --- |
| `lobby:joined` | `{ code, you, players, hostId, config }` |
| `lobby:player_joined` | `{ player }` |
| `lobby:player_left` | `{ playerId, newHostId? }` |
| `game:started` | `{ turnOrder, currentTurn, deadline, board }` |
| `game:placed` | `{ x, y, symbol, by, nextTurn, deadline }` (deadline updated if increment fires) |
| `game:turn` | `{ currentTurn, deadline }` |
| `game:ended` | `{ outcome: "win"\|"draw", winner?, line? }` |
| `error` | `{ code, message }` |
| `pong` | `{}` |

`deadline` = epoch ms; clients display `max(0, deadline - now())`. Server is timer authority.

## Server architecture

```
backend/
  package.json
  tsconfig.json
  src/
    index.ts        # Bun.serve, WS open/message/close, route by type
    protocol.ts     # Shared message + entity types
    lobby.ts        # Lobby class: players, config, host promotion, broadcast
    game.ts         # Board (Map<"x,y", Tile>), turn cursor, timer, win detection
    win.ts          # winLength-in-a-row scan around last move (8 directions)
    rng.ts          # 4-char base32 lobby code, collision retry
    registry.ts     # Map<code, Lobby> + cleanup of empty lobbies
```

### Game loop / timer

No tight tick loop. On `game:started` and on each `game:placed`:
- Compute `deadline = now + timer.seconds*1000` (or current `deadline + incrementBy*1000` if chess-style and below threshold).
- `setTimeout(onDeadline, deadline - now)`; clear on each move.
- `onDeadline` -> emit `game:ended` w/ `outcome:"draw"`.

### Win detection

After each placement, scan only the 4 axes through `(x,y)` and look for a run of length `>= winLength` of the same `symbol`. O(winLength) work per move. Returns the winning `line` for highlighting.

### Connection lifecycle

1. Client opens WS -> server assigns `playerId` (uuid) + `sessionToken`, sends `hello { you, token }`.
2. Client sends `lobby:create` or `lobby:join`. Until then the socket has no lobby.
3. On reconnect within N seconds w/ the same `sessionToken`, re-attach to the previous slot (preserves turn order). **MVP: parse token but treat reconnects as fresh joins; finish reconnect in a follow-up.**
4. On close, mark player as gone, broadcast `lobby:player_left`, promote new host if needed, end game if only one player remains.

## Frontend integration

- New folder `frontend/src/net/` with `client.ts` (typed wrapper) and `types.ts` (re-export of protocol).
- Wire `Menu` buttons in `frontend/src/game.ts:78` (Create lobby / Connect to lobby) to client calls.
- `Game.startMultiplayer(client)` mode where `onMouseUp` sends `game:place` instead of mutating the local board; board mutates only on `game:placed` event from server (server-authoritative).

## Anything missing?

Things to call out that weren't in the user's list:

- **Server-authoritative board.** Client must not place locally on click - only render what the server broadcasts. Otherwise we get desync + cheating.
- **Coord bounds.** Even though the canvas is "infinite", clamp `x,y` to int32 range to prevent abuse.
- **Rate limit** on `game:place` (e.g. max 5/sec/socket) to stop flooding.
- **Origin check / CORS** on the WS upgrade so random sites can't connect.
- **Message size cap** on the WS server (Bun default is fine, just confirm).
- **Heartbeat**: client `ping` every 20s, server drops sockets w/ no activity for 60s.
- **Error code enum** (`NOT_YOUR_TURN`, `TILE_OCCUPIED`, `LOBBY_FULL`, `LOBBY_NOT_FOUND`, `INVALID_CONFIG`, ...).
- **Config validation** on `lobby:create`: `winLength >= 3`, `maxPlayers in [2, 16]`, `timer.seconds >= 10`, etc.
- **Lobby cleanup**: drop empty lobbies after a grace period (e.g. 60s) so codes get reused.

## TODO list (not in MVP, but reserved in code)

- Spectator role (lobby player has `role` field already).
- `chat:send` / `chat:message` message types reserved in protocol, no handler.
- Player-picked symbols.
- Reconnect via session token (token already issued in MVP, just not honored).
- Datastore: **recommendation = SQLite via `bun:sqlite`** for active-lobby snapshotting (zero infra, single file, survives restart). Redis is overkill for a class project; Postgres is for if/when we have user accounts + match history.

## Critical files

- New: `backend/src/{index,protocol,lobby,game,win,rng,registry}.ts`, `backend/package.json`, `backend/tsconfig.json`.
- New: `frontend/src/net/client.ts`.
- Modify: `frontend/src/game.ts` (wire lobby buttons, add multiplayer mode that defers to server).
- Modify: `frontend/src/board.ts` (expose `setTile(x,y,symbol)` so server events drive it; remove random symbol logic in multiplayer mode).

## Verification

1. `cd backend && bun run src/index.ts` - server listens on `:8080`. `curl localhost:8080/health` -> 200.
2. Two browser tabs of the frontend -> tab A creates lobby (winLength 3, timer 60s, max 4), gets a 4-char code, tab B joins with it. Both see each other in `lobby:joined` / `lobby:player_joined`.
3. Host clicks Start -> both tabs receive `game:started` with same `turnOrder` + `deadline`.
4. Current player clicks a tile -> both tabs render it. Non-current player clicks -> gets `error: NOT_YOUR_TURN`, board doesn't change.
5. Place 3 in a row -> both tabs receive `game:ended` w/ `outcome:"win"` and the line highlighted.
6. New game, wait for timer -> both tabs receive `game:ended` w/ `outcome:"draw"`.
7. Kill host tab -> remaining tab sees `lobby:player_left` w/ `newHostId` promoted.
8. Refresh a player tab mid-game -> (MVP) treated as a new join, prior slot vacated. (Reconnect-by-token covered in follow-up.)
