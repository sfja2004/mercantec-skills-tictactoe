import type { ServerWebSocket } from "bun";
import { validateConfig, Lobby } from "./lobby";
import {
    ErrorCode,
    PROTOCOL_LIMITS,
    type Client2Server,
    type Client2ServerMessage,
    type LobbyCode,
    type PlayerId,
    type Server2Client,
} from "./protocol";
import { LobbyRegistry } from "./registry";
import { sessionToken, uuid } from "./rng";

type Connection = {
    playerId: PlayerId;
    token: string;
    name: string | null;
    lobbyCode: LobbyCode | null;
    placeBucket: { tokens: number; lastRefill: number };
    lastActivity: number;
};

const PORT = Number(process.env.PORT ?? 9000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const registry = new LobbyRegistry();

type WebSocket = ServerWebSocket<Connection>;

function log(event: string, fields: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

const server = Bun.serve<Connection>({
    port: PORT,
    fetch(req, server) {
        const url = new URL(req.url);

        if (url.pathname === "/health") {
            return new Response("ok", { status: 200 });
        }

        if (url.pathname === "/ws") {
            if (ALLOWED_ORIGINS.length > 0) {
                const origin = req.headers.get("origin");
                if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
                    log("ws.upgrade.forbidden_origin", { origin });
                    return new Response("forbidden origin", { status: 403 });
                }
            }
            const upgraded = server.upgrade(req, {
                data: {
                    playerId: uuid(),
                    token: sessionToken(),
                    name: null,
                    lobbyCode: null,
                    placeBucket: {
                        tokens: PROTOCOL_LIMITS.PLACE_RATE_PER_SEC,
                        lastRefill: Date.now(),
                    },
                    lastActivity: Date.now(),
                } satisfies Connection,
            });
            if (upgraded) {
                return undefined;
            }
            return new Response("upgrade failed", { status: 426 });
        }

        return new Response("not found", { status: 404 });
    },

    websocket: {
        maxPayloadLength: 64 * 1024,
        idleTimeout: 120, // seconds
        open(ws) {
            log("ws.open", { playerId: ws.data.playerId });
            send(ws, {
                type: "hello",
                you: ws.data.playerId,
                sessionToken: ws.data.token,
            });
        },
        message(ws, raw) {
            ws.data.lastActivity = Date.now();
            let msg: Client2Server;
            try {
                const parsed = JSON.parse(
                    typeof raw === "string" ? raw : raw.toString(),
                );
                if (
                    !parsed ||
                    typeof parsed !== "object" ||
                    typeof parsed.type !== "string"
                ) {
                    throw new Error("invalid envelope");
                }
                msg = parsed as Client2Server;
            } catch {
                log("ws.msg.parse_error", { playerId: ws.data.playerId });
                sendErr(
                    ws,
                    undefined,
                    ErrorCode.INVALID_MESSAGE,
                    "could not parse message",
                );
                return;
            }
            if (msg.type !== "ping") {
                log("ws.msg", {
                    playerId: ws.data.playerId,
                    type: msg.type,
                    lobby: ws.data.lobbyCode,
                });
            }
            route(ws, msg);
        },
        close(ws, code, reason) {
            log("ws.close", {
                playerId: ws.data.playerId,
                lobby: ws.data.lobbyCode,
                code,
                reason: reason || undefined,
            });
            handleLeave(ws);
        },
    },
});

log("server.listen", {
    port: server.port,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : "*",
});

// ---------------------------------------------------------------------------

function send(ws: WebSocket, msg: Server2Client) {
    ws.send(JSON.stringify(msg));
}

function sendErr(
    ws: WebSocket,
    msgId: string | undefined,
    code: keyof typeof ErrorCode,
    message: string,
) {
    send(ws, { type: "error", msgId, code: ErrorCode[code], message });
}

function reply<T extends string, P extends object>(
    ws: WebSocket,
    inMsgId: string | undefined,
    msg: { type: T } & P,
) {
    send(ws, { ...msg, msgId: inMsgId } as unknown as Server2Client);
}

function route(ws: WebSocket, msg: Client2Server) {
    switch (msg.type) {
        case "ping":
            reply(ws, msg.msgId, { type: "pong" });
            return;
        case "lobby:create":
            handleCreate(ws, msg);
            return;
        case "lobby:join":
            handleJoin(ws, msg);
            return;
        case "lobby:leave":
            handleLeave(ws, msg.msgId);
            return;
        case "lobby:start":
            handleStart(ws, msg);
            return;
        case "game:place":
            handlePlace(ws, msg);
            return;
        default: {
            const _exhaustive: never = msg;
            void _exhaustive;
            sendErr(
                ws,
                (msg as { msgId?: string }).msgId,
                ErrorCode.INVALID_MESSAGE,
                "unknown message type",
            );
        }
    }
}

function handleCreate(
    ws: WebSocket,
    msg: Client2ServerMessage<"lobby:create">,
) {
    if (ws.data.lobbyCode) {
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.ALREADY_IN_LOBBY,
            "already in a lobby",
        );
    }
    const name = sanitizeName(msg.name);
    if (!name)
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.INVALID_MESSAGE,
            "invalid name",
        );

    const err = validateConfig(msg.config);
    if (err) return sendErr(ws, msg.msgId, ErrorCode.INVALID_CONFIG, err);

    const lobby = registry.create(msg.config, ws.data.playerId);
    const player = lobby.addPlayer(ws.data.playerId, name, (m) => send(ws, m));
    if ("error" in player) {
        registry.drop(lobby.code);
        return sendErr(ws, msg.msgId, ErrorCode.LOBBY_FULL, "lobby full");
    }

    ws.data.lobbyCode = lobby.code;
    ws.data.name = name;

    log("lobby.create", { code: lobby.code, host: ws.data.playerId, name });

    reply(ws, msg.msgId, {
        type: "lobby:joined",
        code: lobby.code,
        you: ws.data.playerId,
        hostId: lobby.hostId,
        players: lobby.players(),
        config: lobby.config,
        state: lobby.state,
    });
}

function handleJoin(ws: WebSocket, msg: Client2ServerMessage<"lobby:join">) {
    if (ws.data.lobbyCode) {
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.ALREADY_IN_LOBBY,
            "already in a lobby",
        );
    }
    const name = sanitizeName(msg.name);
    if (!name)
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.INVALID_MESSAGE,
            "invalid name",
        );

    const lobby = registry.get(msg.code);
    if (!lobby)
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.LOBBY_NOT_FOUND,
            "lobby not found",
        );

    const result = lobby.addPlayer(ws.data.playerId, name, (m) => send(ws, m));
    if ("error" in result) {
        if (result.error === "full")
            return sendErr(ws, msg.msgId, ErrorCode.LOBBY_FULL, "lobby full");
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.LOBBY_ALREADY_STARTED,
            "game already started",
        );
    }

    ws.data.lobbyCode = lobby.code;
    ws.data.name = name;
    registry.cancelCleanup(lobby.code);

    log("lobby.join", {
        code: lobby.code,
        player: ws.data.playerId,
        name,
        size: lobby.size,
    });

    reply(ws, msg.msgId, {
        type: "lobby:joined",
        code: lobby.code,
        you: ws.data.playerId,
        hostId: lobby.hostId,
        players: lobby.players(),
        config: lobby.config,
        state: lobby.state,
    });

    lobby.broadcast(
        { type: "lobby:player_joined", player: result },
        ws.data.playerId,
    );
}

function handleStart(ws: WebSocket, msg: Client2ServerMessage<"lobby:start">) {
    const lobby = currentLobby(ws);
    if (!lobby)
        return sendErr(ws, msg.msgId, ErrorCode.NOT_IN_LOBBY, "not in a lobby");
    if (lobby.hostId !== ws.data.playerId)
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.NOT_HOST,
            "only the host can start the game",
        );

    const result = lobby.startGame(() => onDraw(lobby));
    if ("error" in result) {
        if (result.error === "not_enough_players")
            return sendErr(
                ws,
                msg.msgId,
                ErrorCode.NOT_ENOUGH_PLAYERS,
                "need at least 2 players",
            );
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.LOBBY_ALREADY_STARTED,
            "already started",
        );
    }

    const started = lobby.game!.start();
    log("lobby.start", { code: lobby.code, players: lobby.players().length });
    const payload: Server2Client = {
        type: "game:started",
        turnOrder: lobby.players().map((p) => p.id),
        currentTurn: started.currentTurn,
        deadline: started.deadline,
        board: started.board,
    };
    reply(ws, msg.msgId, payload);
    lobby.broadcast(payload, ws.data.playerId);
}

function handlePlace(ws: WebSocket, msg: Client2ServerMessage<"game:place">) {
    const lobby = currentLobby(ws);
    if (!lobby)
        return sendErr(ws, msg.msgId, ErrorCode.NOT_IN_LOBBY, "not in a lobby");
    if (lobby.state !== "playing" || !lobby.game)
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.GAME_NOT_STARTED,
            "game has not started",
        );
    if (lobby.game.ended)
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.GAME_ALREADY_ENDED,
            "game has already ended",
        );
    if (lobby.game.currentTurn() !== ws.data.playerId)
        return sendErr(ws, msg.msgId, ErrorCode.NOT_YOUR_TURN, "not your turn");

    if (!consumePlaceToken(ws))
        return sendErr(ws, msg.msgId, ErrorCode.RATE_LIMITED, "slow down");

    const result = lobby.game.place(ws.data.playerId, msg.x, msg.y);
    if (!result.ok) {
        if (result.reason === "out_of_range")
            return sendErr(
                ws,
                msg.msgId,
                ErrorCode.COORD_OUT_OF_RANGE,
                "coordinate out of range",
            );
        return sendErr(
            ws,
            msg.msgId,
            ErrorCode.TILE_OCCUPIED,
            "tile already taken",
        );
    }

    const placed: Server2Client = {
        type: "game:placed",
        x: result.tile.x,
        y: result.tile.y,
        symbol: result.tile.symbol,
        by: result.tile.by,
        nextTurn: result.nextTurn,
        deadline: result.deadline,
    };
    reply(ws, msg.msgId, placed);
    lobby.broadcast(placed, ws.data.playerId);

    if (result.win) {
        const ended: Server2Client = {
            type: "game:ended",
            outcome: "win",
            winner: result.win.winner,
            line: result.win.line,
        };
        lobby.endGame();
        lobby.broadcast(ended);
        send(ws, ended);
    }
}

function handleLeave(ws: WebSocket, msgId?: string) {
    const lobby = currentLobby(ws);
    if (!lobby) {
        if (msgId !== undefined) {
            reply(ws, msgId, { type: "pong" } as unknown as Server2Client);
        }
        return;
    }
    const wasHost = lobby.hostId === ws.data.playerId;
    const { newHostId } = lobby.removePlayer(ws.data.playerId);
    ws.data.lobbyCode = null;

    lobby.broadcast({
        type: "lobby:player_left",
        playerId: ws.data.playerId,
        newHostId: newHostId ?? (wasHost ? undefined : undefined),
    });

    if (lobby.state === "playing" && lobby.game && !lobby.game.ended) {
        if (lobby.players().length < 2) {
            const survivors = lobby.players();
            lobby.endGame();
            const ended: Server2Client = survivors[0]
                ? {
                      type: "game:ended",
                      outcome: "win",
                      winner: survivors[0].id,
                  }
                : { type: "game:ended", outcome: "draw" };
            lobby.broadcast(ended);
        } else {
            lobby.broadcast({
                type: "game:turn",
                currentTurn: lobby.game.currentTurn(),
                deadline: lobby.game.deadline,
            });
        }
    }

    if (lobby.size === 0) registry.scheduleCleanupIfEmpty(lobby);
}

function onDraw(lobby: Lobby) {
    lobby.endGame();
    lobby.broadcast({ type: "game:ended", outcome: "draw" });
}

// --- helpers ----------------------------------------------------------------

function currentLobby(ws: WebSocket): Lobby | null {
    const code = ws.data.lobbyCode;
    if (!code) return null;
    const lobby = registry.get(code);
    return lobby ?? null;
}

function sanitizeName(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (
        trimmed.length === 0 ||
        trimmed.length > PROTOCOL_LIMITS.MAX_NAME_LENGTH
    )
        return null;
    return trimmed;
}

function consumePlaceToken(ws: WebSocket): boolean {
    const b = ws.data.placeBucket;
    const now = Date.now();
    const elapsed = (now - b.lastRefill) / 1000;
    b.tokens = Math.min(
        PROTOCOL_LIMITS.PLACE_RATE_PER_SEC,
        b.tokens + elapsed * PROTOCOL_LIMITS.PLACE_RATE_PER_SEC,
    );
    b.lastRefill = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
}
