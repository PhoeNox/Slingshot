// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import "./style.css";
import { loadFont, loadSprites } from "./assets";
import { adjustAim, createMatch, fire, matchView, step, type AimDelta } from "./core/match";
import { applyFit, fitPlayingArea } from "./display";
import { describeFrame } from "./frame";
import { startGameLoop } from "./gameLoop";
import { bindControls } from "./input";
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

  const adjustMatchAim = (delta: AimDelta) => adjustAim(match, delta);
  const fireMatch = () => fire(match);
  bindControls(window, adjustMatchAim, fireMatch);

  const stepMatch = () => step(match);
  const render = () => {
    const view = matchView(match);
    const frame = describeFrame(view);
    drawFrame(context, sprites, frame);
  };
  startGameLoop(stepMatch, render);
}

start();
