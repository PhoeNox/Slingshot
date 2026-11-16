// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SoundEffect } from "./audio";
import {
  adjustAim,
  createMatch,
  DEFAULT_MATCH_RULES,
  fire,
  matchView,
  step,
  type AimDelta,
  type MatchRules,
  type MatchView,
} from "./core/match";
import { BURST_COUNT } from "./debris";
import type { Point } from "./core/flight";
import { ATTRACT_VIEWER, describeBackdropFrame, describeFrame, HOT_SEAT_VIEWER, type DisplaySettings } from "./frame";
import type { FrameItem, FrameLayer, GroupItem } from "./frameItems";
import type { FixedRouteScreen, Route, Screen } from "./navigation";
import type { GuestReply, HostInvitation, PeerLink } from "./peerConnection";
import { encodeMessage } from "./remoteProtocol";
import type { PeerConnectors } from "./remoteVisit";
import type { ReplyRelay } from "./replyRelay";
import { createScreenSession, type ScreenSession, type ScreenSessionAdapters } from "./screenSession";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";
import { DEFAULT_SETTINGS, matchRulesFor } from "./settings";
import { memorySettingsStorage } from "./settingsStorage";
import { createSettingsStore, type SettingsStore } from "./settingsStore";
import { generateStars } from "./stars";
import type { VisitState } from "./visitTransition";

type ViewReached = (view: MatchView) => boolean;
type MenuOrMatchScreen = Exclude<FixedRouteScreen, "host">;
type MatchRulesSource = Pick<SettingsStore, "matchRules">;

interface PlayedFrame {
  items: FrameItem[];
  shake: Readonly<Point>;
}

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
  shownScreens: Screen[];
  navigations: FixedRouteScreen[];
  hostStates: VisitState[];
  guestStates: VisitState[];
  invitations: FakeInvitation[];
  replies: FakeReply[];
  rooms: FakeRoom[];
  soundEffects: SoundEffect[];
}

const SEED = 1;
const SEED_DRAW = SEED / 2 ** 32;
const MAX_STEPS = 5000;
const MAX_ATTRACT_STEPS = 50_000;
const END_NOTICE_STEPS = 90;
const DESKTOP_HUD_SCALE = 1;
const ANGLE_DELTAS = Array.from({ length: 36 }, (_, i) => i * 10);
const POWER_DELTAS = [0, 50, 100, 150, 200];
const OFFER_CODE = "a1B2-c_3";
const ROOM_SECRET = "s3_Cr-t";
const REPLY_CODE = "r3pLy";
const MAIN_MENU: Route = { screen: "mainMenu", replace: false };
const MATCH: Route = { screen: "match", replace: false };
const HOST: Route = { screen: "host", replace: false };
const GUEST: Route = { screen: "guest", replace: false, offerCode: OFFER_CODE, roomSecret: ROOM_SECRET };
const ROUTES: readonly Route[] = [
  MAIN_MENU,
  { screen: "playMenu", replace: false },
  MATCH,
  { screen: "settings", replace: false },
  { screen: "credits", replace: false },
  HOST,
  GUEST,
];
const realSetTimeout = globalThis.setTimeout;

const seededRandom = () => SEED_DRAW;
const centredRandom = () => 0.5;

const SIX_PLANET_RULES: MatchRules = { ...DEFAULT_MATCH_RULES, planetCount: { min: 6, max: 6 } };
const DEFAULT_RULES: MatchRulesSource = { matchRules: () => DEFAULT_MATCH_RULES };

const CONTOURS_HIDDEN: DisplaySettings = { gravityWellContours: false };

const STARS = generateStars(centredRandom);
const FRAME_TIME_MS = 1234;

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

function harness(settings: MatchRulesSource = DEFAULT_RULES): Harness {
  const shownScreens: Screen[] = [];
  const navigations: FixedRouteScreen[] = [];
  const hostStates: VisitState[] = [];
  const guestStates: VisitState[] = [];
  const invitations: FakeInvitation[] = [];
  const replies: FakeReply[] = [];
  const rooms: FakeRoom[] = [];
  const soundEffects: SoundEffect[] = [];
  const adapters: ScreenSessionAdapters = {
    random: seededRandom,
    settings,
    showScreen: (screen) => {
      shownScreens.push(screen);
    },
    navigateTo: (screen) => {
      navigations.push(screen);
      session.enterRoute({ screen, replace: false });
    },
    peers: fakePeers(invitations, replies),
    relay: fakeRelay(rooms),
    visitScreens: {
      showHostState: (state) => hostStates.push(state),
      showGuestState: (state) => guestStates.push(state),
    },
    playSoundEffect: (effect) => {
      soundEffects.push(effect);
    },
  };
  const session = createScreenSession(adapters);
  return { session, shownScreens, navigations, hostStates, guestStates, invitations, replies, rooms, soundEffects };
}

function enterScreen(session: ScreenSession, screen: MenuOrMatchScreen): void {
  session.enterRoute({ screen, replace: false });
}

function sessionOn(...screens: MenuOrMatchScreen[]): ScreenSession {
  const session = harness().session;
  screens.forEach((screen) => enterScreen(session, screen));
  return session;
}

async function handOverHost(h: Harness): Promise<FakeLink> {
  const link = fakeLink();
  h.session.enterRoute(HOST);
  await flush();
  h.session.submitReplyCode(REPLY_CODE);
  h.invitations.at(-1)!.accepted.resolve(link.link);
  await flush();
  return link;
}

async function handOverGuest(h: Harness): Promise<FakeLink> {
  const link = fakeLink();
  h.session.enterRoute(GUEST);
  await flush();
  h.replies.at(-1)!.opened.resolve(link.link);
  await flush();
  return link;
}

function shownView(session: ScreenSession): MatchView {
  const view = session.played().view();
  if (view === undefined) {
    throw new Error("expected a shown match");
  }
  return view;
}

function frameOf(session: ScreenSession, reducedMotion: boolean): FrameLayer[] {
  return session.describeFrame(STARS, CONTOURS_HIDDEN, DESKTOP_HUD_SCALE, reducedMotion, FRAME_TIME_MS);
}

function shakenGroupOf(frame: FrameLayer[]): GroupItem {
  const layer = frame[2];
  const group = layer.kind === "items" ? layer.items[0] : undefined;
  if (group?.kind !== "group") {
    throw new Error("expected the shaken played match group");
  }
  return group;
}

function playedFrameOf(session: ScreenSession, reducedMotion = false): PlayedFrame {
  const group = shakenGroupOf(frameOf(session, reducedMotion));
  const shake = { x: group.transform.x, y: group.transform.y };
  return { items: group.items, shake };
}

function aimReaching(reached: ViewReached): AimDelta {
  for (const angle of ANGLE_DELTAS) {
    for (const power of POWER_DELTAS) {
      const trial = createMatch(SEED, undefined, DEFAULT_MATCH_RULES);
      const delta = { angle, power };
      adjustAim(trial, delta);
      fire(trial);
      for (let i = 0; i < MAX_STEPS && matchView(trial).phase.kind === "inFlight" && !reached(matchView(trial)); i++) {
        step(trial);
      }
      if (reached(matchView(trial))) {
        return delta;
      }
    }
  }
  throw new Error("no aim reaches the wanted view");
}

function playUntil(session: ScreenSession, reached: ViewReached, reducedMotion: boolean): void {
  const delta = aimReaching(reached);
  session.played().aim(delta);
  session.played().fire();
  for (let i = 0; i < MAX_STEPS && !reached(shownView(session)); i++) {
    session.step(reducedMotion);
  }
}

function stepUntil(session: ScreenSession, reached: ViewReached, maxSteps: number): void {
  for (let i = 0; i < maxSteps && !reached(shownView(session)); i++) {
    session.step(false);
  }
}

function stepUntilDebris(session: ScreenSession): void {
  for (let i = 0; i < MAX_STEPS && session.debris().length === 0; i++) {
    session.step(false);
  }
}

const isRoundOver: ViewReached = (view) => view.phase.kind === "roundOver";
const isPlanetHit: ViewReached = (view) => view.impact !== undefined && view.phase.kind !== "roundOver";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("entering a screen", () => {
  test("starts on the main menu with attract mode", () => {
    const session = harness().session;

    expect(session.screen()).toBe("mainMenu");
    expect(session.played().viewer).toBe(ATTRACT_VIEWER);
  });

  test("keeps the starting attract mode behind the main menu", () => {
    const session = harness().session;
    session.step(false);
    const before = structuredClone(shownView(session));

    enterScreen(session, "mainMenu");

    expect(shownView(session)).toEqual(before);
  });

  test("discards attract mode when a match starts", () => {
    const session = sessionOn("mainMenu", "match");

    expect(session.screen()).toBe("match");
    expect(session.played().viewer).toBe(HOT_SEAT_VIEWER);
    expect(shownView(session)).toEqual(matchView(createMatch(SEED, undefined, DEFAULT_MATCH_RULES)));
  });

  test("starts the match under the match rules taken on entering it", () => {
    const session = harness({ matchRules: () => SIX_PLANET_RULES }).session;

    enterScreen(session, "match");

    expect(shownView(session).rules).toEqual(SIX_PLANET_RULES);
    expect(shownView(session).planets).toHaveLength(6);
  });

  test("keeps attract mode on the default match rules", () => {
    let matchRules = DEFAULT_MATCH_RULES;
    const session = harness({ matchRules: () => matchRules }).session;
    enterScreen(session, "match");
    matchRules = SIX_PLANET_RULES;

    enterScreen(session, "mainMenu");

    expect(shownView(session).rules).toEqual(DEFAULT_MATCH_RULES);
  });

  test("drops the match when leaving it", () => {
    const session = sessionOn("mainMenu", "match", "mainMenu");

    expect(session.screen()).toBe("mainMenu");
    expect(session.played().viewer).toBe(ATTRACT_VIEWER);
  });

  test("keeps attract mode across a main menu, credits, main menu round trip", () => {
    const session = sessionOn("mainMenu");
    session.step(false);
    const before = structuredClone(shownView(session));

    enterScreen(session, "credits");
    enterScreen(session, "mainMenu");

    expect(shownView(session)).toEqual(before);
  });
});

describe("aiming and firing", () => {
  test("takes player input only on the match screen", () => {
    expect(sessionOn("match").played().takesInput).toBe(true);
    expect(sessionOn("mainMenu").played().takesInput).toBe(false);
  });

  test("aims the active match", () => {
    const session = sessionOn("match");
    const expected = createMatch(SEED, undefined, DEFAULT_MATCH_RULES);
    adjustAim(expected, { angle: 15, power: -20 });

    session.played().aim({ angle: 15, power: -20 });

    expect(shownView(session)).toEqual(matchView(expected));
  });

  test("fires the active match", () => {
    const session = sessionOn("match");

    session.played().fire();

    expect(shownView(session).phase.kind).toBe("inFlight");
  });

  test("fire during a hot-seat round over starts the next round", () => {
    const session = sessionOn("match");
    playUntil(session, isRoundOver, false);

    session.played().fire();

    expect(shownView(session).phase.kind).toBe("aiming");
    expect(shownView(session).roundNumber).toBe(2);
  });

  test("ignores aim and fire without a match", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownView(session));

    session.played().aim({ angle: 15, power: -20 });
    session.played().fire();

    expect(shownView(session)).toEqual(before);
  });
});

describe("keeping the screen awake", () => {
  test("keeps it awake during a hot-seat match", () => {
    expect(sessionOn("match").keepsScreenAwake()).toBe(true);
  });

  test("lets it sleep behind attract mode on the menus", () => {
    expect(sessionOn("mainMenu").keepsScreenAwake()).toBe(false);
    expect(sessionOn("mainMenu", "settings").keepsScreenAwake()).toBe(false);
  });

  test("lets it sleep again once the match is left", () => {
    expect(sessionOn("match", "mainMenu").keepsScreenAwake()).toBe(false);
  });
});

describe("awaiting the first shot", () => {
  test("awaits it when a match starts", () => {
    expect(sessionOn("match").awaitsFirstShot()).toBe(true);
  });

  test("stops awaiting it once the first shot is fired", () => {
    const session = sessionOn("match");

    session.played().fire();

    expect(session.awaitsFirstShot()).toBe(false);
  });

  test("does not await it again in a later round", () => {
    const session = sessionOn("match");
    playUntil(session, isRoundOver, false);

    session.played().fire();

    expect(session.awaitsFirstShot()).toBe(false);
  });

  test("awaits it again in the next match", () => {
    const session = sessionOn("match");
    session.played().fire();

    enterScreen(session, "mainMenu");
    enterScreen(session, "match");

    expect(session.awaitsFirstShot()).toBe(true);
  });
});

describe("stepping", () => {
  test("plays attract mode behind the main menu", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownView(session));

    session.step(false);

    expect(shownView(session)).not.toEqual(before);
  });

  test("plays the main menu's attract mode behind the settings", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownView(session));
    enterScreen(session, "settings");
    const kept = structuredClone(shownView(session));

    session.step(false);

    expect(kept).toEqual(before);
    expect(shownView(session)).not.toEqual(before);
  });

  test("pauses attract mode behind the credits", () => {
    const session = sessionOn("mainMenu", "credits");
    const before = structuredClone(shownView(session));

    session.step(false);

    expect(shownView(session)).toEqual(before);
  });

  test("pauses attract mode under reduced motion", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownView(session));

    session.step(true);

    expect(shownView(session)).toEqual(before);
  });

  test("steps the active match", () => {
    const session = sessionOn("match");
    session.played().fire();
    const before = structuredClone(shownView(session));

    session.step(true);

    expect(shownView(session)).not.toEqual(before);
  });
});

describe("describing the frame", () => {
  test("shows the match while one is active", () => {
    const session = sessionOn("match");

    expect(playedFrameOf(session).items).toEqual(
      describeFrame(shownView(session), CONTOURS_HIDDEN, session.debris(), HOT_SEAT_VIEWER, DESKTOP_HUD_SCALE),
    );
  });

  test("shows attract mode otherwise", () => {
    const session = sessionOn("mainMenu", "credits");

    expect(playedFrameOf(session).items).toEqual(
      describeFrame(shownView(session), CONTOURS_HIDDEN, session.debris(), ATTRACT_VIEWER, DESKTOP_HUD_SCALE),
    );
  });
});

describe("frame layers", () => {
  test("draws the backdrop, then the stars, then the shaken played match", () => {
    const session = sessionOn("match");

    const frame = frameOf(session, false);

    expect(frame.map((layer) => layer.kind)).toEqual(["items", "stars", "items"]);
    expect(frame[0]).toEqual({ kind: "items", items: describeBackdropFrame() });
    expect(frame[1]).toEqual({ kind: "stars", stars: STARS, timeMs: FRAME_TIME_MS });
    expect(shakenGroupOf(frame).items).toEqual(
      describeFrame(shownView(session), CONTOURS_HIDDEN, session.debris(), HOT_SEAT_VIEWER, DESKTOP_HUD_SCALE),
    );
  });

  test("holds the stars still under reduced motion", () => {
    const session = sessionOn("match");

    const frame = frameOf(session, true);

    expect(frame[1]).toEqual({ kind: "stars", stars: STARS, timeMs: 0 });
  });
});

describe("screen shake", () => {
  function roundOverSession(): ScreenSession {
    const session = sessionOn("match");
    playUntil(session, isRoundOver, false);
    return session;
  }

  test("follows the match right after a hit", () => {
    const session = roundOverSession();

    const shake = playedFrameOf(session).shake;

    expect(shake).toEqual(screenShakeOffset(shownView(session), seededRandom));
    expect(shake).not.toEqual(NO_SHAKE);
  });

  test("is still under reduced motion", () => {
    const session = roundOverSession();

    expect(playedFrameOf(session, true).shake).toEqual(NO_SHAKE);
  });

  test("is still without a match", () => {
    const session = harness().session;

    expect(playedFrameOf(session).shake).toEqual(NO_SHAKE);
  });

  test("is still behind attract mode, which does not shake", () => {
    const session = sessionOn("mainMenu");
    stepUntil(session, isRoundOver, MAX_ATTRACT_STEPS);

    expect(screenShakeOffset(shownView(session), seededRandom)).not.toEqual(NO_SHAKE);
    expect(playedFrameOf(session).shake).toEqual(NO_SHAKE);
  });
});

describe("debris", () => {
  function planetHitSession(reducedMotion: boolean): ScreenSession {
    const session = sessionOn("match");
    playUntil(session, isPlanetHit, reducedMotion);
    return session;
  }

  function playSeededMatch(reducedMotion: boolean): MatchView {
    const session = sessionOn("match");
    for (let shot = 0; shot < 6; shot++) {
      session.played().aim({ angle: 25 * shot, power: 20 * shot });
      session.played().fire();
      for (let i = 0; i < 1000 && shownView(session).phase.kind === "inFlight"; i++) {
        session.step(reducedMotion);
      }
    }
    return shownView(session);
  }

  test("a planet hit throws large particles from the impact point", () => {
    const session = planetHitSession(false);
    const impact = shownView(session).impact!;

    expect(session.debris()).toHaveLength(BURST_COUNT.large);
    expect(session.debris().every((particle) => particle.size === "large")).toBe(true);
    expect(session.debris().every((particle) => particle.x === impact.x && particle.y === impact.y)).toBe(true);
  });

  test("a ship hit throws large particles", () => {
    const session = sessionOn("match");

    playUntil(session, isRoundOver, false);

    expect(session.debris()).toHaveLength(BURST_COUNT.large);
  });

  test("debris keeps flying after the impact", () => {
    const session = planetHitSession(false);
    const before = structuredClone(session.debris());

    session.step(false);

    expect(session.debris()).not.toEqual(before);
  });

  test("no debris is thrown under reduced motion", () => {
    const session = planetHitSession(true);

    expect(shownView(session).impact).toBeDefined();
    expect(session.debris()).toEqual([]);
  });

  test("debris in flight is cleared once reduced motion is set", () => {
    const session = planetHitSession(false);

    session.step(true);

    expect(session.debris()).toEqual([]);
  });

  test("seeded matches end in the same state with or without debris", () => {
    expect(playSeededMatch(false)).toEqual(playSeededMatch(true));
  });

  test("attract mode throws debris like a match", () => {
    const session = sessionOn("mainMenu");

    stepUntilDebris(session);

    expect(session.debris().length).toBeGreaterThan(0);
  });

  test("attract mode keeps its debris across menu screens", () => {
    const session = sessionOn("mainMenu");
    stepUntilDebris(session);
    const debris = session.debris();

    enterScreen(session, "settings");
    enterScreen(session, "credits");

    expect(session.debris()).toBe(debris);
  });

  test("starting a match clears attract mode's debris", () => {
    const session = sessionOn("mainMenu");
    stepUntilDebris(session);

    enterScreen(session, "match");

    expect(session.debris()).toEqual([]);
  });

  test("leaving a match clears its debris", () => {
    const session = planetHitSession(false);

    enterScreen(session, "mainMenu");

    expect(session.debris()).toEqual([]);
  });

  test("the frame draws the debris", () => {
    const session = planetHitSession(false);

    const dots = playedFrameOf(session).items.filter((item) => item.kind === "dot");

    expect(dots).toHaveLength(BURST_COUNT.large);
  });
});

describe("sound effects", () => {
  function matchHarness(): Harness {
    const h = harness();
    enterScreen(h.session, "match");
    return h;
  }

  test("a fired shot plays the launch on its first step", () => {
    const h = matchHarness();
    h.session.played().fire();

    h.session.step(false);

    expect(h.soundEffects).toEqual(["launch"]);
  });

  test("a shot in flight plays nothing after its launch", () => {
    const h = matchHarness();
    h.session.played().fire();
    h.session.step(false);

    h.session.step(false);

    expect(h.soundEffects).toEqual(["launch"]);
  });

  test("a planet hit plays the planet impact", () => {
    const h = matchHarness();

    playUntil(h.session, isPlanetHit, false);

    expect(h.soundEffects).toEqual(["launch", "planetImpact"]);
  });

  test("a ship hit plays the ship explosion", () => {
    const h = matchHarness();

    playUntil(h.session, isRoundOver, false);

    expect(h.soundEffects).toEqual(["launch", "shipExplosion"]);
  });

  test("plays under reduced motion too", () => {
    const h = matchHarness();

    playUntil(h.session, isPlanetHit, true);

    expect(h.soundEffects).toEqual(["launch", "planetImpact"]);
  });

  test("attract mode plays none", () => {
    const h = harness();

    stepUntilDebris(h.session);

    expect(h.session.debris().length).toBeGreaterThan(0);
    expect(h.soundEffects).toEqual([]);
  });
});

describe("entering a route", () => {
  test.each(ROUTES)("shows the screen of %j", (route) => {
    const h = harness();
    h.session.enterRoute(route);
    expect(h.session.screen()).toBe(route.screen);
    expect(h.shownScreens).toEqual([route.screen]);
  });

  test("starts a host visit on the host route", async () => {
    const h = harness();
    h.session.enterRoute(HOST);
    await flush();
    expect(h.invitations).toHaveLength(1);
    expect(h.hostStates.at(-1)).toEqual({
      phase: "invitation",
      invitation: { offerCode: OFFER_CODE, roomSecret: ROOM_SECRET },
    });
  });

  test("joins the invitation the guest route carries", async () => {
    const h = harness();
    h.session.enterRoute(GUEST);
    await flush();
    expect(h.replies.map((reply) => reply.offerCode)).toEqual([OFFER_CODE]);
    expect(h.guestStates.at(-1)).toEqual({ phase: "joining" });
  });

  test.each([HOST, GUEST])("again for %j starts a fresh visit", async (route) => {
    const h = harness();
    h.session.enterRoute(route);
    await flush();
    h.session.enterRoute(route);
    await flush();
    const closed = [...h.invitations, ...h.replies].map((pending) => pending.closed);
    expect(closed).toEqual([true, false]);
  });
});

describe("entering a match route", () => {
  test("plays under a setting changed before it, which the store has saved", () => {
    const storage = memorySettingsStorage();
    const settings = createSettingsStore(storage);
    const h = harness(settings);
    settings.change("bounce", true);
    h.session.enterRoute(MATCH);
    expect(h.session.played().view()?.rules.bounce).toBe(true);
    expect(createSettingsStore(storage).current().bounce).toBe(true);
  });

  test("keeps its match rules when a setting changes during the match", () => {
    const settings = createSettingsStore(memorySettingsStorage());
    const h = harness(settings);
    h.session.enterRoute(MATCH);
    settings.change("timeoutSeconds", 10);
    settings.change("planetVisibility", "hidden");
    expect(h.session.played().view()?.rules).toEqual(matchRulesFor(DEFAULT_SETTINGS));
  });
});

describe("handing over a visit", () => {
  test("shows the host's remote match once the guest's reply opens the link", async () => {
    const h = harness();
    await handOverHost(h);
    expect(h.invitations[0].replyCodes).toEqual([REPLY_CODE]);
    expect(h.rooms[0].closed).toBe(true);
    expect(h.session.screen()).toBe("remoteMatch");
    expect(h.session.played().viewer).toEqual({ kind: "remote", localSide: "left" });
    expect(h.shownScreens).toEqual(["host", "remoteMatch"]);
  });

  test("shows the guest's remote match once its link opens", async () => {
    const h = harness();
    await handOverGuest(h);
    expect(h.session.screen()).toBe("remoteMatch");
    expect(h.session.played().viewer).toEqual({ kind: "remote", localSide: "right" });
    expect(h.shownScreens).toEqual(["guest", "remoteMatch"]);
  });

  test("plays under the match rules drawn on that route entry", async () => {
    const settings = createSettingsStore(memorySettingsStorage());
    const h = harness(settings);
    settings.change("planetCount", { min: 6, max: 6 });
    h.session.enterRoute(HOST);
    await flush();
    settings.change("planetCount", DEFAULT_SETTINGS.planetCount);
    h.session.submitReplyCode(REPLY_CODE);
    h.invitations[0].accepted.resolve(fakeLink().link);
    await flush();
    expect(h.session.played().view()?.planets).toHaveLength(6);
  });
});

describe("leaving a remote match", () => {
  test.each(ROUTES)("for %j closes its link", async (route) => {
    const h = harness();
    const link = await handOverGuest(h);
    h.session.enterRoute(route);
    expect(link.closed).toBe(true);
    expect(h.session.screen()).toBe(route.screen);
  });
});

describe("leaving a host or guest route while connecting", () => {
  test("closes the host's invitation and relay room", async () => {
    const h = harness();
    h.session.enterRoute(HOST);
    await flush();
    h.session.enterRoute(MAIN_MENU);
    expect(h.invitations[0].closed).toBe(true);
    expect(h.rooms[0].closed).toBe(true);
  });

  test("closes the guest's reply", async () => {
    const h = harness();
    h.session.enterRoute(GUEST);
    await flush();
    h.session.enterRoute(MAIN_MENU);
    expect(h.replies[0].closed).toBe(true);
  });

  test("ends the host visit when a guest visit starts", async () => {
    const h = harness();
    h.session.enterRoute(HOST);
    await flush();
    h.session.enterRoute(GUEST);
    await flush();
    expect(h.invitations[0].closed).toBe(true);
    expect(h.replies[0].closed).toBe(false);
  });

  test("closes a link opening after leaving instead of handing it over", async () => {
    const h = harness();
    const link = fakeLink();
    h.session.enterRoute(GUEST);
    await flush();
    h.session.enterRoute(MAIN_MENU);
    h.replies[0].opened.resolve(link.link);
    await flush();
    expect(link.closed).toBe(true);
    expect(h.session.screen()).toBe("mainMenu");
    expect(h.shownScreens).toEqual(["guest", "mainMenu"]);
  });

  test("passes no reply code to a left host visit", async () => {
    const h = harness();
    h.session.enterRoute(HOST);
    await flush();
    h.session.enterRoute(MAIN_MENU);
    await h.session.submitReplyCode(REPLY_CODE);
    expect(h.invitations[0].replyCodes).toEqual([]);
  });
});

describe("a finished remote match", () => {
  test("leads to the main menu route once its notice has run out", async () => {
    const h = harness();
    const link = await handOverGuest(h);
    link.receive(encodeMessage({ kind: "leave" }));
    for (let i = 0; i < END_NOTICE_STEPS - 1; i++) {
      h.session.step(false);
    }
    expect(h.navigations).toEqual([]);
    h.session.step(false);
    expect(h.navigations).toEqual(["mainMenu"]);
    expect(h.session.screen()).toBe("mainMenu");
    expect(h.shownScreens.at(-1)).toBe("mainMenu");
  });
});
