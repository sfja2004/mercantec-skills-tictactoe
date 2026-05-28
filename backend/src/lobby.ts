import { GameState } from "./game";
import {
    PROTOCOL_LIMITS,
    SYMBOL_PALETTE,
    type LobbyCode,
    type LobbyConfig,
    type Player,
    type PlayerId,
    type Server2Client,
    type Symbol,
} from "./protocol";

export type Send = (msg: Server2Client) => void;

type Slot = {
    player: Player;
    send: Send | null; // null = disconnected
};

export type LobbyState = "lobby" | "playing" | "ended";

export class Lobby {
    state: LobbyState = "lobby";
    private slots = new Map<PlayerId, Slot>();
    private order: PlayerId[] = []; // join order; doubles as turn order
    hostId: PlayerId;
    game: GameState | null = null;

    constructor(
        public readonly code: LobbyCode,
        public readonly config: LobbyConfig,
        hostId: PlayerId,
    ) {
        this.hostId = hostId;
    }

    get size(): number {
        return this.slots.size;
    }

    get connectedCount(): number {
        let n = 0;
        for (const s of this.slots.values()) if (s.send) n++;
        return n;
    }

    players(): Player[] {
        return this.order
            .map((id) => this.slots.get(id)?.player)
            .filter((p): p is Player => !!p);
    }

    addPlayer(
        id: PlayerId,
        name: string,
        send: Send,
    ): Player | { error: "full" | "started" } {
        if (this.state !== "lobby") return { error: "started" };
        if (this.slots.size >= this.config.maxPlayers) return { error: "full" };
        const symbol = this.pickSymbol();
        const player: Player = {
            id,
            name,
            symbol,
            role: "player",
            connected: true,
        };
        this.slots.set(id, { player, send });
        this.order.push(id);
        return player;
    }

    removePlayer(id: PlayerId): { newHostId?: PlayerId } {
        const slot = this.slots.get(id);
        if (!slot) return {};
        this.slots.delete(id);
        this.order = this.order.filter((p) => p !== id);

        let newHostId: PlayerId | undefined;
        if (this.hostId === id && this.order.length > 0) {
            newHostId = this.order[0]!;
            this.hostId = newHostId;
        }

        if (this.state === "playing" && this.game && !this.game.ended) {
            const stillIn = new Set(this.order);
            this.game.skipDeparted(stillIn);
        }

        return newHostId ? { newHostId } : {};
    }

    sendOf(id: PlayerId): Send | null {
        return this.slots.get(id)?.send ?? null;
    }

    broadcast(msg: Server2Client, except?: PlayerId) {
        for (const [id, slot] of this.slots) {
            if (id === except) continue;
            slot.send?.(msg);
        }
    }

    symbolOf(id: PlayerId): Symbol {
        return this.slots.get(id)!.player.symbol;
    }

    private pickSymbol(): Symbol {
        const used = new Set(
            [...this.slots.values()].map((s) => s.player.symbol),
        );
        for (const sym of SYMBOL_PALETTE) if (!used.has(sym)) return sym;
        // fallback - shouldn't hit unless maxPlayers > palette
        return `P${this.slots.size + 1}`;
    }

    startGame(onDraw: () => void): { error: string } | { ok: true } {
        if (this.state !== "lobby") return { error: "already_started" };
        if (this.order.length < PROTOCOL_LIMITS.MIN_PLAYERS)
            return { error: "not_enough_players" };
        const symbols = new Map<PlayerId, Symbol>();
        for (const id of this.order) symbols.set(id, this.symbolOf(id));
        this.game = new GameState(
            [...this.order],
            symbols,
            this.config,
            onDraw,
        );
        this.state = "playing";
        return { ok: true };
    }

    endGame() {
        this.state = "ended";
        this.game?.endGame();
    }
}

export function validateConfig(c: LobbyConfig): string | null {
    const L = PROTOCOL_LIMITS;
    if (
        !Number.isInteger(c.maxPlayers) ||
        c.maxPlayers < L.MIN_PLAYERS ||
        c.maxPlayers > L.MAX_PLAYERS
    )
        return `maxPlayers must be integer in [${L.MIN_PLAYERS}, ${L.MAX_PLAYERS}]`;
    if (
        !Number.isInteger(c.winLength) ||
        c.winLength < L.MIN_WIN_LENGTH ||
        c.winLength > L.MAX_WIN_LENGTH
    )
        return `winLength must be integer in [${L.MIN_WIN_LENGTH}, ${L.MAX_WIN_LENGTH}]`;
    const t = c.timer;
    if (
        !Number.isFinite(t.seconds) ||
        t.seconds < L.MIN_TIMER_SECONDS ||
        t.seconds > L.MAX_TIMER_SECONDS
    )
        return `timer.seconds must be in [${L.MIN_TIMER_SECONDS}, ${L.MAX_TIMER_SECONDS}]`;
    if (t.incrementBelow !== undefined || t.incrementBy !== undefined) {
        if (
            t.incrementBelow === undefined ||
            t.incrementBy === undefined ||
            t.incrementBelow < 0 ||
            t.incrementBy < 0
        )
            return "timer.incrementBelow and timer.incrementBy must both be set and non-negative";
    }
    return null;
}
