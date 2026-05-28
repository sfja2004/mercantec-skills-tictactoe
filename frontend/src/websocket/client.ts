// Typed WebSocket client for the TicTacToe backend.
//
// Two patterns:
//   1) Request/response via msgId correlation - returns a Promise.
//        await client.createLobby({ ... })
//        await client.placeTile({ x, y })
//   2) Event subscriptions for unsolicited broadcasts.
//        const off = client.on("game:placed", (m) => ...)
//
// The shared protocol types live in `backend/src/protocol.ts`. Import them
// directly so the wire format can never drift between client and server.

import type {
    Client2Server,
    Client2ServerMessage,
    Client2ServerMessageType,
    LobbyCode,
    LobbyConfig,
    Server2Client,
    Server2ClientMessage,
    Server2ClientMessageType,
} from "../../../backend/src/protocol";

export type {
    LobbyCode,
    LobbyConfig,
    Server2Client,
    Server2ClientMessage,
    Server2ClientMessageType,
    Client2Server,
    Client2ServerMessageType,
} from "../../../backend/src/protocol";
export { ErrorCode } from "../../../backend/src/protocol";

export type ConnectionState =
    | "idle"
    | "connecting"
    | "open"
    | "closing"
    | "closed";

export class ProtocolError extends Error {
    constructor(
        public code: string,
        message: string,
    ) {
        super(message);
        this.name = "ProtocolError";
    }
}

type Pending = {
    resolve: (msg: Server2Client) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
};

type AnyListener = (msg: Server2Client) => void;
type Listener<T extends Server2ClientMessageType> = (msg: Server2ClientMessage<T>) => void;

export type ClientOptions = {
    url: string;
    /** Default request timeout in ms (per RPC). */
    requestTimeoutMs?: number;
    /** Auto-send ping at this interval. 0 disables. */
    heartbeatMs?: number;
};

export class TicTacToeClient {
    private ws: WebSocket | null = null;
    private pending = new Map<string, Pending>();
    private listeners = new Map<Server2ClientMessageType, Set<AnyListener>>();
    private stateListeners = new Set<(s: ConnectionState) => void>();
    private _state: ConnectionState = "idle";
    private heartbeat: ReturnType<typeof setInterval> | null = null;

    /** Set after the server's `hello` message. */
    you: string | null = null;
    sessionToken: string | null = null;

    private readonly requestTimeoutMs: number;
    private readonly heartbeatMs: number;

    constructor(private readonly opts: ClientOptions) {
        this.requestTimeoutMs = opts.requestTimeoutMs ?? 5000;
        this.heartbeatMs = opts.heartbeatMs ?? 20_000;
    }

    get state(): ConnectionState {
        return this._state;
    }

    onState(fn: (s: ConnectionState) => void): () => void {
        this.stateListeners.add(fn);
        return () => this.stateListeners.delete(fn);
    }

    /** Connect and resolve once the server's `hello` has been received. */
    connect(): Promise<{ you: string; sessionToken: string }> {
        if (this._state === "open" && this.you && this.sessionToken) {
            return Promise.resolve({
                you: this.you,
                sessionToken: this.sessionToken,
            });
        }
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.opts.url);
            this.ws = ws;
            this.setState("connecting");

            const helloOff = this.on("hello", (m) => {
                this.you = m.you;
                this.sessionToken = m.sessionToken;
                helloOff();
                resolve({ you: m.you, sessionToken: m.sessionToken });
            });

            ws.onopen = () => {
                this.setState("open");
                if (this.heartbeatMs > 0) {
                    this.heartbeat = setInterval(() => {
                        this.sendRaw({ type: "ping" }).catch(() => {});
                    }, this.heartbeatMs);
                }
            };
            ws.onmessage = (ev) => {
                let msg: Server2Client;
                try {
                    msg = JSON.parse(ev.data as string);
                } catch {
                    return;
                }
                this.dispatch(msg);
            };
            ws.onclose = () => {
                this.setState("closed");
                this.cleanup();
                helloOff();
                reject(new Error("socket closed before hello"));
            };
            ws.onerror = () => {
                // onclose will follow; let it handle teardown
            };
        });
    }

    close(): void {
        this.setState("closing");
        this.ws?.close();
    }

    // --- RPC methods --------------------------------------------------------

    createLobby(args: {
        name: string;
        config: LobbyConfig;
    }): Promise<Server2ClientMessage<"lobby:joined">> {
        return this.rpc<"lobby:create", "lobby:joined">(
            { type: "lobby:create", ...args },
            "lobby:joined",
        );
    }

    joinLobby(args: {
        code: LobbyCode;
        name: string;
    }): Promise<Server2ClientMessage<"lobby:joined">> {
        return this.rpc<"lobby:join", "lobby:joined">(
            { type: "lobby:join", ...args },
            "lobby:joined",
        );
    }

    leaveLobby(): Promise<Server2ClientMessage<"pong">> {
        // Server replies with a pong-shaped ack only if not in a lobby; in the
        // common case the caller just wants fire-and-forget. We resolve on
        // either pong or on the broadcast they themselves trigger; the
        // simplest contract here is: await the ack OR a short timeout.
        return this.rpc<"lobby:leave", "pong">(
            { type: "lobby:leave" },
            "pong",
            { allowAny: true },
        );
    }

    startGame(): Promise<Server2ClientMessage<"game:started">> {
        return this.rpc<"lobby:start", "game:started">(
            { type: "lobby:start" },
            "game:started",
        );
    }

    placeTile(args: {
        x: number;
        y: number;
    }): Promise<Server2ClientMessage<"game:placed">> {
        return this.rpc<"game:place", "game:placed">(
            { type: "game:place", ...args },
            "game:placed",
        );
    }

    ping(): Promise<Server2ClientMessage<"pong">> {
        return this.rpc<"ping", "pong">({ type: "ping" }, "pong");
    }

    // --- Events -------------------------------------------------------------

    on<T extends Server2ClientMessageType>(type: T, fn: Listener<T>): () => void {
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        const wrapped: AnyListener = (m) => fn(m as Server2ClientMessage<T>);
        set.add(wrapped);
        return () => {
            set!.delete(wrapped);
        };
    }

    // --- Internals ----------------------------------------------------------

    private async rpc<TIn extends Client2ServerMessageType, TOut extends Server2ClientMessageType>(
        msg: Client2ServerMessage<TIn>,
        _expected: TOut,
        opts: { allowAny?: boolean } = {},
    ): Promise<Server2ClientMessage<TOut>> {
        const msgId = crypto.randomUUID();
        const payload = { ...msg, msgId };
        return new Promise<Server2ClientMessage<TOut>>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(msgId);
                reject(new Error(`request '${msg.type}' timed out`));
            }, this.requestTimeoutMs);
            this.pending.set(msgId, {
                resolve: (m) => {
                    if (m.type === "error") {
                        const e = m as Server2ClientMessage<"error">;
                        reject(new ProtocolError(e.code, e.message));
                        return;
                    }
                    resolve(m as Server2ClientMessage<TOut>);
                },
                reject,
                timeout,
            });
            void opts; // currently unused; kept for future "any-reply" semantics
            this.sendRaw(payload).catch((err) => {
                clearTimeout(timeout);
                this.pending.delete(msgId);
                reject(err);
            });
        });
    }

    private async sendRaw(payload: Client2Server): Promise<void> {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error("socket not open");
        }
        ws.send(JSON.stringify(payload));
    }

    private dispatch(msg: Server2Client) {
        if (msg.msgId && this.pending.has(msg.msgId)) {
            const p = this.pending.get(msg.msgId)!;
            this.pending.delete(msg.msgId);
            clearTimeout(p.timeout);
            p.resolve(msg);
            // also emit to event listeners (so subscribers see the broadcast
            // shape too, e.g. a UI watching `game:placed` for board updates).
        }
        const set = this.listeners.get(msg.type);
        if (set) {
            for (const fn of set) {
                try {
                    fn(msg);
                } catch (err) {
                    console.error("[ws] listener threw:", err);
                }
            }
        }
    }

    private setState(s: ConnectionState) {
        if (this._state === s) return;
        this._state = s;
        for (const fn of this.stateListeners) fn(s);
    }

    private cleanup() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        for (const p of this.pending.values()) {
            clearTimeout(p.timeout);
            p.reject(new Error("socket closed"));
        }
        this.pending.clear();
    }
}

