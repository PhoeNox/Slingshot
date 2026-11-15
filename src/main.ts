// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import "./style.css";
import { loadFonts, loadSprites } from "./assets";
import { applyFit, applyOverlayFit, fitPlayingArea } from "./display";
import { hudScaleFor } from "./frame";
import { startGameLoop } from "./gameLoop";
import { bindEscape, bindPlayerInput } from "./input";
import { MAIN_MENU_ITEMS, PLAY_MENU_ITEMS } from "./navigation";
import { hostPeerConnection, joinPeerConnection } from "./peerConnection";
import { bindRemoteMatchScreens, type GuestScreenElements, type HostScreenElements } from "./remoteMatchScreens";
import type { PeerConnectors } from "./remoteVisit";
import { drawLayers } from "./renderer";
import { nostrReplyRelay } from "./replyRelay";
import { createRouteController, randomSeed, type RouteAdapters } from "./routeController";
import { bindBracketFlash, bindFullscreenButton, bindFullscreenToggle, bindMainMenuButton, bindMenuButtonEffects, bindMenuFocusKeys, bindScreenRoutes, bindSettingControls, bindSettingsTabs, navigateBack, navigateTo, renderMenuItems, showGestureHint, showScreen, traceTitleArc, type ScreenElements } from "./screens";
import { localSettingsStorage } from "./settingsStorage";
import { createSettingsStore } from "./settingsStore";
import { awaitsFirstShot, createScreenSession, describeScreenSessionFrame, keepsScreenAwake, submitReplyCode } from "./screenSession";
import { renderStarSprites } from "./starLayer";
import { generateStars } from "./stars";
import { screenWakeLock } from "./wakeLock";

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
    invitationShareButton: document.querySelector<HTMLButtonElement>("#invitation-share-button")!,
    replyForm: document.querySelector<HTMLFormElement>("#reply-form")!,
    replyFields: document.querySelector<HTMLFieldSetElement>("#reply-form fieldset")!,
    replyCodeInput: document.querySelector<HTMLInputElement>("#reply-code-input")!,
    status: document.querySelector<HTMLElement>("#host-status")!,
  };
  const guestElements: GuestScreenElements = {
    replyCodeField: document.querySelector<HTMLElement>("#reply-code-field")!,
    replyCode: document.querySelector<HTMLInputElement>("#reply-code")!,
    replyCodeCopyButton: document.querySelector<HTMLButtonElement>("#reply-code-copy-button")!,
    replyCodeShareButton: document.querySelector<HTMLButtonElement>("#reply-code-share-button")!,
    status: document.querySelector<HTMLElement>("#guest-status")!,
  };
  const menu = document.querySelector<HTMLElement>("#main-menu .menu")!;
  const playMenu = document.querySelector<HTMLElement>("#play-menu .menu")!;
  const matchMenuButton = document.querySelector<HTMLButtonElement>("#match-menu-button")!;
  const rotateFullscreenButton = document.querySelector<HTMLButtonElement>("#rotate-fullscreen-button")!;
  const fullscreenToggleButton = document.querySelector<HTMLButtonElement>("#fullscreen-toggle-button")!;
  const settingsBackButton = document.querySelector<HTMLButtonElement>("#settings-back-button")!;
  const titleArc = document.querySelector<SVGPathElement>("#main-menu .title-arc path")!;

  const sprites = await loadSprites();
  await loadFonts();

  const session = createScreenSession(randomSeed(Math.random), Math.random);
  const settingsStorage = localSettingsStorage(window);
  const settings = createSettingsStore(settingsStorage);

  let hudScale = 1;
  const fitStage = () => {
    const fit = fitPlayingArea(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
    applyFit(canvas, context, fit);
    applyOverlayFit(elements.overlay, fit);
    hudScale = hudScaleFor(fit.cssScale);
  };
  window.addEventListener("resize", fitStage);
  fitStage();

  bindPlayerInput(window, session);

  const navigateBackFromCurrentScreen = () => navigateBack(window, session.screen);
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
  bindBracketFlash(rotateFullscreenButton);
  bindFullscreenButton(rotateFullscreenButton, window);
  bindBracketFlash(fullscreenToggleButton);
  bindFullscreenToggle(fullscreenToggleButton, window);
  bindMainMenuButton(settingsBackButton);
  bindMainMenuButton(elements.creditsBackButton);
  bindMainMenuButton(elements.hostBackButton);
  bindMainMenuButton(elements.guestBackButton);
  const codeButtons = elements.overlay.querySelectorAll<HTMLButtonElement>(".code-button");
  for (const button of codeButtons) {
    bindBracketFlash(button);
  }
  bindSettingsTabs(elements.settingsTabs);
  bindSettingControls(elements.settings, settings);
  const peers: PeerConnectors = { host: hostPeerConnection, join: joinPeerConnection };
  const relay = nostrReplyRelay();
  const submitReply = (replyCode: string) => {
    submitReplyCode(session, replyCode);
  };
  const visitScreens = bindRemoteMatchScreens(window, hostElements, guestElements, submitReply);
  const routeAdapters: RouteAdapters = {
    showScreen: (screen) => showScreen(elements, screen),
    navigateTo: (screen) => navigateTo(window, screen),
    peers,
    relay,
    visitScreens,
  };
  const routes = createRouteController(session, settings, routeAdapters);
  bindScreenRoutes(window, routes.enterRoute);
  traceTitleArc(titleArc, reducedMotion);

  const wakeLock = screenWakeLock(window);
  const stepSimulation = () => {
    routes.stepSession(reducedMotion.matches);
    const awake = keepsScreenAwake(session);
    wakeLock.keepAwake(awake);
  };
  const stars = generateStars(Math.random);
  const starSprites = renderStarSprites();
  const render = (timeMs: number) => {
    const frame = describeScreenSessionFrame(session, stars, settings.display(), hudScale, reducedMotion.matches, timeMs);
    drawLayers(context, sprites, starSprites, frame);
    const gestureHintShown = awaitsFirstShot(session);
    showGestureHint(elements.keyHint, gestureHintShown);
  };
  startGameLoop(stepSimulation, render);
}

start();
