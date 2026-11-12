import "./style.css";
import { loadFont, loadSprites } from "./assets";
import { createMatch, step } from "./core/match";
import { applyFit, fitPlayingArea } from "./display";
import { startGameLoop } from "./gameLoop";
import { drawFrame } from "./renderer";

async function start(): Promise<void> {
  const stage = document.querySelector<HTMLElement>("#stage")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const context = canvas.getContext("2d")!;
  canvas.focus();

  const sprites = await loadSprites();
  await loadFont();

  const seed = Math.floor(Math.random() * 2 ** 32);
  const match = createMatch(seed);

  const fitCanvas = () => {
    const fit = fitPlayingArea(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
    applyFit(canvas, context, fit);
  };
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  const stepMatch = () => step(match);
  const render = () => drawFrame(context, sprites, match);
  startGameLoop(stepMatch, render);
}

start();
