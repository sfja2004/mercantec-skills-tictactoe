import { Game } from "./game";
import "./style.css";
import { v2 } from "./v2";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const menuDiv = document.querySelector<HTMLDivElement>("#menu")!;

canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

const game = new Game(canvas, menuDiv);
game.start();

canvas.addEventListener("mousedown", (ev) => {
    const pos = v2(ev.offsetX, ev.offsetY);
    game.onMouseDown(pos);
});
canvas.addEventListener("mouseup", (ev) => {
    const pos = v2(ev.offsetX, ev.offsetY);
    game.onMouseUp(pos);
});
canvas.addEventListener("mousemove", (ev) => {
    const pos = v2(ev.offsetX, ev.offsetY);
    const deltaPos = v2(ev.movementX, ev.movementY);
    game.onMouseMove(pos, deltaPos);
});

const renderLoopFn = () => {
    game.render();
    requestAnimationFrame(renderLoopFn);
};
renderLoopFn();
