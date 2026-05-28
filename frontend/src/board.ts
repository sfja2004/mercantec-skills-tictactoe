import type { Renderer } from "./renderer";
import { v2, Rect, type V2 } from "./v2";
import { testBoard } from "./board_test";

const tileSize = v2(50, 50);

export class Board {
    private map = new TileMap();
    private cursor = v2(-1, -1);

    private kindThatHasWon: string | null = null;

    private ai: Ai | null = null;

    constructor() {}

    render(r: Renderer) {
        r.drawGrid(tileSize, (pos) => {
            const tile = this.map.getTile(this.pos2tile(pos));
            if (tile) {
                if (tile === "X") {
                    r.drawXTile(pos, tileSize);
                } else {
                    r.drawOTile(pos, tileSize);
                }
            } else {
                if (new Rect(pos, tileSize).containsPoint(this.cursor)) {
                    r.drawUnclickedTileHovered(pos, tileSize);
                } else {
                    r.drawUnclickedTile(pos, tileSize);
                }
            }
        });
    }

    setCursor(pos: V2) {
        this.cursor = pos;
    }

    clickTile(kind: string): "placed" | "not placed" {
        const tp = this.pos2tile(this.cursor);
        if (this.map.hasTile(tp)) return "not placed";
        this.map.setTile(kind, tp);
        if (this.checkWinAt(tp, kind)) {
            this.kindThatHasWon = kind;
        }
        return "placed";
    }

    winner(): string | null {
        return this.kindThatHasWon;
    }

    initAi(personality: "easy" | "hard") {
        this.ai = new Ai(personality);
    }

    makeAiPickATile(kind: string) {}

    private pos2tile(pos: V2): V2 {
        return pos.mul(tileSize.inv()).sub(v2(0.5)).round();
    }

    private checkWinAt(pos: V2, kind: string): boolean {
        return new WinChecker(this.map).check(pos, kind);
    }
}

class Ai {
    private aiTurns: V2[] = [];
    private playerTurns: V2[] = [];

    constructor(private personality: "easy" | "hard") {}

    addPlayerTurn(pos: V2) {
        this.playerTurns.push(pos);
    }

    pickTile(kind: string, map: TileMap) {
        const side =
            this.personality === "easy" || Math.random() > 0.5 ? "ai" : "user";
        if (side === "ai") {
            this.pickTurnFromAi(kind, map);
            return;
        } else {
        }
    }

    pickTurnFromAi(kind: string, map: TileMap) {
        const offs = [
            v2(-1, -1),
            v2(-1, 0),
            v2(-1, 1),
            v2(0, -1),
            v2(0, 1),
            v2(1, -1),
            v2(1, 0),
            v2(1, 1),
        ];
        for (const pos of this.aiTurns.toReversed()) {
            for (const off of offs) {
                if (!map.hasTile(pos.add(off))) {
                    map.setTile(kind, pos.add(off));
                    this.aiTurns.push(pos.add(off));
                    return;
                }
            }
        }
    }
    pickTurnFromUser(kind: string, map: TileMap) {
        const offs = [
            v2(-1, -1),
            v2(-1, 0),
            v2(-1, 1),
            v2(0, -1),
            v2(0, 1),
            v2(1, -1),
            v2(1, 0),
            v2(1, 1),
        ];
        for (const pos of this.aiTurns.toReversed()) {
            for (const off of offs) {
                if (!map.hasTile(pos.add(off))) {
                    map.setTile(kind, pos.add(off));
                    this.aiTurns.push(pos.add(off));
                    return;
                }
            }
        }
    }
}

export class WinChecker {
    constructor(private map: TileMap) {}

    check(pos: V2, kind: string): boolean {
        const offs = [
            v2(-1, -1),
            v2(-1, 0),
            v2(-1, 1),
            v2(0, -1),
            v2(0, 0),
            v2(0, 1),
            v2(1, -1),
            v2(1, 0),
            v2(1, 1),
        ];
        const shapes = [
            [v2(-1, 0), v2(1, 0)],
            [v2(0, -1), v2(0, 1)],
            [v2(-1, -1), v2(1, 1)],
            [v2(-1, 1), v2(1, -1)],
        ];
        for (const off of offs) {
            for (const [back, front] of shapes) {
                if (
                    [
                        pos.add(back).add(off),
                        pos.add(off),
                        pos.add(front).add(off),
                    ].every((p) => this.map.getTile(p) === kind)
                ) {
                    return true;
                }
            }
        }
        return false;
    }
}

export class TileMap {
    private tiles = new Map<string, Tile>();

    setTile(kind: string, pos: V2) {
        if (this.tiles.has(tileHash(pos))) {
            throw new Error("tile is occupied");
        }
        const tile = { kind };
        this.tiles.set(tileHash(pos), tile);
    }

    getTile(pos: V2): string | null {
        return this.tiles.get(tileHash(pos))?.kind ?? null;
    }

    hasTile(pos: V2): boolean {
        return this.tiles.has(tileHash(pos));
    }
}

type Tile = {
    kind: string;
};

export function tileHash(pos: V2): string {
    return `${pos.x}-${pos.y}`;
}

testBoard();
