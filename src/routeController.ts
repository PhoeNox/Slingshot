// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { FixedRouteScreen, Route, Screen } from "./navigation";
import type { StartRemoteMatch } from "./remoteVisit";
import { enterRemoteMatch, enterScreen, stepScreenSession, type ScreenSession } from "./screenSession";
import { matchRulesFor, type Settings } from "./settings";

export type EnterRemoteRoute = (route: Route, startRemoteMatch: StartRemoteMatch) => void;

export interface RouteAdapters {
  showScreen: (screen: Screen) => void;
  navigateTo: (screen: FixedRouteScreen) => void;
  enterRemoteRoute: EnterRemoteRoute;
}

export interface RouteController {
  enterRoute: (route: Route) => void;
  stepSession: (reducedMotion: boolean) => void;
}

const SEED_RANGE = 2 ** 32;

export function randomSeed(random: () => number): number {
  return Math.floor(random() * SEED_RANGE);
}

export function createRouteController(
  session: ScreenSession,
  settings: Readonly<Settings>,
  adapters: RouteAdapters,
): RouteController {
  const enterRoute = (route: Route) => {
    const seed = randomSeed(session.random);
    const matchRules = matchRulesFor(settings);
    const startRemoteMatch: StartRemoteMatch = (role, link) => {
      enterRemoteMatch(session, role, link, seed, matchRules);
      adapters.showScreen("remoteMatch");
    };
    enterScreen(session, route.screen, seed, matchRules);
    adapters.enterRemoteRoute(route, startRemoteMatch);
    adapters.showScreen(route.screen);
  };
  const stepSession = (reducedMotion: boolean) => {
    const sessionStep = stepScreenSession(session, reducedMotion);
    if (sessionStep === "mainMenu") {
      adapters.navigateTo("mainMenu");
    }
  };
  return { enterRoute, stepSession };
}
