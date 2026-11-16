// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import "./style.css";
import { loadFonts, loadSounds, loadSprites } from "./assets";
import { bindAudioContext, loopedMusic, soundEffectPlayer, type PlaySoundEffect } from "./audio";
import { applyFit, applyOverlayFit, fitPlayingArea } from "./display";
import { hudScaleFor } from "./frame";
import { startGameLoop } from "./gameLoop";
import { createHashNavigation, windowHashLocation } from "./hashNavigation";
import { bindEscape, bindPlayerInput } from "./input";
import { MAIN_MENU_ITEMS, PLAY_MENU_ITEMS } from "./navigation";
import { hostPeerConnection, joinPeerConnection } from "./peerConnection";
import { bindRemoteMatchScreens, type GuestScreenElements, type HostScreenElements } from "./remoteMatchScreens";
import type { PeerConnectors } from "./remoteVisit";
import { drawLayers } from "./renderer";
import { nostrReplyRelay } from "./replyRelay";
import { bindBracketFlash, bindFullscreenButton, bindFullscreenToggle, bindMainMenuButton, bindMenuButtonEffects, bindMenuFocusKeys, bindMenuSelectSound, bindSettingControls, bindSettingsTabs, locateScreenElements, renderMenuItems, screenPanel, showGestureHint, showScreen, traceTitleArc } from "./screens";
import { localSettingsStorage } from "./settingsStorage";
import { createSettingsStore } from "./settingsStore";
import { createScreenSession, type ScreenSessionAdapters } from "./screenSession";
import { renderStarSprites } from "./starLayer";
import { generateStars } from "./stars";
import { screenWakeLock } from "./wakeLock";

async function start(): Promise<void> {
  const stage = document.querySelector<HTMLElement>("#stage")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const context = canvas.getContext("2d")!;
  const overlay = document.querySelector<HTMLElement>("#overlay")!;
  const keyHint = document.querySelector<HTMLElement>(".key-hint")!;
  const elements = locateScreenElements(overlay, keyHint, canvas);
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
  const mainMenuButtons = document.querySelectorAll<HTMLButtonElement>("[data-main-menu-button]");
  const titleArc = document.querySelector<SVGPathElement>("#main-menu .title-arc path")!;

  const audioContext = new AudioContext();
  bindAudioContext(window, audioContext);

  const sprites = await loadSprites();
  await loadFonts();
  const sounds = await loadSounds(audioContext);
  const music = loopedMusic(audioContext, sounds.music);

  const settingsStorage = localSettingsStorage(window);
  const settings = createSettingsStore(settingsStorage);
  const playEffect = soundEffectPlayer(audioContext, sounds);
  const playSoundEffect: PlaySoundEffect = (effect) => {
    if (settings.current().soundEffects) {
      playEffect(effect);
    }
  };

  let hudScale = 1;
  const fitStage = () => {
    const fit = fitPlayingArea(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
    applyFit(canvas, context, fit);
    applyOverlayFit(elements.overlay, fit);
    hudScale = hudScaleFor(fit.cssScale);
  };
  window.addEventListener("resize", fitStage);
  fitStage();

  const hashLocation = windowHashLocation(window);
  const navigation = createHashNavigation(hashLocation);

  renderMenuItems(menu, MAIN_MENU_ITEMS, navigation.navigateTo);
  bindMenuFocusKeys(menu);
  renderMenuItems(playMenu, PLAY_MENU_ITEMS, navigation.navigateTo);
  bindMenuFocusKeys(playMenu);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const menuButtons = elements.overlay.querySelectorAll<HTMLButtonElement>(".menu button");
  for (const button of menuButtons) {
    bindMenuButtonEffects(button, reducedMotion);
  }
  bindBracketFlash(matchMenuButton);
  bindBracketFlash(rotateFullscreenButton);
  bindFullscreenButton(rotateFullscreenButton, window);
  bindBracketFlash(fullscreenToggleButton);
  bindFullscreenToggle(fullscreenToggleButton, window);
  for (const button of mainMenuButtons) {
    bindMainMenuButton(button, navigation.navigateTo);
  }
  const codeButtons = elements.overlay.querySelectorAll<HTMLButtonElement>(".code-button");
  for (const button of codeButtons) {
    bindBracketFlash(button);
  }
  const settingsPanel = screenPanel(elements, "settings");
  const settingsTabs = settingsPanel.querySelector<HTMLElement>(".settings-tabs")!;
  bindSettingsTabs(settingsTabs);
  bindSettingControls(settingsPanel, settings);
  bindMenuSelectSound(elements.overlay, playSoundEffect);
  const peers: PeerConnectors = { host: hostPeerConnection, join: joinPeerConnection };
  const relay = nostrReplyRelay();
  const submitReply = (replyCode: string) => {
    session.submitReplyCode(replyCode);
  };
  const visitScreens = bindRemoteMatchScreens(window, hostElements, guestElements, submitReply);
  const sessionAdapters: ScreenSessionAdapters = {
    random: Math.random,
    settings,
    showScreen: (screen) => showScreen(elements, screen),
    navigateTo: navigation.navigateTo,
    peers,
    relay,
    visitScreens,
    playSoundEffect,
  };
  const session = createScreenSession(sessionAdapters);

  bindPlayerInput(window, session);

  const navigateBackFromCurrentScreen = () => navigation.navigateBack(session.screen());
  bindEscape(window, navigateBackFromCurrentScreen);

  navigation.bindRoutes(session.enterRoute);
  traceTitleArc(titleArc, reducedMotion);

  const wakeLock = screenWakeLock(window);
  const stepSimulation = () => {
    session.step(reducedMotion.matches);
    const awake = session.keepsScreenAwake();
    wakeLock.keepAwake(awake);
    const musicOn = settings.current().music;
    music.keepPlaying(musicOn);
  };
  const stars = generateStars(Math.random);
  const starSprites = renderStarSprites();
  const render = (timeMs: number) => {
    const frame = session.describeFrame(stars, settings.display(), hudScale, reducedMotion.matches, timeMs);
    drawLayers(context, sprites, starSprites, frame);
    const gestureHintShown = session.awaitsFirstShot();
    showGestureHint(elements.keyHint, gestureHintShown);
  };
  startGameLoop(stepSimulation, render);
}

start();
