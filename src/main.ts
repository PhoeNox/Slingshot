// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import "./style.css";
import { loadFonts, loadSprites } from "./assets";
import { adjustAim, createMatch, fire, matchView, step, type AimDelta, type Match } from "./core/match";
import { applyFit, applyOverlayFit, fitPlayingArea } from "./display";
import { describeBackdropFrame, describeFrame } from "./frame";
import { startGameLoop } from "./gameLoop";
import { bindControls, bindEscape } from "./input";
import { MAIN_MENU_ITEMS, type Screen } from "./navigation";
import { drawFrame } from "./renderer";
import { bindBracketFlash, bindMainMenuButton, bindMenuButtonEffects, bindMenuFocusKeys, bindScreenRoutes, navigateBack, renderMenuItems, showScreen, type ScreenElements } from "./screens";

interface MatchSession {
  screen: Screen;
  match: Match | undefined;
}

function createRandomMatch(): Match {
  const seed = Math.floor(Math.random() * 2 ** 32);
  return createMatch(seed);
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

  const sprites = await loadSprites();
  await loadFonts();

  const session: MatchSession = { screen: "mainMenu", match: undefined };

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
  const enterScreen = (screen: Screen) => {
    session.screen = screen;
    session.match = screen === "match" ? createRandomMatch() : undefined;
    showScreen(elements, screen);
  };
  bindScreenRoutes(window, enterScreen);

  const stepMatch = () => {
    if (session.match !== undefined) {
      step(session.match);
    }
  };
  const describeCurrentFrame = () => {
    if (session.match === undefined) {
      return describeBackdropFrame();
    }
    const view = matchView(session.match);
    return describeFrame(view);
  };
  const render = () => {
    const frame = describeCurrentFrame();
    drawFrame(context, sprites, frame);
  };
  startGameLoop(stepMatch, render);
}

start();
