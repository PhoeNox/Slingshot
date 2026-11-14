// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FixedRouteScreen, Route, Screen } from "./navigation";
import type { GuestReply, HostInvitation, PeerLink } from "./peerConnection";
import { encodeMessage } from "./remoteProtocol";
import type { PeerConnectors } from "./remoteVisit";
import type { ReplyRelay } from "./replyRelay";
import { createRouteController, type RouteController } from "./routeController";
import { createScreenSession, submitReplyCode, type ScreenSession } from "./screenSession";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import type { VisitState } from "./visitTransition";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface FakeLink {
  link: PeerLink;
  receive: (text: string) => void;
  closed: boolean;
}

interface FakeInvitation {
  connected: Deferred<HostInvitation>;
  accepted: Deferred<PeerLink>;
  replyCodes: string[];
  closed: boolean;
}

interface FakeReply {
  joined: Deferred<GuestReply>;
  opened: Deferred<PeerLink>;
  offerCode: string;
  closed: boolean;
}

interface FakeRoom {
  onReply: (replyCode: string) => void;
  closed: boolean;
}

interface Harness {
  session: ScreenSession;
  settings: Settings;
  controller: RouteController;
  shownScreens: Screen[];
  navigations: FixedRouteScreen[];
  hostStates: VisitState[];
  guestStates: VisitState[];
  invitations: FakeInvitation[];
  replies: FakeReply[];
  rooms: FakeRoom[];
}

const SEED = 7;
const END_NOTICE_STEPS = 90;
const OFFER_CODE = "a1B2-c_3";
const ROOM_SECRET = "s3_Cr-t";
const REPLY_CODE = "r3pLy";
const MAIN_MENU: Route = { screen: "mainMenu", replace: false };
const HOST: Route = { screen: "host", replace: false };
const GUEST: Route = { screen: "guest", replace: false, offerCode: OFFER_CODE, roomSecret: ROOM_SECRET };
const ROUTES: readonly Route[] = [
  MAIN_MENU,
  { screen: "playMenu", replace: false },
  { screen: "match", replace: false },
  { screen: "settings", replace: false },
  { screen: "credits", replace: false },
  HOST,
  GUEST,
];
const realSetTimeout = globalThis.setTimeout;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function flush(): Promise<void> {
  return new Promise((resolve) => realSetTimeout(resolve, 0));
}

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

function fakePeers(invitations: FakeInvitation[], replies: FakeReply[]): PeerConnectors {
  const host = () => {
    const fake: FakeInvitation = { connected: deferred(), accepted: deferred(), replyCodes: [], closed: false };
    invitations.push(fake);
    fake.connected.resolve({
      offerCode: OFFER_CODE,
      accept: (replyCode) => {
        fake.replyCodes.push(replyCode);
        return fake.accepted.promise;
      },
      close: () => {
        fake.closed = true;
      },
    });
    return fake.connected.promise;
  };
  const join = (offerCode: string) => {
    const fake: FakeReply = { joined: deferred(), opened: deferred(), offerCode, closed: false };
    replies.push(fake);
    fake.joined.resolve({
      replyCode: REPLY_CODE,
      opened: fake.opened.promise,
      close: () => {
        fake.closed = true;
      },
    });
    return fake.joined.promise;
  };
  return { host, join };
}

function fakeRelay(rooms: FakeRoom[]): ReplyRelay {
  const awaitReplies = async (onReply: (replyCode: string) => void) => {
    const room: FakeRoom = { onReply, closed: false };
    rooms.push(room);
    const close = () => {
      room.closed = true;
    };
    return { roomSecret: ROOM_SECRET, close };
  };
  const deliverReply = async () => "accepted" as const;
  return { awaitReplies, deliverReply };
}

function harness(): Harness {
  const session = createScreenSession(SEED, Math.random);
  const settings: Settings = { ...DEFAULT_SETTINGS };
  const shownScreens: Screen[] = [];
  const navigations: FixedRouteScreen[] = [];
  const hostStates: VisitState[] = [];
  const guestStates: VisitState[] = [];
  const invitations: FakeInvitation[] = [];
  const replies: FakeReply[] = [];
  const rooms: FakeRoom[] = [];
  const controller = createRouteController(session, settings, {
    showScreen: (screen) => {
      shownScreens.push(screen);
    },
    navigateTo: (screen) => {
      navigations.push(screen);
      controller.enterRoute({ screen, replace: false });
    },
    peers: fakePeers(invitations, replies),
    relay: fakeRelay(rooms),
    visitScreens: {
      showHostState: (state) => hostStates.push(state),
      showGuestState: (state) => guestStates.push(state),
    },
  });
  return { session, settings, controller, shownScreens, navigations, hostStates, guestStates, invitations, replies, rooms };
}

async function handOverHost(h: Harness): Promise<FakeLink> {
  const link = fakeLink();
  h.controller.enterRoute(HOST);
  await flush();
  submitReplyCode(h.session, REPLY_CODE);
  h.invitations.at(-1)!.accepted.resolve(link.link);
  await flush();
  return link;
}

async function handOverGuest(h: Harness): Promise<FakeLink> {
  const link = fakeLink();
  h.controller.enterRoute(GUEST);
  await flush();
  h.replies.at(-1)!.opened.resolve(link.link);
  await flush();
  return link;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("entering a route", () => {
  test.each(ROUTES)("shows the screen of %j", (route) => {
    const h = harness();
    h.controller.enterRoute(route);
    expect(h.session.screen).toBe(route.screen);
    expect(h.shownScreens).toEqual([route.screen]);
  });

  test("starts a host visit on the host route", async () => {
    const h = harness();
    h.controller.enterRoute(HOST);
    await flush();
    expect(h.invitations).toHaveLength(1);
    expect(h.hostStates.at(-1)).toEqual({
      phase: "invitation",
      invitation: { offerCode: OFFER_CODE, roomSecret: ROOM_SECRET },
    });
  });

  test("joins the invitation the guest route carries", async () => {
    const h = harness();
    h.controller.enterRoute(GUEST);
    await flush();
    expect(h.replies.map((reply) => reply.offerCode)).toEqual([OFFER_CODE]);
    expect(h.guestStates.at(-1)).toEqual({ phase: "joining" });
  });

  test.each([HOST, GUEST])("again for %j starts a fresh visit", async (route) => {
    const h = harness();
    h.controller.enterRoute(route);
    await flush();
    h.controller.enterRoute(route);
    await flush();
    const closed = [...h.invitations, ...h.replies].map((pending) => pending.closed);
    expect(closed).toEqual([true, false]);
  });
});

describe("handing over a visit", () => {
  test("shows the host's remote match once the guest's reply opens the link", async () => {
    const h = harness();
    await handOverHost(h);
    expect(h.invitations[0].replyCodes).toEqual([REPLY_CODE]);
    expect(h.rooms[0].closed).toBe(true);
    expect(h.session.screen).toBe("remoteMatch");
    expect(h.session.played.viewer).toEqual({ kind: "remote", localSide: "left" });
    expect(h.shownScreens).toEqual(["host", "remoteMatch"]);
  });

  test("shows the guest's remote match once its link opens", async () => {
    const h = harness();
    await handOverGuest(h);
    expect(h.session.screen).toBe("remoteMatch");
    expect(h.session.played.viewer).toEqual({ kind: "remote", localSide: "right" });
    expect(h.shownScreens).toEqual(["guest", "remoteMatch"]);
  });

  test("plays under the match rules drawn on that route entry", async () => {
    const h = harness();
    h.settings.planetCount = { min: 6, max: 6 };
    h.controller.enterRoute(HOST);
    await flush();
    h.settings.planetCount = { ...DEFAULT_SETTINGS.planetCount };
    submitReplyCode(h.session, REPLY_CODE);
    h.invitations[0].accepted.resolve(fakeLink().link);
    await flush();
    expect(h.session.played.view()?.planets).toHaveLength(6);
  });
});

describe("leaving a remote match", () => {
  test.each(ROUTES)("for %j closes its link", async (route) => {
    const h = harness();
    const link = await handOverGuest(h);
    h.controller.enterRoute(route);
    expect(link.closed).toBe(true);
    expect(h.session.screen).toBe(route.screen);
  });
});

describe("leaving a host or guest route while connecting", () => {
  test("closes the host's invitation and relay room", async () => {
    const h = harness();
    h.controller.enterRoute(HOST);
    await flush();
    h.controller.enterRoute(MAIN_MENU);
    expect(h.invitations[0].closed).toBe(true);
    expect(h.rooms[0].closed).toBe(true);
  });

  test("closes the guest's reply", async () => {
    const h = harness();
    h.controller.enterRoute(GUEST);
    await flush();
    h.controller.enterRoute(MAIN_MENU);
    expect(h.replies[0].closed).toBe(true);
  });

  test("ends the host visit when a guest visit starts", async () => {
    const h = harness();
    h.controller.enterRoute(HOST);
    await flush();
    h.controller.enterRoute(GUEST);
    await flush();
    expect(h.invitations[0].closed).toBe(true);
    expect(h.replies[0].closed).toBe(false);
  });

  test("closes a link opening after leaving instead of handing it over", async () => {
    const h = harness();
    const link = fakeLink();
    h.controller.enterRoute(GUEST);
    await flush();
    h.controller.enterRoute(MAIN_MENU);
    h.replies[0].opened.resolve(link.link);
    await flush();
    expect(link.closed).toBe(true);
    expect(h.session.screen).toBe("mainMenu");
    expect(h.shownScreens).toEqual(["guest", "mainMenu"]);
  });

  test("passes no reply code to a left host visit", async () => {
    const h = harness();
    h.controller.enterRoute(HOST);
    await flush();
    h.controller.enterRoute(MAIN_MENU);
    await submitReplyCode(h.session, REPLY_CODE);
    expect(h.invitations[0].replyCodes).toEqual([]);
  });
});

describe("a finished remote match", () => {
  test("leads to the main menu route once its notice has run out", async () => {
    const h = harness();
    const link = await handOverGuest(h);
    link.receive(encodeMessage({ kind: "leave" }));
    for (let i = 0; i < END_NOTICE_STEPS - 1; i++) {
      h.controller.stepSession(false);
    }
    expect(h.navigations).toEqual([]);
    h.controller.stepSession(false);
    expect(h.navigations).toEqual(["mainMenu"]);
    expect(h.session.screen).toBe("mainMenu");
    expect(h.shownScreens.at(-1)).toBe("mainMenu");
  });
});
