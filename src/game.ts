export class Game {
    private offset = v2(0, 0);
    private board = new Board();

    constructor(private canvas: HTMLCanvasElement) {}
}

export class Renderer {
    private cx: CanvasRenderingContext2D;
    public readonly size: V2;

    constructor(
        private canvas: HTMLCanvasElement,
        private offset: V2,
    ) {
        this.cx = canvas.getContext("2d")!;
        this.size = v2(this.canvas.width, this.canvas.height);
    }

    drawGrid(tileSize: V2, renderTile: (pos: V2) => void) {
        for (let y = 0; y < this.size.y; y += tileSize.y) {
            for (let x = 0; x < this.size.x; x += tileSize.x) {
                renderTile(v2(x, y));
            }
        }
    }

    drawUnclickedTile(pos: V2) {
        const { cx } = this;
        cx.fillStyle = "#555";
        cx.fillRect(pos.x, pos.y, 20, 20);
        cx.fillStyle = "#666";
        cx.fillRect(pos.x + 2, pos.y + 2, 20 - 4, 20 - 4);
    }
}

export class Board {
    constructor() {}

    render(r: Renderer) {
        r.drawGrid(v2(20, 20), (pos) => {
            r.drawUnclickedTile(pos);
        });
    }
}

export class V2 {
    constructor(
        public x: number,
        public y: number,
    ) {}
}

export const v2 = (x: number, y: number): V2 => new V2(x, y);
