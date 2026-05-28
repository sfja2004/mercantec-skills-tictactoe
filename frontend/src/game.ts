import { Board } from "./board";
import { Renderer } from "./renderer";
import { v2, type V2 } from "./v2";

export class Game {
    private offset = v2(0, 0);
    private isMouseDown = false;
    private isDragging = false;
    private isBoardEnabled = false;

    private menu: Menu;

    private board = new Board();

    constructor(
        private canvas: HTMLCanvasElement,
        private menuDiv: HTMLDivElement,
    ) {
        this.menu = new Menu(this.menuDiv, this);
    }

    start() {
        this.menu.initMainMenu();
    }

    startSingleplayer() {
        this.menu.hide();
        this.isBoardEnabled = true;
    }

    startLocalMultiplayer() {}

    onMouseDown(pos: V2) {
        this.isMouseDown = true;
        this.isDragging = false;
    }

    onMouseUp(pos: V2) {
        if (!this.isDragging) {
            this.board.click();
        }
        this.isMouseDown = false;
        this.isDragging = false;
    }

    onMouseMove(pos: V2, deltaPos: V2) {
        if (this.isBoardEnabled) {
            this.board.setCursor(pos.sub(this.offset));

            if (this.isMouseDown) {
                this.isDragging = true;
            }
            if (this.isDragging) {
                this.offset = this.offset.add(deltaPos);
            }
        }
    }

    render() {
        const r = new Renderer(this.canvas, this.offset);
        r.clear();
        this.board.render(r);
    }
}

export class Menu {
    constructor(
        private menuDiv: HTMLDivElement,
        private game: Game,
    ) {}

    hide() {
        this.menuDiv.style.display = "none";
    }
    show() {
        this.menuDiv.style.display = "flex";
    }

    initMainMenu() {
        this.menuDiv.innerHTML = `
            <h1>Infinity TicTacToe</h1>
            <button id="button-start-singleplayer">Singleplayer against AI</button>
            <button id="button-start-local-multiplayer">Local 2 player</button>
            <button id="button-create-lobby">Create lobby</button>
            <button id="button-connect-to-lobby">Connect to lobby</button>
        `;
        document
            .querySelector<HTMLButtonElement>("#button-start-singleplayer")
            ?.addEventListener("click", () => {
                this.game.startSingleplayer();
            });
        document
            .querySelector<HTMLButtonElement>("#button-start-local-multiplayer")
            ?.addEventListener("click", () => {
                this.game.startLocalMultiplayer();
            });
        document
            .querySelector<HTMLButtonElement>("#button-create-lobby")
            ?.addEventListener("click", () => {
                throw new Error("not implemented");
            });
        document
            .querySelector<HTMLButtonElement>("#button-connect-to-lobby")
            ?.addEventListener("click", () => {
                throw new Error("not implemented");
            });
    }
}
