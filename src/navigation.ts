// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

export type Screen = "mainMenu" | "match" | "credits";

export interface Route {
  screen: Screen;
  replace: boolean;
}

export interface MenuItem {
  label: string;
  screen: Screen;
}

const SCREENS: readonly Screen[] = ["mainMenu", "match", "credits"];

const SCREEN_HASHES: Record<Screen, string> = {
  mainMenu: "#/",
  match: "#/play",
  credits: "#/credits",
};

export const MAIN_MENU_ITEMS: readonly MenuItem[] = [{ label: "Play", screen: "match" }];

export function resolveHash(hash: string): Route {
  const canonicalHash = hash === "" ? SCREEN_HASHES.mainMenu : hash;
  const screen = SCREENS.find((candidate) => SCREEN_HASHES[candidate] === canonicalHash);
  if (screen === undefined) {
    return { screen: "mainMenu", replace: true };
  }
  return { screen, replace: false };
}

export function hashFor(screen: Screen): string {
  return SCREEN_HASHES[screen];
}
