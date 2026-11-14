// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import "./style.css";
import { loadFonts, loadSprites } from "./assets";
import type { AimDelta } from "./core/match";
import { applyFit, applyOverlayFit, fitPlayingArea } from "./display";
import { describeBackdropFrame } from "./frame";
import { startGameLoop } from "./gameLoop";
import { bindControls, bindEscape } from "./input";
import { hashFor, MAIN_MENU_ITEMS, PLAY_MENU_ITEMS, type Route } from "./navigation";
import type { PeerLink } from "./peerConnection";
import type { RemoteRole } from "./remoteMatch";
import { bindRemoteMatchScreens, type GuestScreenElements, type HostScreenElements } from "./remoteMatchScreens";
import { drawFrame, drawShakenFrame } from "./renderer";
import { bindBracketFlash, bindMainMenuButton, bindMenuButtonEffects, bindMenuFocusKeys, bindScreenRoutes, bindSettingControls, bindSettingsTabs, navigateBack, renderMenuItems, showScreen, traceTitleArc, type ScreenElements } from "./screens";
import { matchRulesFor, parseSettings, serialiseSettings, type Settings } from "./settings";
import { readStoredSettings, writeStoredSettings } from "./settingsStorage";
import {
  aimMatch,
  createScreenSession,
  describeScreenSessionFrame,
  enterRemoteMatch,
  enterScreen,
  fireMatch,
  isMatchActive,
  stepScreenSession,
} from "./screenSession";
import { drawStars, renderStarSprites } from "./starLayer";
import { generateStars } from "./stars";

const STATIC_STAR_TIME_MS = 0;

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

function saveSettings(settings: Readonly<Settings>): void {
  const serialised = serialiseSettings(settings);
  writeStoredSettings(window, serialised);
}

async function start(): Promise<void> {
  const stage = document.querySelector<HTMLElement>("#stage")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const context = canvas.getContext("2d")!;
  const elements: ScreenElements = {
    overlay: document.querySelector<HTMLElement>("#overlay")!,
    mainMenu: document.querySelector<HTMLElement>("#main-menu")!,
    playMenu: document.querySelector<HTMLElement>("#play-menu")!,
    settings: document.querySelector<HTMLElement>("#settings")!,
    settingsTabs: document.querySelector<HTMLElement>("#settings .settings-tabs")!,
    credits: document.querySelector<HTMLElement>("#credits")!,
    creditsBackButton: document.querySelector<HTMLButtonElement>("#credits-back-button")!,
    host: document.querySelector<HTMLElement>("#host")!,
    hostBackButton: document.querySelector<HTMLButtonElement>("#host-back-button")!,
    guest: document.querySelector<HTMLElement>("#guest")!,
    guestBackButton: document.querySelector<HTMLButtonElement>("#guest-back-button")!,
    keyHint: document.querySelector<HTMLElement>(".key-hint")!,
    canvas,
  };
  const hostElements: HostScreenElements = {
    invitationField: document.querySelector<HTMLElement>("#invitation-field")!,
    invitationLink: document.querySelector<HTMLInputElement>("#invitation-link")!,
    invitationCopyButton: document.querySelector<HTMLButtonElement>("#invitation-copy-button")!,
    replyForm: document.querySelector<HTMLFormElement>("#reply-form")!,
    replyFields: document.querySelector<HTMLFieldSetElement>("#reply-form fieldset")!,
    replyCodeInput: document.querySelector<HTMLInputElement>("#reply-code-input")!,
    status: document.querySelector<HTMLElement>("#host-status")!,
  };
  const guestElements: GuestScreenElements = {
    replyCodeField: document.querySelector<HTMLElement>("#reply-code-field")!,
    replyCode: document.querySelector<HTMLInputElement>("#reply-code")!,
    replyCodeCopyButton: document.querySelector<HTMLButtonElement>("#reply-code-copy-button")!,
    status: document.querySelector<HTMLElement>("#guest-status")!,
  };
  const menu = document.querySelector<HTMLElement>("#main-menu .menu")!;
  const playMenu = document.querySelector<HTMLElement>("#play-menu .menu")!;
  const matchMenuButton = document.querySelector<HTMLButtonElement>("#match-menu-button")!;
  const settingsBackButton = document.querySelector<HTMLButtonElement>("#settings-back-button")!;
  const titleArc = document.querySelector<SVGPathElement>("#main-menu .title-arc path")!;

  const sprites = await loadSprites();
  await loadFonts();

  const session = createScreenSession(randomSeed(), Math.random);
  const storedSettings = readStoredSettings(window);
  const settings = parseSettings(storedSettings);

  const fitStage = () => {
    const fit = fitPlayingArea(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
    applyFit(canvas, context, fit);
    applyOverlayFit(elements.overlay, fit);
  };
  window.addEventListener("resize", fitStage);
  fitStage();

  const isSessionMatchActive = () => isMatchActive(session);
  const aimSessionMatch = (delta: AimDelta) => aimMatch(session, delta);
  const fireSessionMatch = () => fireMatch(session);
  bindControls(window, isSessionMatchActive, aimSessionMatch, fireSessionMatch);

  const navigateBackFromCurrentScreen = () => navigateBack(window, session.state.screen);
  bindEscape(window, navigateBackFromCurrentScreen);

  renderMenuItems(menu, MAIN_MENU_ITEMS);
  bindMenuFocusKeys(menu);
  renderMenuItems(playMenu, PLAY_MENU_ITEMS);
  bindMenuFocusKeys(playMenu);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const menuButtons = elements.overlay.querySelectorAll<HTMLButtonElement>(".menu button");
  for (const button of menuButtons) {
    bindMenuButtonEffects(button, reducedMotion);
  }
  bindBracketFlash(matchMenuButton);
  bindMainMenuButton(matchMenuButton);
  bindMainMenuButton(settingsBackButton);
  bindMainMenuButton(elements.creditsBackButton);
  bindMainMenuButton(elements.hostBackButton);
  bindMainMenuButton(elements.guestBackButton);
  const codeButtons = elements.overlay.querySelectorAll<HTMLButtonElement>(".code-button");
  for (const button of codeButtons) {
    bindBracketFlash(button);
  }
  bindSettingsTabs(elements.settingsTabs);
  bindSettingControls(elements.settings, settings, saveSettings);
  const startRemoteMatch = (role: RemoteRole, link: PeerLink) => {
    enterRemoteMatch(session, role, link, settings);
    showScreen(elements, "remoteMatch");
  };
  const enterRemoteRoute = bindRemoteMatchScreens(window, hostElements, guestElements, startRemoteMatch);
  const enterAndShowRoute = (route: Route) => {
    const seed = randomSeed();
    const matchRules = matchRulesFor(settings);
    enterScreen(session, route.screen, seed, matchRules);
    enterRemoteRoute(route);
    showScreen(elements, route.screen);
  };
  bindScreenRoutes(window, enterAndShowRoute);
  traceTitleArc(titleArc, reducedMotion);

  const mainMenuHash = hashFor("mainMenu");
  const stepSimulation = () => {
    const sessionStep = stepScreenSession(session, reducedMotion.matches);
    if (sessionStep === "mainMenu") {
      location.hash = mainMenuHash;
    }
  };
  const backdropFrame = describeBackdropFrame();
  const stars = generateStars(Math.random);
  const starSprites = renderStarSprites();
  const render = (timeMs: number) => {
    const starTimeMs = reducedMotion.matches ? STATIC_STAR_TIME_MS : timeMs;
    const frame = describeScreenSessionFrame(session, settings, reducedMotion.matches);
    drawFrame(context, sprites, backdropFrame);
    drawStars(context, starSprites, stars, starTimeMs);
    drawShakenFrame(context, sprites, frame.items, frame.shake);
  };
  startGameLoop(stepSimulation, render);
}

start();
