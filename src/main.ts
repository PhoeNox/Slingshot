import "./style.css";
import { loadFont, loadSprites } from "./assets";
import { applyFit, fitPlayingArea } from "./display";
import { drawFrame } from "./renderer";

async function start(): Promise<void> {
  const stage = document.querySelector<HTMLElement>("#stage")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const context = canvas.getContext("2d")!;
  canvas.focus();

  const sprites = await loadSprites();
  await loadFont();

  const fitAndDraw = () => {
    const fit = fitPlayingArea(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
    applyFit(canvas, context, fit);
    drawFrame(context, sprites);
  };
  window.addEventListener("resize", fitAndDraw);
  fitAndDraw();
}

start();
