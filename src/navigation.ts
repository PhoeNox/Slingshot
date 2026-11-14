// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

export type Screen = "mainMenu" | "playMenu" | "match" | "remoteMatch" | "settings" | "credits" | "host" | "guest";

export type RouteScreen = Exclude<Screen, "remoteMatch">;

export type FixedRouteScreen = Exclude<RouteScreen, "guest">;

export type Route =
  | { screen: FixedRouteScreen; replace: boolean }
  | { screen: "guest"; replace: false; offerCode: string };

export type FocusStep = -1 | 1;

export interface MenuItem {
  label: string;
  screen: FixedRouteScreen;
}

const FIXED_ROUTE_SCREENS: readonly FixedRouteScreen[] = ["mainMenu", "playMenu", "match", "settings", "credits", "host"];

const SCREEN_HASHES: Record<FixedRouteScreen, string> = {
  mainMenu: "#/",
  playMenu: "#/play-menu",
  match: "#/play",
  settings: "#/settings",
  credits: "#/credits",
  host: "#/host",
};

const INVITATION_HASH_PREFIX = "#/join/";

const ATTRACT_PLAYING_SCREENS: ReadonlySet<Screen> = new Set(["mainMenu", "playMenu", "settings"]);

const BACK_TARGETS: Record<Screen, FixedRouteScreen | undefined> = {
  mainMenu: undefined,
  playMenu: "mainMenu",
  match: "mainMenu",
  remoteMatch: "mainMenu",
  settings: "mainMenu",
  credits: "mainMenu",
  host: "mainMenu",
  guest: "mainMenu",
};

export const MAIN_MENU_ITEMS: readonly MenuItem[] = [
  { label: "Play", screen: "playMenu" },
  { label: "Settings", screen: "settings" },
  { label: "Credits", screen: "credits" },
];

export const PLAY_MENU_ITEMS: readonly MenuItem[] = [
  { label: "Hot-seat", screen: "match" },
  { label: "Host remote match", screen: "host" },
  { label: "Back", screen: "mainMenu" },
];

export function resolveHash(hash: string): Route {
  if (hash.startsWith(INVITATION_HASH_PREFIX) && hash.length > INVITATION_HASH_PREFIX.length) {
    return { screen: "guest", replace: false, offerCode: hash.slice(INVITATION_HASH_PREFIX.length) };
  }
  const canonicalHash = hash === "" ? SCREEN_HASHES.mainMenu : hash;
  const screen = FIXED_ROUTE_SCREENS.find((candidate) => SCREEN_HASHES[candidate] === canonicalHash);
  if (screen === undefined) {
    return { screen: "mainMenu", replace: true };
  }
  return { screen, replace: false };
}

export function hashFor(screen: FixedRouteScreen): string {
  return SCREEN_HASHES[screen];
}

export function invitationHash(offerCode: string): string {
  return `${INVITATION_HASH_PREFIX}${offerCode}`;
}

export function backTargetFor(screen: Screen): FixedRouteScreen | undefined {
  return BACK_TARGETS[screen];
}

export function showsMatch(screen: Screen): boolean {
  return screen === "match" || screen === "remoteMatch";
}

export function playsAttractMode(screen: Screen, reducedMotion: boolean): boolean {
  return ATTRACT_PLAYING_SCREENS.has(screen) && !reducedMotion;
}

export function moveFocus(index: number, step: FocusStep, itemCount: number): number {
  return (index + step + itemCount) % itemCount;
}
