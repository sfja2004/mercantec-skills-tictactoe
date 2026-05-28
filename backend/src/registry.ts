import { Lobby } from "./lobby";
import { PROTOCOL_LIMITS, type LobbyCode, type LobbyConfig, type PlayerId } from "./protocol";
import { lobbyCode } from "./rng";

export class LobbyRegistry {
    private lobbies = new Map<LobbyCode, Lobby>();
    private cleanupTimers = new Map<LobbyCode, ReturnType<typeof setTimeout>>();

    create(config: LobbyConfig, hostId: PlayerId): Lobby {
        let code = lobbyCode();
        while (this.lobbies.has(code)) code = lobbyCode();
        const lobby = new Lobby(code, config, hostId);
        this.lobbies.set(code, lobby);
        return lobby;
    }

    get(code: LobbyCode): Lobby | undefined {
        return this.lobbies.get(code.toUpperCase());
    }

    drop(code: LobbyCode) {
        this.lobbies.delete(code);
        const t = this.cleanupTimers.get(code);
        if (t) clearTimeout(t);
        this.cleanupTimers.delete(code);
    }

    scheduleCleanupIfEmpty(lobby: Lobby) {
        if (lobby.size > 0) return;
        if (this.cleanupTimers.has(lobby.code)) return;
        const t = setTimeout(() => {
            const current = this.lobbies.get(lobby.code);
            if (current && current.size === 0) this.drop(lobby.code);
        }, PROTOCOL_LIMITS.EMPTY_LOBBY_GRACE_MS);
        this.cleanupTimers.set(lobby.code, t);
    }

    cancelCleanup(code: LobbyCode) {
        const t = this.cleanupTimers.get(code);
        if (t) {
            clearTimeout(t);
            this.cleanupTimers.delete(code);
        }
    }
}
