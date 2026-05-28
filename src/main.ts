import { Game } from "./game";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;

canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

const game = new Game(canvas);

const renderLoopFn = () => {
    game.render();
    requestAnimationFrame(renderLoopFn);
};
renderLoopFn();
