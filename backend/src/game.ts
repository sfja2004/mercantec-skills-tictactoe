import {
    PROTOCOL_LIMITS,
    type LobbyConfig,
    type PlayerId,
    type Symbol,
    type Tile,
} from "./protocol";
import { findWinLine } from "./win";

export type PlaceResult =
    | { ok: false; reason: "tile_occupied" | "out_of_range" }
    | {
          ok: true;
          tile: Tile;
          nextTurn: PlayerId;
          deadline: number;
          win?: { winner: PlayerId; line: { x: number; y: number }[] };
      };

export type DrawCallback = () => void;

function key(x: number, y: number): string {
    return `${x},${y}`;
}

export class GameState {
    private board = new Map<string, Tile>();
    private symbolByKey = new Map<string, Symbol>(); // for win scan
    private turnIdx = 0;
    private timeout: ReturnType<typeof setTimeout> | null = null;
    private _deadline = 0;
    private _ended = false;

    constructor(
        private readonly turnOrder: PlayerId[],
        private readonly symbols: Map<PlayerId, Symbol>,
        private readonly config: LobbyConfig,
        private readonly onDraw: DrawCallback,
    ) {}

    start(): { deadline: number; currentTurn: PlayerId; board: Tile[] } {
        this._deadline = Date.now() + this.config.timer.seconds * 1000;
        this.armTimer();
        return {
            deadline: this._deadline,
            currentTurn: this.currentTurn(),
            board: this.snapshot(),
        };
    }

    get ended(): boolean {
        return this._ended;
    }

    get deadline(): number {
        return this._deadline;
    }

    currentTurn(): PlayerId {
        return this.turnOrder[this.turnIdx]!;
    }

    snapshot(): Tile[] {
        return [...this.board.values()];
    }

    place(by: PlayerId, x: number, y: number): PlaceResult {
        const { COORD_MIN, COORD_MAX } = PROTOCOL_LIMITS;
        if (
            !Number.isInteger(x) ||
            !Number.isInteger(y) ||
            x < COORD_MIN ||
            x > COORD_MAX ||
            y < COORD_MIN ||
            y > COORD_MAX
        ) {
            return { ok: false, reason: "out_of_range" };
        }
        const k = key(x, y);
        if (this.board.has(k))
            return { ok: false, reason: "tile_occupied" };

        const symbol = this.symbols.get(by)!;
        const tile: Tile = { x, y, symbol, by };
        this.board.set(k, tile);
        this.symbolByKey.set(k, symbol);

        const line = findWinLine(
            this.symbolByKey,
            x,
            y,
            symbol,
            this.config.winLength,
        );

        if (line) {
            this.endGame();
            return {
                ok: true,
                tile,
                nextTurn: by,
                deadline: this._deadline,
                win: { winner: by, line },
            };
        }

        this.advanceTurn();
        this.applyIncrement();
        this.armTimer();
        return {
            ok: true,
            tile,
            nextTurn: this.currentTurn(),
            deadline: this._deadline,
        };
    }

    // Skip players that left mid-game. Returns the new currentTurn (or null
    // if there's nobody playable left).
    skipDeparted(stillIn: Set<PlayerId>): PlayerId | null {
        if (this._ended) return null;
        if (stillIn.size === 0) {
            this.endGame();
            return null;
        }
        for (let i = 0; i < this.turnOrder.length; i++) {
            if (stillIn.has(this.currentTurn())) return this.currentTurn();
            this.advanceTurn();
        }
        return null;
    }

    endGame() {
        this._ended = true;
        if (this.timeout) clearTimeout(this.timeout);
        this.timeout = null;
    }

    private advanceTurn() {
        this.turnIdx = (this.turnIdx + 1) % this.turnOrder.length;
    }

    private applyIncrement() {
        const { incrementBelow, incrementBy } = this.config.timer;
        if (!incrementBelow || !incrementBy) return;
        const remaining = this._deadline - Date.now();
        if (remaining <= incrementBelow * 1000) {
            this._deadline += incrementBy * 1000;
        }
    }

    private armTimer() {
        if (this.timeout) clearTimeout(this.timeout);
        const ms = Math.max(0, this._deadline - Date.now());
        this.timeout = setTimeout(() => {
            if (this._ended) return;
            this.endGame();
            this.onDraw();
        }, ms);
    }
}
