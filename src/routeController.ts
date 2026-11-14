// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { FixedRouteScreen, Route, Screen } from "./navigation";
import type { PeerConnectors } from "./remoteVisit";
import type { ReplyRelay } from "./replyRelay";
import {
  enterRoute as enterSessionRoute,
  stepScreenSession,
  type RouteEntry,
  type ScreenSession,
  type VisitPorts,
  type VisitScreens,
} from "./screenSession";
import { matchRulesFor, type Settings } from "./settings";

export interface RouteAdapters {
  showScreen: (screen: Screen) => void;
  navigateTo: (screen: FixedRouteScreen) => void;
  peers: PeerConnectors;
  relay: ReplyRelay;
  visitScreens: VisitScreens;
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
  const visits: VisitPorts = {
    peers: adapters.peers,
    relay: adapters.relay,
    screens: adapters.visitScreens,
    showRemoteMatch: () => adapters.showScreen("remoteMatch"),
  };
  const enterRoute = (route: Route) => {
    const seed = randomSeed(session.random);
    const matchRules = matchRulesFor(settings);
    const entry: RouteEntry = { route, seed, matchRules };
    enterSessionRoute(session, entry, visits);
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
