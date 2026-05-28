import { type V2, v2 } from "./v2";

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

    clear() {
        const { cx } = this;
        cx.fillStyle = "black";
        cx.fillRect(0, 0, this.size.x, this.size.y);
    }

    drawGrid(tileSize: V2, renderTile: (pos: V2) => void) {
        for (let y = -1; y < this.size.y / tileSize.y + 1; ++y) {
            for (let x = -1; x < this.size.x / tileSize.x + 1; ++x) {
                renderTile(
                    v2(
                        x * tileSize.x +
                            (this.offset.x % tileSize.x) -
                            this.offset.x,
                        y * tileSize.y +
                            (this.offset.y % tileSize.y) -
                            this.offset.y,
                    ),
                );
            }
        }
    }

    drawUnclickedTile(pos: V2, size: V2) {
        const { cx } = this;
        pos = pos.add(this.offset);

        cx.fillStyle = "#555";
        cx.fillRect(pos.x, pos.y, size.x, size.y);
        cx.fillStyle = "#666";
        cx.fillRect(pos.x + 3, pos.y + 3, size.x - 3 * 2, size.y - 3 * 2);
    }

    drawUnclickedTileHovered(pos: V2, size: V2) {
        const { cx } = this;
        pos = pos.add(this.offset);

        cx.fillStyle = "#555";
        cx.fillRect(pos.x, pos.y, size.x, size.y);
        cx.fillStyle = "#666";
        cx.fillRect(pos.x + 3, pos.y + 3, size.x - 3 * 2, size.y - 3 * 2);
        cx.fillStyle = "#e82";
        cx.fillRect(pos.x, pos.y, size.x, 1);
        cx.fillRect(pos.x, pos.y + size.y - 1, size.x, 1);
        cx.fillRect(pos.x, pos.y, 1, size.y);
        cx.fillRect(pos.x + size.x - 1, pos.y, 1, size.y);
    }

    drawXTile(pos: V2, size: V2) {
        const { cx } = this;
        pos = pos.add(this.offset);

        cx.fillStyle = "#666";
        cx.fillRect(pos.x, pos.y, size.x, size.y);
        cx.fillStyle = "#e55050";
        const text = "X";
        const fontSize = 48;
        const width = cx.measureText(text).width;
        cx.font = `bold ${fontSize}px monospace`;
        cx.fillText(text, pos.x + size.x / 2 - width / 2, pos.y + fontSize - 6);
    }

    drawOTile(pos: V2, size: V2) {
        const { cx } = this;
        pos = pos.add(this.offset);

        cx.fillStyle = "#666";
        cx.fillRect(pos.x, pos.y, size.x, size.y);
        cx.fillStyle = "#5093e5";
        const text = "O";
        const fontSize = 48;
        const width = cx.measureText(text).width;
        cx.font = `bold ${fontSize}px monospace`;
        cx.fillText(text, pos.x + size.x / 2 - width / 2, pos.y + fontSize - 6);
    }
}
