// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { MatchRules } from "./core/match";
import type { FixedRouteScreen } from "./navigation";
import { enterRoute, type RouteEntry, type ScreenSession, type VisitPorts } from "./screenSession";

export type VisitlessScreen = Exclude<FixedRouteScreen, "host">;

function noVisit(): never {
  throw new Error("expected no host or guest visit");
}

const NO_VISITS: VisitPorts = {
  peers: { host: noVisit, join: noVisit },
  relay: { awaitReplies: noVisit, deliverReply: noVisit },
  screens: { showHostState: noVisit, showGuestState: noVisit },
  showRemoteMatch: noVisit,
};

export function enterScreen(
  session: ScreenSession,
  screen: VisitlessScreen,
  seed: number,
  matchRules: Readonly<MatchRules>,
): void {
  const entry: RouteEntry = { route: { screen, replace: false }, seed, matchRules };
  enterRoute(session, entry, NO_VISITS);
}
