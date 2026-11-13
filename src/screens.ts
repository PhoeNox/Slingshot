// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { backTargetFor, hashFor, moveFocus, resolveHash, type FocusStep, type MenuItem, type Screen } from "./navigation";

export interface ScreenElements {
  overlay: HTMLElement;
  mainMenu: HTMLElement;
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

export function showScreen(elements: ScreenElements, screen: Screen): void {
  elements.overlay.hidden = screen === "match";
  elements.mainMenu.hidden = screen !== "mainMenu";
  elements.credits.hidden = screen !== "credits";
  elements.keyHint.style.visibility = screen === "match" ? "visible" : "hidden";
  if (screen === "mainMenu") {
    elements.mainMenu.querySelector("button")!.focus();
  }
  if (screen === "credits") {
    elements.creditsBackButton.focus();
  }
  if (screen === "match") {
    elements.canvas.focus();
  }
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
