// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import "./style.css";
import { loadFonts, loadSprites } from "./assets";
import { adjustAim, fire, type AimDelta } from "./core/match";
import { applyFit, applyOverlayFit, fitPlayingArea } from "./display";
import { describeBackdropFrame } from "./frame";
import { startGameLoop } from "./gameLoop";
import { bindControls, bindEscape } from "./input";
import { MAIN_MENU_ITEMS, type Screen } from "./navigation";
import { drawFrame, drawShakenFrame } from "./renderer";
import { bindBracketFlash, bindMainMenuButton, bindMenuButtonEffects, bindMenuFocusKeys, bindScreenRoutes, navigateBack, renderMenuItems, showScreen, traceTitleArc, type ScreenElements } from "./screens";
import { createScreenSession, describeScreenSessionFrame, enterScreen, screenSessionShake, stepScreenSession } from "./screenSession";
import { drawStars, renderStarSprites } from "./starLayer";
import { generateStars } from "./stars";

const STATIC_STAR_TIME_MS = 0;

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

async function start(): Promise<void> {
  const stage = document.querySelector<HTMLElement>("#stage")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const context = canvas.getContext("2d")!;
  const elements: ScreenElements = {
    overlay: document.querySelector<HTMLElement>("#overlay")!,
    mainMenu: document.querySelector<HTMLElement>("#main-menu")!,
    credits: document.querySelector<HTMLElement>("#credits")!,
    creditsBackButton: document.querySelector<HTMLButtonElement>("#credits-back-button")!,
    keyHint: document.querySelector<HTMLElement>(".key-hint")!,
    canvas,
  };
  const menu = document.querySelector<HTMLElement>("#main-menu .menu")!;
  const matchMenuButton = document.querySelector<HTMLButtonElement>("#match-menu-button")!;
  const titleArc = document.querySelector<SVGPathElement>("#main-menu .title-arc path")!;

  const sprites = await loadSprites();
  await loadFonts();

  const session = createScreenSession();

  const fitStage = () => {
    const fit = fitPlayingArea(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
    applyFit(canvas, context, fit);
    applyOverlayFit(elements.overlay, fit);
  };
  window.addEventListener("resize", fitStage);
  fitStage();

  const isMatchActive = () => session.match !== undefined;
  const adjustMatchAim = (delta: AimDelta) => adjustAim(session.match!, delta);
  const fireMatch = () => fire(session.match!);
  bindControls(window, isMatchActive, adjustMatchAim, fireMatch);

  const navigateBackFromCurrentScreen = () => navigateBack(window, session.screen);
  bindEscape(window, navigateBackFromCurrentScreen);

  renderMenuItems(menu, MAIN_MENU_ITEMS);
  bindMenuFocusKeys(menu);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const menuButtons = elements.overlay.querySelectorAll<HTMLButtonElement>(".menu button");
  for (const button of menuButtons) {
    bindMenuButtonEffects(button, reducedMotion);
  }
  bindBracketFlash(matchMenuButton);
  bindMainMenuButton(matchMenuButton);
  bindMainMenuButton(elements.creditsBackButton);
  const enterAndShowScreen = (screen: Screen) => {
    const seed = randomSeed();
    enterScreen(session, screen, seed);
    showScreen(elements, screen);
  };
  bindScreenRoutes(window, enterAndShowScreen);
  traceTitleArc(titleArc, reducedMotion);

  const stepSimulation = () => stepScreenSession(session, reducedMotion.matches);
  const backdropFrame = describeBackdropFrame();
  const stars = generateStars(Math.random);
  const starSprites = renderStarSprites();
  const render = (timeMs: number) => {
    const starTimeMs = reducedMotion.matches ? STATIC_STAR_TIME_MS : timeMs;
    const frame = describeScreenSessionFrame(session);
    const shake = screenSessionShake(session, reducedMotion.matches, Math.random);
    drawFrame(context, sprites, backdropFrame);
    drawStars(context, starSprites, stars, starTimeMs);
    drawShakenFrame(context, sprites, frame, shake);
  };
  startGameLoop(stepSimulation, render);
}

start();
