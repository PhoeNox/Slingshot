// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { backTargetFor, hashFor, resolveHash, type MenuItem, type Screen } from "./navigation";

export interface ScreenElements {
  overlay: HTMLElement;
  mainMenu: HTMLElement;
  keyHint: HTMLElement;
  canvas: HTMLCanvasElement;
}

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

export function showScreen(elements: ScreenElements, screen: Screen): void {
  elements.overlay.hidden = screen === "match";
  elements.mainMenu.hidden = screen !== "mainMenu";
  elements.keyHint.style.visibility = screen === "match" ? "visible" : "hidden";
  if (screen === "mainMenu") {
    elements.mainMenu.querySelector("button")!.focus();
  }
  if (screen === "match") {
    elements.canvas.focus();
  }
}

export function bindMatchMenuButton(button: HTMLButtonElement): void {
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
