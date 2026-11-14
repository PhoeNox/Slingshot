// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import type { FixedRouteScreen, Route, Screen } from "./navigation";
import type { PeerLink } from "./peerConnection";
import { encodeMessage } from "./remoteProtocol";
import type { StartRemoteMatch } from "./remoteVisit";
import { createRouteController, type RouteController } from "./routeController";
import { createScreenSession, type ScreenSession } from "./screenSession";
import { DEFAULT_SETTINGS } from "./settings";

interface FakeLink {
  link: PeerLink;
  receive: (text: string) => void;
  closed: boolean;
}

interface PendingConnection {
  closed: boolean;
}

interface Harness {
  session: ScreenSession;
  controller: RouteController;
  shownScreens: Screen[];
  navigations: FixedRouteScreen[];
  pendingConnections: PendingConnection[];
  startRemoteMatch: () => StartRemoteMatch;
}

const SEED = 7;
const END_NOTICE_STEPS = 90;
const MAIN_MENU: Route = { screen: "mainMenu", replace: false };
const HOST: Route = { screen: "host", replace: false };
const GUEST: Route = { screen: "guest", replace: false, offerCode: "a1B2-c_3", roomSecret: "s3_Cr-t" };
const ROUTES: readonly Route[] = [
  MAIN_MENU,
  { screen: "playMenu", replace: false },
  { screen: "match", replace: false },
  { screen: "settings", replace: false },
  { screen: "credits", replace: false },
  HOST,
  GUEST,
];

function fakeLink(): FakeLink {
  const fake = { receive: () => {}, closed: false } as unknown as FakeLink;
  fake.link = {
    send: () => {},
    onMessage: (listener) => {
      fake.receive = listener;
    },
    closed: new Promise<void>(() => {}),
    close: () => {
      fake.closed = true;
    },
  };
  return fake;
}

function harness(): Harness {
  const session = createScreenSession(SEED, Math.random);
  const shownScreens: Screen[] = [];
  const navigations: FixedRouteScreen[] = [];
  const pendingConnections: PendingConnection[] = [];
  let pending: PendingConnection | undefined;
  let handOver: StartRemoteMatch | undefined;
  const controller = createRouteController(session, { ...DEFAULT_SETTINGS }, {
    showScreen: (screen) => {
      shownScreens.push(screen);
    },
    navigateTo: (screen) => {
      navigations.push(screen);
      controller.enterRoute({ screen, replace: false });
    },
    enterRemoteRoute: (route, startRemoteMatch) => {
      if (pending !== undefined) {
        pending.closed = true;
      }
      pending = undefined;
      handOver = startRemoteMatch;
      if (route.screen === "host" || route.screen === "guest") {
        pending = { closed: false };
        pendingConnections.push(pending);
      }
    },
  });
  return { session, controller, shownScreens, navigations, pendingConnections, startRemoteMatch: () => handOver! };
}

function enterRemoteMatch(h: Harness, route: Route): FakeLink {
  const link = fakeLink();
  h.controller.enterRoute(route);
  const role = route.screen === "host" ? "host" : "guest";
  h.startRemoteMatch()(role, link.link);
  return link;
}

describe("entering a route", () => {
  test.each(ROUTES)("shows the screen of %j", (route) => {
    const h = harness();
    h.controller.enterRoute(route);
    expect(h.session.state.screen).toBe(route.screen);
    expect(h.shownScreens).toEqual([route.screen]);
  });

  test("shows the remote match once the link is handed over", () => {
    const h = harness();
    enterRemoteMatch(h, HOST);
    expect(h.session.state.screen).toBe("remoteMatch");
    expect(h.shownScreens).toEqual(["host", "remoteMatch"]);
  });
});

describe("leaving a remote match", () => {
  test.each(ROUTES)("for %j closes its link", (route) => {
    const h = harness();
    const link = enterRemoteMatch(h, GUEST);
    h.controller.enterRoute(route);
    expect(link.closed).toBe(true);
    expect(h.session.state.screen).toBe(route.screen);
  });
});

describe("leaving a host or guest route while connecting", () => {
  test.each([HOST, GUEST])("ends the visit of %j", (visitedRoute) => {
    const h = harness();
    h.controller.enterRoute(visitedRoute);
    h.controller.enterRoute(MAIN_MENU);
    expect(h.pendingConnections).toEqual([{ closed: true }]);
  });

  test("ends the visit when another visit starts", () => {
    const h = harness();
    h.controller.enterRoute(HOST);
    h.controller.enterRoute(GUEST);
    expect(h.pendingConnections).toEqual([{ closed: true }, { closed: false }]);
  });
});

describe("a finished remote match", () => {
  test("leads to the main menu route once its notice has run out", () => {
    const h = harness();
    const link = enterRemoteMatch(h, GUEST);
    link.receive(encodeMessage({ kind: "leave" }));
    for (let i = 0; i < END_NOTICE_STEPS - 1; i++) {
      h.controller.stepSession(false);
    }
    expect(h.navigations).toEqual([]);
    h.controller.stepSession(false);
    expect(h.navigations).toEqual(["mainMenu"]);
    expect(h.session.state.screen).toBe("mainMenu");
    expect(h.shownScreens.at(-1)).toBe("mainMenu");
  });
});
