// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import "./style.css";
import { loadFonts, loadSprites } from "./assets";
import { createAttractMode, stepAttractMode, type AttractMode } from "./core/attract";
import { adjustAim, createMatch, fire, matchView, step, type AimDelta, type Match } from "./core/match";
import { applyFit, applyOverlayFit, fitPlayingArea } from "./display";
import { describeAttractFrame, describeBackdropFrame, describeFrame } from "./frame";
import { startGameLoop } from "./gameLoop";
import { bindControls, bindEscape } from "./input";
import { MAIN_MENU_ITEMS, type Screen } from "./navigation";
import type { Point } from "./core/flight";
import { drawFrame, drawShakenFrame } from "./renderer";
import { bindBracketFlash, bindMainMenuButton, bindMenuButtonEffects, bindMenuFocusKeys, bindScreenRoutes, navigateBack, renderMenuItems, showScreen, traceTitleArc, type ScreenElements } from "./screens";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";
import { drawStars, renderStarSprites } from "./starLayer";
import { generateStars } from "./stars";

const STATIC_STAR_TIME_MS = 0;

interface MatchSession {
  screen: Screen;
  match: Match | undefined;
  attract: AttractMode | undefined;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

function createRandomMatch(): Match {
  const seed = randomSeed();
  return createMatch(seed);
}

function createRandomAttractMode(): AttractMode {
  const seed = randomSeed();
  return createAttractMode(seed);
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

  const session: MatchSession = { screen: "mainMenu", match: undefined, attract: undefined };

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
    session.attract = screen === "match" ? undefined : (session.attract ?? createRandomAttractMode());
    showScreen(elements, screen);
  };
  bindScreenRoutes(window, enterScreen);
  traceTitleArc(titleArc, reducedMotion);

  const isAttractModePlaying = () => session.screen === "mainMenu" && !reducedMotion.matches;
  const stepSimulation = () => {
    if (session.match !== undefined) {
      step(session.match);
    } else if (isAttractModePlaying()) {
      stepAttractMode(session.attract!);
    }
  };
  const describeCurrentFrame = () => {
    if (session.match !== undefined) {
      const view = matchView(session.match);
      return describeFrame(view);
    }
    const attractView = matchView(session.attract!.match);
    return describeAttractFrame(attractView);
  };
  const currentShake = (): Readonly<Point> => {
    if (reducedMotion.matches || session.match === undefined) {
      return NO_SHAKE;
    }
    const view = matchView(session.match);
    return screenShakeOffset(view, Math.random);
  };
  const backdropFrame = describeBackdropFrame();
  const stars = generateStars(Math.random);
  const starSprites = renderStarSprites();
  const render = (timeMs: number) => {
    const starTimeMs = reducedMotion.matches ? STATIC_STAR_TIME_MS : timeMs;
    const frame = describeCurrentFrame();
    const shake = currentShake();
    drawFrame(context, sprites, backdropFrame);
    drawStars(context, starSprites, stars, starTimeMs);
    drawShakenFrame(context, sprites, frame, shake);
  };
  startGameLoop(stepSimulation, render);
}

start();
