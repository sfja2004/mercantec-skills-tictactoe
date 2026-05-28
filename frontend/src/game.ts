import { Board } from "./board";
import { Renderer } from "./renderer";
import { v2, type V2 } from "./v2";
import clickSoundMp3 from "./assets/click_sound.mp3";
import gameoverSoundMp3 from "./assets/gameover_sound.mp3";

export class Game {
    private offset = v2(0, 0);
    private isMouseDown = false;
    private isDragging = false;
    private dragBuf = v2(0, 0);

    private xWins = 0;
    private oWins = 0;

    private mode: "Menu" | "Singleplayer" | "LocalMultiplayer" = "Menu";

    private localMulti: LocalMultiplayerState | null = null;

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

    private spTimer = 0;

    startSingleplayer(personality: "easy" | "hard") {
        this.menu.hide();
        this.mode = "Singleplayer";
        this.offset = v2(0, 0);
        this.board = new Board();
        this.board.initAi(personality);

        this.spTimer = setTimeout(() => {
            if (this.mode !== "Singleplayer") {
                return;
            }
            new Audio(gameoverSoundMp3).play();
            this.mode = "Menu";
            this.localMulti = null;
            this.menu.initSingleplayerTie();
            this.menu.show();
            this.board.setCursor(v2(-1, -1));
            return;
        }, 30000);
    }

    startLocalMultiplayer() {
        this.menu.hide();
        this.mode = "LocalMultiplayer";
        this.localMulti = {
            currentPlayer: "X",
        };
        this.offset = v2(0, 0);
        this.board = new Board();
    }

    onMouseDown(_pos: V2) {
        this.isMouseDown = true;
        this.isDragging = false;
        this.dragBuf = v2(0, 0);
    }

    onMouseUp(_pos: V2) {
        if (!this.isDragging) {
            if (this.mode === "LocalMultiplayer") {
                const state = this.localMulti!;

                if (this.board.clickTile(state.currentPlayer) === "placed") {
                    if (this.board.winner()) {
                        new Audio(gameoverSoundMp3).play();
                        this.mode = "Menu";
                        this.localMulti = null;
                        this.menu.initLocalMultiplayerWin(this.board.winner()!);
                        if (this.board.winner()! === "X") {
                            this.xWins += 1;
                        } else {
                            this.oWins += 1;
                        }
                        document.querySelector<HTMLDivElement>(
                            "div#score",
                        )!.innerHTML = `
                            <h2>X: ${this.xWins}, O: ${this.oWins}</h2>
                        `;
                        this.menu.show();
                        this.board.setCursor(v2(-1, -1));
                        return;
                    }

                    new Audio(clickSoundMp3).play();

                    state.currentPlayer =
                        state.currentPlayer === "X" ? "O" : "X";
                }
            } else if (this.mode === "Singleplayer") {
                if (this.board.clickTile("X") === "placed") {
                    clearTimeout(this.spTimer);
                    this.spTimer = setTimeout(() => {
                        if (this.mode !== "Singleplayer") {
                            return;
                        }
                        new Audio(gameoverSoundMp3).play();
                        this.mode = "Menu";
                        this.localMulti = null;
                        this.menu.initSingleplayerTie();
                        this.menu.show();
                        this.board.setCursor(v2(-1, -1));
                        return;
                    }, 30000);

                    if (this.board.winner()) {
                        new Audio(gameoverSoundMp3).play();
                        this.mode = "Menu";
                        this.localMulti = null;
                        this.menu.initSingleplayerWin();
                        this.menu.show();
                        this.board.setCursor(v2(-1, -1));
                        return;
                    }

                    this.board.makeAiPickATile("O");

                    if (this.board.winner()) {
                        new Audio(gameoverSoundMp3).play();
                        this.mode = "Menu";
                        this.localMulti = null;
                        this.menu.initSingleplayerLoss();
                        this.menu.show();
                        this.board.setCursor(v2(-1, -1));
                        return;
                    }

                    new Audio(clickSoundMp3).play();
                }
            }
        }
        this.isMouseDown = false;
        this.isDragging = false;
    }

    onMouseMove(pos: V2, deltaPos: V2) {
        this.dragBuf = this.dragBuf.add(deltaPos);
        if (this.mode !== "Menu") {
            this.board.setCursor(pos.sub(this.offset));

            if (this.isMouseDown && this.dragBuf.len() > 20) {
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
        if (this.mode === "LocalMultiplayer") {
            if (this.localMulti!.currentPlayer === "X") {
                r.drawXTurnIndicator();
            } else {
                r.drawOTurnIndicator();
            }
        }
    }
}

type LocalMultiplayerState = {
    currentPlayer: "X" | "O";
};

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
            <button id="button-start-singleplayer-easy">Singleplayer (easy AI)</button>
            <button id="button-start-singleplayer-hard">Singleplayer (hard AI)</button>
            <button id="button-start-local-multiplayer">Local 2 player</button>
            <button id="button-create-lobby">Create lobby</button>
            <button id="button-connect-to-lobby">Connect to lobby</button>
            <p>På Singleplayer er der en 30 sekunders timer (resetter hver tur.)</p>
            <p>Score virker kun i Local 2 player</p>
        `;
        document
            .querySelector<HTMLButtonElement>("#button-start-singleplayer-easy")
            ?.addEventListener("click", () => {
                this.game.startSingleplayer("easy");
            });
        document
            .querySelector<HTMLButtonElement>("#button-start-singleplayer-hard")
            ?.addEventListener("click", () => {
                this.game.startSingleplayer("hard");
            });
        document
            .querySelector<HTMLButtonElement>("#button-start-local-multiplayer")
            ?.addEventListener("click", () => {
                this.game.startLocalMultiplayer();
            });
        document
            .querySelector<HTMLButtonElement>("#button-create-lobby")
            ?.addEventListener("click", () => {
                this.initLobby();
            });
        document
            .querySelector<HTMLButtonElement>("#button-connect-to-lobby")
            ?.addEventListener("click", () => {
                throw new Error("not implemented");
            });
    }

    initLocalMultiplayerWin(winnerKind: string) {
        this.menuDiv.innerHTML = `
            <h1>${winnerKind} has won!</h1>
            <button id="button-continue">Continue</button>
        `;
        document
            .querySelector<HTMLButtonElement>("#button-continue")
            ?.addEventListener("click", () => {
                this.initMainMenu();
            });
    }

    initSingleplayerWin() {
        this.menuDiv.innerHTML = `
            <h1>You won!</h1>
            <button id="button-continue">Continue</button>
        `;
        document
            .querySelector<HTMLButtonElement>("#button-continue")
            ?.addEventListener("click", () => {
                this.initMainMenu();
            });
    }
    initSingleplayerLoss() {
        this.menuDiv.innerHTML = `
            <h1>You lost!</h1>
            <button id="button-continue">Continue</button>
        `;
        document
            .querySelector<HTMLButtonElement>("#button-continue")
            ?.addEventListener("click", () => {
                this.initMainMenu();
            });
    }
    initSingleplayerTie() {
        this.menuDiv.innerHTML = `
            <h1>You tied!</h1>
            <p>Time (30s) ran out.</p>
            <button id="button-continue">Continue</button>
        `;
        document
            .querySelector<HTMLButtonElement>("#button-continue")
            ?.addEventListener("click", () => {
                this.initMainMenu();
            });
    }



    initLobby() {
        this.menuDiv.innerHTML = `
            <h1>Lobby!</h1>
            <h2>Code: ${Math.floor(Math.random() * 4)}</h2>
            <p>Waiting for users...</p>
        `;
        document
            .querySelector<HTMLButtonElement>("#button-continue")
            ?.addEventListener("click", () => {
                this.initMainMenu();
            });
    }
}
