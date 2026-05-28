// Shared wire types for the TicTacToe WebSocket protocol.
// Imported by both the server (backend/src/*) and the frontend client
// (frontend/src/websocket/client.ts).

export type PlayerId = string;
export type LobbyCode = string;
export type Symbol = string;
export type Role = "player" | "spectator";

export type Player = {
    id: PlayerId;
    name: string;
    symbol: Symbol;
    role: Role;
    connected: boolean;
};

export type Tile = {
    x: number;
    y: number;
    symbol: Symbol;
    by: PlayerId;
};

export type TimerConfig = {
    seconds: number;
    incrementBelow?: number;
    incrementBy?: number;
};

export type LobbyConfig = {
    maxPlayers: number;
    winLength: number;
    timer: TimerConfig;
};

export const ErrorCode = {
    NOT_YOUR_TURN: "NOT_YOUR_TURN",
    TILE_OCCUPIED: "TILE_OCCUPIED",
    LOBBY_FULL: "LOBBY_FULL",
    LOBBY_NOT_FOUND: "LOBBY_NOT_FOUND",
    LOBBY_ALREADY_STARTED: "LOBBY_ALREADY_STARTED",
    NOT_IN_LOBBY: "NOT_IN_LOBBY",
    ALREADY_IN_LOBBY: "ALREADY_IN_LOBBY",
    NOT_HOST: "NOT_HOST",
    INVALID_CONFIG: "INVALID_CONFIG",
    INVALID_MESSAGE: "INVALID_MESSAGE",
    GAME_NOT_STARTED: "GAME_NOT_STARTED",
    GAME_ALREADY_ENDED: "GAME_ALREADY_ENDED",
    NOT_ENOUGH_PLAYERS: "NOT_ENOUGH_PLAYERS",
    RATE_LIMITED: "RATE_LIMITED",
    COORD_OUT_OF_RANGE: "COORD_OUT_OF_RANGE",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// --- envelope ---------------------------------------------------------------

export type ClientEnvelope<T extends string, P> = {
    type: T;
    msgId?: string;
} & P;

export type ServerEnvelope<T extends string, P> = {
    type: T;
    msgId?: string;
} & P;

// --- client -> server -------------------------------------------------------

export type Client2Server =
    | ClientEnvelope<"lobby:create", { name: string; config: LobbyConfig }>
    | ClientEnvelope<"lobby:join", { code: LobbyCode; name: string }>
    | ClientEnvelope<"lobby:leave", {}>
    | ClientEnvelope<"lobby:start", {}>
    | ClientEnvelope<"game:place", { x: number; y: number }>
    | ClientEnvelope<"ping", {}>;

export type Client2ServerMessageType = Client2Server["type"];
export type Client2ServerMessage<T extends Client2ServerMessageType> = Extract<
    Client2Server,
    { type: T }
>;

// --- server -> client -------------------------------------------------------

export type Server2Client =
    | ServerEnvelope<"hello", { you: PlayerId; sessionToken: string }>
    | ServerEnvelope<
          "lobby:joined",
          {
              code: LobbyCode;
              you: PlayerId;
              hostId: PlayerId;
              players: Player[];
              config: LobbyConfig;
              state: "lobby" | "playing" | "ended";
          }
      >
    | ServerEnvelope<"lobby:player_joined", { player: Player }>
    | ServerEnvelope<
          "lobby:player_left",
          { playerId: PlayerId; newHostId?: PlayerId }
      >
    | ServerEnvelope<
          "game:started",
          {
              turnOrder: PlayerId[];
              currentTurn: PlayerId;
              deadline: number;
              board: Tile[];
          }
      >
    | ServerEnvelope<
          "game:placed",
          {
              x: number;
              y: number;
              symbol: Symbol;
              by: PlayerId;
              nextTurn: PlayerId;
              deadline: number;
          }
      >
    | ServerEnvelope<"game:turn", { currentTurn: PlayerId; deadline: number }>
    | ServerEnvelope<
          "game:ended",
          {
              outcome: "win" | "draw";
              winner?: PlayerId;
              line?: { x: number; y: number }[];
          }
      >
    | ServerEnvelope<"error", { code: ErrorCode; message: string }>
    | ServerEnvelope<"pong", {}>;

export type Server2ClientMessageType = Server2Client["type"];
export type Server2ClientMessage<T extends Server2ClientMessageType> = Extract<
    Server2Client,
    { type: T }
>;

// --- constants --------------------------------------------------------------

export const PROTOCOL_LIMITS = {
    MIN_WIN_LENGTH: 3,
    MAX_WIN_LENGTH: 10,
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 16,
    MIN_TIMER_SECONDS: 10,
    MAX_TIMER_SECONDS: 60 * 60,
    MAX_NAME_LENGTH: 32,
    COORD_MIN: -1_000_000,
    COORD_MAX: 1_000_000,
    PLACE_RATE_PER_SEC: 5,
    HEARTBEAT_TIMEOUT_MS: 60_000,
    EMPTY_LOBBY_GRACE_MS: 60_000,
} as const;

export const SYMBOL_PALETTE: Symbol[] = [
    "X",
    "O",
    "Δ",
    "□",
    "◇",
    "☆",
    "♥",
    "♣",
    "♠",
    "♦",
    "✚",
    "✱",
    "●",
    "▲",
    "▼",
    "◆",
];
