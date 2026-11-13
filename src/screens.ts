// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { COLOURS } from "./colours";
import { backTargetFor, hashFor, moveFocus, resolveHash, type FocusStep, type MenuItem, type Screen } from "./navigation";
import { scrambleLabel } from "./scramble";
import type { Settings } from "./settings";

export interface ScreenElements {
  overlay: HTMLElement;
  mainMenu: HTMLElement;
  settings: HTMLElement;
  contoursCheckbox: HTMLInputElement;
  credits: HTMLElement;
  creditsBackButton: HTMLButtonElement;
  keyHint: HTMLElement;
  canvas: HTMLCanvasElement;
}

const FOCUS_STEPS: Record<string, FocusStep> = {
  ArrowUp: -1,
  KeyW: -1,
  ArrowDown: 1,
  KeyS: 1,
};

const SCRAMBLE_DURATION_MS = 200;
const BRACKET_FLASH_KEYFRAMES: Keyframe[] = [{ color: COLOURS.lock }, { color: COLOURS.phosphor }];
const BRACKET_FLASH_OPTIONS: KeyframeAnimationOptions = { duration: 180, pseudoElement: "::before" };

const TITLE_ARC_TRACE_KEYFRAMES: Keyframe[] = [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }];
const TITLE_ARC_TRACE_OPTIONS: KeyframeAnimationOptions = {
  duration: 1400,
  delay: 300,
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  fill: "backwards",
};

export function renderMenuItems(menu: HTMLElement, items: readonly MenuItem[]): void {
  const buttons = items.map(menuButton);
  menu.replaceChildren(...buttons);
}

function menuButton(item: MenuItem): HTMLButtonElement {
  const hash = hashFor(item.screen);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = item.label;
  button.addEventListener("click", () => {
    location.hash = hash;
  });
  return button;
}

export function bindMenuFocusKeys(menu: HTMLElement): void {
  menu.addEventListener("keydown", (event) => {
    const step = FOCUS_STEPS[event.code];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const buttons = [...menu.querySelectorAll("button")];
    const focusedIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = moveFocus(focusedIndex, step, buttons.length);
    buttons[nextIndex].focus();
  });
}

export function bindMenuButtonEffects(button: HTMLButtonElement, reducedMotion: MediaQueryList): void {
  const label = button.textContent!;
  button.setAttribute("aria-label", label);
  button.addEventListener("pointerenter", () => {
    button.focus();
  });
  button.addEventListener("focus", () => {
    if (reducedMotion.matches || button.dataset.decoded !== undefined) {
      return;
    }
    button.dataset.decoded = "";
    playScramble(button, label);
  });
  bindBracketFlash(button);
}

export function bindBracketFlash(button: HTMLButtonElement): void {
  button.addEventListener("click", () => {
    button.animate(BRACKET_FLASH_KEYFRAMES, BRACKET_FLASH_OPTIONS);
  });
}

export function traceTitleArc(arc: SVGPathElement, reducedMotion: MediaQueryList): void {
  if (reducedMotion.matches) {
    return;
  }
  arc.animate(TITLE_ARC_TRACE_KEYFRAMES, TITLE_ARC_TRACE_OPTIONS);
}

function playScramble(button: HTMLButtonElement, label: string): void {
  const startTime = performance.now();
  const showScrambleFrame = (now: number) => {
    const progress = Math.min((now - startTime) / SCRAMBLE_DURATION_MS, 1);
    button.textContent = scrambleLabel(label, progress, Math.random);
    if (progress < 1) {
      requestAnimationFrame(showScrambleFrame);
    }
  };
  requestAnimationFrame(showScrambleFrame);
}

function resetScrambles(overlay: HTMLElement): void {
  const buttons = overlay.querySelectorAll("button");
  for (const button of buttons) {
    delete button.dataset.decoded;
  }
}

export function showScreen(elements: ScreenElements, screen: Screen): void {
  resetScrambles(elements.overlay);
  elements.overlay.hidden = screen === "match";
  elements.mainMenu.hidden = screen !== "mainMenu";
  elements.settings.hidden = screen !== "settings";
  elements.credits.hidden = screen !== "credits";
  elements.keyHint.style.visibility = screen === "match" ? "visible" : "hidden";
  if (screen === "mainMenu") {
    elements.mainMenu.querySelector("button")!.focus();
  }
  if (screen === "settings") {
    elements.contoursCheckbox.focus();
  }
  if (screen === "credits") {
    elements.creditsBackButton.focus();
  }
  if (screen === "match") {
    elements.canvas.focus();
  }
}

export function bindContoursCheckbox(
  checkbox: HTMLInputElement,
  settings: Settings,
  saveSettings: (settings: Readonly<Settings>) => void,
): void {
  checkbox.checked = settings.gravityWellContours;
  checkbox.addEventListener("change", () => {
    settings.gravityWellContours = checkbox.checked;
    saveSettings(settings);
  });
}

export function bindMainMenuButton(button: HTMLButtonElement): void {
  const mainMenuHash = hashFor("mainMenu");
  button.addEventListener("click", () => {
    location.hash = mainMenuHash;
  });
}

export function navigateBack(target: Window, screen: Screen): void {
  const backTarget = backTargetFor(screen);
  if (backTarget !== undefined) {
    target.location.hash = hashFor(backTarget);
  }
}

export function bindScreenRoutes(target: Window, enterScreen: (screen: Screen) => void): void {
  const applyHash = () => {
    const route = resolveHash(target.location.hash);
    if (route.replace) {
      const canonicalHash = hashFor(route.screen);
      target.history.replaceState(null, "", canonicalHash);
    }
    enterScreen(route.screen);
  };
  target.addEventListener("hashchange", applyHash);
  applyHash();
}
