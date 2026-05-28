# Backend - Infinity TicTacToe

WebSocket server for the multiplayer mode of Infinity TicTacToe. Supports lobbies with N players (host-configurable) playing on a shared infinite canvas.

- Runtime: **Bun** (`Bun.serve` with native WebSocket support)
- Language: **TypeScript** (no build step - `bun run` executes `.ts` directly)
- Transport: single WebSocket endpoint, JSON messages, msgId-based request/response correlation
- State: in-memory only (lobbies vanish on restart - persistence is on the TODO list)

## Run

```bash
cd backend
bun install
bun run dev          # hot reload
# or
bun run start        # plain
```

Env vars:

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `9000` | HTTP/WS port |
| `ALLOWED_ORIGINS` | `""` (any) | Comma-separated origin allowlist for the WS upgrade. Set this in prod. |

Endpoints:

- `GET /health` - liveness probe, returns `ok`
- `WS  /ws` - the game socket

## Project layout

```
backend/
  package.json
  tsconfig.json
  src/
    index.ts      # Bun.serve, WS open/message/close, routing, rate limit, validation
    protocol.ts   # Shared wire types (imported by frontend too)
    lobby.ts      # Lobby class + config validation
    game.ts       # Board, turn cursor, draw timer (+ optional chess-style increment)
    win.ts        # winLength-in-a-row scan around last move
    registry.ts   # Map<code, Lobby> + empty-lobby cleanup grace
    rng.ts        # Lobby codes, uuid, session tokens
```

## Wire protocol

Single JSON envelope both directions, discriminated by `type`. A client request sets `msgId`; the server echoes the same `msgId` on its direct reply. Server-initiated broadcasts have no `msgId`.

```ts
type Envelope = { type: string; msgId?: string; [k: string]: unknown };
```

Shared types live in `backend/src/protocol.ts`:

- `Client2Server` / `Server2Client` - the message unions
- `Client2ServerMessageType` / `Server2ClientMessageType` - the union of `type` strings
- `Client2ServerMessage<T>` / `Server2ClientMessage<T>` - extract one variant by its `type` tag
- `ErrorCode` - enum of error codes the server can return
- `PROTOCOL_LIMITS` - shared numeric limits (timer bounds, max players, coord range, ...)
- `SYMBOL_PALETTE` - server-side symbol pool

### Client -> server

| `type` | Payload | Notes |
| --- | --- | --- |
| `lobby:create` | `{ name, config: { maxPlayers, winLength, timer: { seconds, incrementBelow?, incrementBy? } } }` | Become host. Server replies `lobby:joined`. |
| `lobby:join` | `{ code, name }` | Join existing lobby. Server replies `lobby:joined`, others get `lobby:player_joined`. |
| `lobby:leave` | `{}` | Leave current lobby. |
| `lobby:start` | `{}` | Host only. Server replies + broadcasts `game:started`. |
| `game:place` | `{ x, y }` | Only valid on your turn. Server replies + broadcasts `game:placed`. |
| `ping` | `{}` | Keepalive. Server replies `pong`. |

### Server -> client

| `type` | When |
| --- | --- |
| `hello` | First message after WS open. Carries your `you` (playerId) + `sessionToken`. |
| `lobby:joined` | After your `lobby:create` / `lobby:join`. |
| `lobby:player_joined` | Broadcast when someone else joins. |
| `lobby:player_left` | Broadcast on disconnect/leave. Includes `newHostId` if host changed. |
| `game:started` | After `lobby:start`. Includes `turnOrder`, `currentTurn`, `deadline`, `board`. |
| `game:placed` | Per valid placement. `deadline` updates if chess-style increment fired. |
| `game:turn` | Turn changed without a placement (player skipped/disconnected). |
| `game:ended` | `outcome: "win" \| "draw"`, plus `winner` + `line` on a win. |
| `error` | Validation/permission failure. Always echoes the offending `msgId` if present. |
| `pong` | Reply to `ping`. |

`deadline` is epoch ms. Clients display `max(0, deadline - now())`. The server is the timer authority.

### Error codes

`NOT_YOUR_TURN`, `TILE_OCCUPIED`, `LOBBY_FULL`, `LOBBY_NOT_FOUND`, `LOBBY_ALREADY_STARTED`, `NOT_IN_LOBBY`, `ALREADY_IN_LOBBY`, `NOT_HOST`, `INVALID_CONFIG`, `INVALID_MESSAGE`, `GAME_NOT_STARTED`, `GAME_ALREADY_ENDED`, `NOT_ENOUGH_PLAYERS`, `RATE_LIMITED`, `COORD_OUT_OF_RANGE`.

## State machine (per lobby)

```
LOBBY (players joining)
  -> lobby:start (host) ->
PLAYING (turns cycle, timer running)
  -> winLength-in-a-row -> ENDED (win)
  -> timer expires     -> ENDED (draw)
  -> only one player left -> ENDED (win by default) or LOBBY (cancel)
```

## Server-side safeguards

- Server-authoritative board: clients render only what the server broadcasts.
- Coordinate range clamp: `x`, `y` must be integers in `[-1_000_000, 1_000_000]`.
- Place rate limit: token bucket, 5 placements/sec/socket.
- Origin allowlist on WS upgrade (`ALLOWED_ORIGINS`).
- Idle timeout 120s on the WS layer + 60s `HEARTBEAT_TIMEOUT_MS`.
- Empty lobbies are dropped after `EMPTY_LOBBY_GRACE_MS` (60s).
- Config validation on `lobby:create`: `winLength in [3, 10]`, `maxPlayers in [2, 16]`, `timer.seconds in [10, 3600]`.

## TODOs (reserved, not implemented yet)

- **Spectator role** - `Player.role` already supports `"player" | "spectator"`. The join path always assigns `"player"` for now.
- **Chat / emotes** - reserve `chat:send` / `chat:message` in the protocol when adding.
- **Player-picked symbols** - currently the server picks the next free entry from `SYMBOL_PALETTE`.
- **Reconnect by session token** - the server already issues a `sessionToken` in `hello`, but the join path treats every connection as a brand-new player. Honoring the token to restore the prior slot is a follow-up.
- **Persistent store** - in-memory `Map<code, Lobby>` for now. Recommendation when needed: `bun:sqlite` (zero infra, single file).

---

# Frontend integration

The frontend talks to the server via a typed wrapper at `frontend/src/websocket/client.ts`. The wrapper imports the protocol types directly from `backend/src/protocol.ts`, so the wire format can never drift.

## What the client gives you

```ts
import { TicTacToeClient } from "./websocket/client";

const client = new TicTacToeClient({
    url: "ws://localhost:9000/ws",
    requestTimeoutMs: 5000,  // optional, default 5s
    heartbeatMs: 20_000,     // optional, default 20s, set 0 to disable
});
```

Two patterns:

1. **RPC methods** return a `Promise` that resolves with the server's reply (matched on `msgId`) or rejects with `ProtocolError`.
2. **Event subscriptions** via `client.on(type, fn)` fire on every broadcast of that `type`. Returns an unsubscribe function.

RPC methods:

| Method | Returns |
| --- | --- |
| `connect()` | `{ you, sessionToken }` after the server's `hello` arrives. |
| `createLobby({ name, config })` | `lobby:joined` payload (code, players, config, you, hostId). |
| `joinLobby({ code, name })` | `lobby:joined` payload. |
| `leaveLobby()` | ack. |
| `startGame()` | `game:started` payload. Host only. |
| `placeTile({ x, y })` | `game:placed` payload. |
| `ping()` | `pong`. |

Subscribable events (anything in `Server2ClientMessageType`):

`hello`, `lobby:joined`, `lobby:player_joined`, `lobby:player_left`, `game:started`, `game:placed`, `game:turn`, `game:ended`, `error`, `pong`.

## Session token - what to do with it

`hello` is the very first message the server sends. It carries:

```ts
{ type: "hello", you: PlayerId, sessionToken: string }
```

`client.connect()` resolves only after `hello` is received, and exposes:

```ts
client.you           // your playerId
client.sessionToken  // your session token
```

**Today (MVP):** the server issues a fresh token per connection. If the socket drops, your token is gone and you rejoin as a new player. You can ignore it.

**When reconnect lands:** the plan is to persist the token in `sessionStorage` keyed by lobby code, then on a reload pass it back in `lobby:join` (or a new `session:resume` message) so the server re-attaches you to your old slot - keeping your turn order, symbol, and place in the game.

Recommended frontend pattern (forward-compatible):

```ts
// after a successful create/join:
sessionStorage.setItem(`ttt:token:${joined.code}`, client.sessionToken!);
sessionStorage.setItem(`ttt:you:${joined.code}`, client.you!);

// on reload, if you have a code in the URL:
const code = new URLSearchParams(location.search).get("lobby");
const savedToken = code ? sessionStorage.getItem(`ttt:token:${code}`) : null;
// (savedToken is not yet honored by the server - just store it for later)
```

Until the server honors it, treat reload as a fresh join.

## When to call what

### 1) Boot

```ts
const client = new TicTacToeClient({ url: "ws://localhost:9000/ws" });
const { you, sessionToken } = await client.connect();
// you can now call any RPC method
```

### 2) Host creates a lobby

```ts
const joined = await client.createLobby({
    name: "alice",
    config: {
        maxPlayers: 4,
        winLength: 5,
        timer: { seconds: 300 },                          // 5 min total
        // optional chess-style increment:
        // timer: { seconds: 300, incrementBelow: 20, incrementBy: 2 },
    },
});
console.log(joined.code);    // share this with friends
console.log(joined.you);     // your playerId
console.log(joined.hostId);  // === joined.you, because you created it
```

### 3) Other player joins

```ts
const joined = await client.joinLobby({ code: "ABCD", name: "bob" });
// joined.players already includes everyone in the lobby
// joined.hostId tells you who can start the game
```

### 4) Listen for lobby updates

```ts
client.on("lobby:player_joined", ({ player }) => {
    console.log(`${player.name} joined as ${player.symbol}`);
});
client.on("lobby:player_left", ({ playerId, newHostId }) => {
    if (newHostId) console.log(`new host: ${newHostId}`);
});
```

### 5) Host starts the game

Only the host can call this. Non-host callers get a `ProtocolError("NOT_HOST", ...)`.

```ts
if (joined.hostId === client.you) {
    const started = await client.startGame();
    // started.turnOrder, started.currentTurn, started.deadline, started.board
}

// Everyone, host included, can also subscribe:
client.on("game:started", ({ turnOrder, currentTurn, deadline, board }) => {
    renderInitialBoard(board);
    updateTurnIndicator(currentTurn);
    startTimer(deadline);
});
```

### 6) Place a tile

Only call when it's your turn (`currentTurn === client.you`). The server enforces it - you'll get `NOT_YOUR_TURN` if you guess wrong.

```ts
try {
    await client.placeTile({ x: 3, y: -7 });
    // optimistic UI: don't paint locally. Wait for the broadcast.
} catch (err) {
    if (err.code === "NOT_YOUR_TURN") showToast("Not your turn");
    else if (err.code === "TILE_OCCUPIED") showToast("Already taken");
    else throw err;
}
```

The server broadcasts `game:placed` to everyone (including the placer). That's what should drive the board update:

```ts
client.on("game:placed", ({ x, y, symbol, by, nextTurn, deadline }) => {
    board.set(x, y, symbol);
    updateTurnIndicator(nextTurn);
    refreshTimer(deadline);  // may have increased if increment fired
});
```

### 7) End of game

```ts
client.on("game:ended", ({ outcome, winner, line }) => {
    if (outcome === "win") {
        highlightWinningLine(line!);
        showOverlay(`${winner} wins!`);
    } else {
        showOverlay("Draw - time's up");
    }
});
```

### 8) Errors

Two flavors:

- **RPC errors** - the promise rejects with `ProtocolError { code, message }`.
- **Out-of-band errors** - via `client.on("error", ...)`. Rare - mostly malformed messages.

```ts
client.on("error", ({ code, message }) => {
    console.warn("[ws error]", code, message);
});
```

### 9) Connection state

```ts
client.onState((s) => {
    // s: "idle" | "connecting" | "open" | "closing" | "closed"
    setConnectionBadge(s);
});
```

If the socket closes mid-game, pending RPCs reject with `Error("socket closed")`. MVP behavior is to surface that to the user and let them reconnect manually. Auto-reconnect lands together with session-token resume.

## End-to-end example (host + start)

```ts
const client = new TicTacToeClient({ url: "ws://localhost:9000/ws" });
await client.connect();

const joined = await client.createLobby({
    name: "alice",
    config: { maxPlayers: 4, winLength: 5, timer: { seconds: 300 } },
});
console.log("share this code:", joined.code);

client.on("lobby:player_joined", ({ player }) =>
    console.log("joined:", player.name),
);

// wait for at least one other player, then:
const started = await client.startGame();
console.log("first to play:", started.currentTurn);

client.on("game:placed", ({ x, y, symbol, nextTurn }) => {
    board.set(x, y, symbol);
    if (nextTurn === client.you) enableInput();
    else disableInput();
});

client.on("game:ended", ({ outcome, winner }) =>
    console.log("ended:", outcome, winner),
);
```
