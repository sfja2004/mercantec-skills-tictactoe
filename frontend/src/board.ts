import type { Renderer } from "./renderer";
import { v2, Rect, type V2 } from "./v2";

const tileSize = v2(50, 50);

export class Board {
    private map = new TileMap();
    private cursor = v2(-1, -1);

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

    click() {
        const tp = this.pos2tile(this.cursor);
        if (!this.map.hasTile(tp)) {
            this.map.setTile(Math.random() > 0.5 ? "X" : "O", tp);
        }
    }

    private pos2tile(pos: V2): V2 {
        return pos.mul(tileSize.inv()).sub(v2(0.5)).round();
    }
}

export class TileMap {
    private tiles = new Map<string, Tile>();

    setTile(kind: string, pos: V2) {
        if (this.tiles.has(tileHash(pos))) {
            throw new Error("tile is occupied");
        }
        const tile = {
            kind,
            up: null,
            down: null,
            left: null,
            right: null,
        };
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
