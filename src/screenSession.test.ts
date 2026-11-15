// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
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
import {
  awaitsFirstShot,
  createScreenSession,
  describeScreenSessionFrame,
  stepScreenSession,
  type ScreenSession,
} from "./screenSession";
import { enterScreen, type VisitlessScreen } from "./screenSession.fixtures";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";
import { generateStars } from "./stars";

type ViewReached = (view: MatchView) => boolean;

interface PlayedFrame {
  items: FrameItem[];
  shake: Readonly<Point>;
}

const MAX_STEPS = 5000;
const ANGLE_DELTAS = Array.from({ length: 36 }, (_, i) => i * 10);
const POWER_DELTAS = [0, 50, 100, 150, 200];

function sessionOn(...screens: VisitlessScreen[]): ScreenSession {
  return sessionWith(centredRandom, ...screens);
}

function sessionWith(random: () => number, ...screens: VisitlessScreen[]): ScreenSession {
  const session = createScreenSession(1, random);
  screens.forEach((screen, index) => enterScreen(session, screen, index + 1, DEFAULT_MATCH_RULES));
  return session;
}

function shownView(session: ScreenSession): MatchView {
  const view = session.played.view();
  if (view === undefined) {
    throw new Error("expected a shown match");
  }
  return view;
}

function frameOf(session: ScreenSession, reducedMotion: boolean): FrameLayer[] {
  return describeScreenSessionFrame(session, STARS, CONTOURS_HIDDEN, reducedMotion, FRAME_TIME_MS);
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
      const trial = createMatch(1, undefined, DEFAULT_MATCH_RULES);
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
  session.played.aim(delta);
  session.played.fire();
  for (let i = 0; i < MAX_STEPS && !reached(shownView(session)); i++) {
    stepScreenSession(session, reducedMotion);
  }
}

function stepUntilDebris(session: ScreenSession): void {
  for (let i = 0; i < MAX_STEPS && session.debris.length === 0; i++) {
    stepScreenSession(session, false);
  }
}

const isRoundOver: ViewReached = (view) => view.phase.kind === "roundOver";
const isPlanetHit: ViewReached = (view) => view.impact !== undefined && view.phase.kind !== "roundOver";

const SIX_PLANET_RULES: MatchRules = { ...DEFAULT_MATCH_RULES, planetCount: { min: 6, max: 6 } };

const CONTOURS_HIDDEN: DisplaySettings = { gravityWellContours: false };

const extremeRandom = () => 1;
const centredRandom = () => 0.5;

const STARS = generateStars(centredRandom);
const FRAME_TIME_MS = 1234;

describe("entering a screen", () => {
  test("starts on the main menu with attract mode", () => {
    const session = createScreenSession(1, centredRandom);

    expect(session.screen).toBe("mainMenu");
    expect(session.played.viewer).toBe(ATTRACT_VIEWER);
  });

  test("keeps the starting attract mode behind the main menu", () => {
    const session = createScreenSession(1, centredRandom);
    stepScreenSession(session, false);
    const before = structuredClone(shownView(session));

    enterScreen(session, "mainMenu", 2, DEFAULT_MATCH_RULES);

    expect(shownView(session)).toEqual(before);
  });

  test("discards attract mode when a match starts", () => {
    const session = sessionOn("mainMenu", "match");

    expect(session.screen).toBe("match");
    expect(session.played.viewer).toBe(HOT_SEAT_VIEWER);
    expect(shownView(session)).toEqual(matchView(createMatch(2, undefined, DEFAULT_MATCH_RULES)));
  });

  test("starts the match under the given match rules", () => {
    const session = createScreenSession(1, centredRandom);

    enterScreen(session, "match", 1, SIX_PLANET_RULES);

    expect(shownView(session).rules).toEqual(SIX_PLANET_RULES);
    expect(shownView(session).planets).toHaveLength(6);
  });

  test("keeps attract mode on the default match rules", () => {
    const session = sessionOn("match");

    enterScreen(session, "mainMenu", 2, SIX_PLANET_RULES);

    expect(shownView(session).rules).toEqual(DEFAULT_MATCH_RULES);
  });

  test("drops the match when leaving it", () => {
    const session = sessionOn("mainMenu", "match", "mainMenu");

    expect(session.screen).toBe("mainMenu");
    expect(session.played.viewer).toBe(ATTRACT_VIEWER);
  });

  test("keeps attract mode across a main menu, credits, main menu round trip", () => {
    const session = sessionOn("mainMenu");
    stepScreenSession(session, false);
    const before = structuredClone(shownView(session));

    enterScreen(session, "credits", 7, DEFAULT_MATCH_RULES);
    enterScreen(session, "mainMenu", 8, DEFAULT_MATCH_RULES);

    expect(shownView(session)).toEqual(before);
  });
});

describe("aiming and firing", () => {
  test("takes player input only on the match screen", () => {
    expect(sessionOn("match").played.takesInput).toBe(true);
    expect(sessionOn("mainMenu").played.takesInput).toBe(false);
  });

  test("aims the active match", () => {
    const session = sessionOn("match");
    const expected = createMatch(1, undefined, DEFAULT_MATCH_RULES);
    adjustAim(expected, { angle: 15, power: -20 });

    session.played.aim({ angle: 15, power: -20 });

    expect(shownView(session)).toEqual(matchView(expected));
  });

  test("fires the active match", () => {
    const session = sessionOn("match");

    session.played.fire();

    expect(shownView(session).phase.kind).toBe("inFlight");
  });

  test("fire during a hot-seat round over starts the next round", () => {
    const session = sessionOn("match");
    playUntil(session, isRoundOver, false);

    session.played.fire();

    expect(shownView(session).phase.kind).toBe("aiming");
    expect(shownView(session).roundNumber).toBe(2);
  });

  test("ignores aim and fire without a match", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownView(session));

    session.played.aim({ angle: 15, power: -20 });
    session.played.fire();

    expect(shownView(session)).toEqual(before);
  });
});

describe("awaiting the first shot", () => {
  test("awaits it when a match starts", () => {
    expect(awaitsFirstShot(sessionOn("match"))).toBe(true);
  });

  test("stops awaiting it once the first shot is fired", () => {
    const session = sessionOn("match");

    session.played.fire();

    expect(awaitsFirstShot(session)).toBe(false);
  });

  test("does not await it again in a later round", () => {
    const session = sessionOn("match");
    playUntil(session, isRoundOver, false);

    session.played.fire();

    expect(awaitsFirstShot(session)).toBe(false);
  });

  test("awaits it again in the next match", () => {
    const session = sessionOn("match");
    session.played.fire();

    enterScreen(session, "mainMenu", 2, DEFAULT_MATCH_RULES);
    enterScreen(session, "match", 3, DEFAULT_MATCH_RULES);

    expect(awaitsFirstShot(session)).toBe(true);
  });
});

describe("stepping", () => {
  test("plays attract mode behind the main menu", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownView(session));

    stepScreenSession(session, false);

    expect(shownView(session)).not.toEqual(before);
  });

  test("plays the main menu's attract mode behind the settings", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownView(session));
    enterScreen(session, "settings", 7, DEFAULT_MATCH_RULES);
    const kept = structuredClone(shownView(session));

    stepScreenSession(session, false);

    expect(kept).toEqual(before);
    expect(shownView(session)).not.toEqual(before);
  });

  test("pauses attract mode behind the credits", () => {
    const session = sessionOn("mainMenu", "credits");
    const before = structuredClone(shownView(session));

    stepScreenSession(session, false);

    expect(shownView(session)).toEqual(before);
  });

  test("pauses attract mode under reduced motion", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownView(session));

    stepScreenSession(session, true);

    expect(shownView(session)).toEqual(before);
  });

  test("steps the active match", () => {
    const session = sessionOn("match");
    session.played.fire();
    const before = structuredClone(shownView(session));

    stepScreenSession(session, true);

    expect(shownView(session)).not.toEqual(before);
  });
});

describe("describing the frame", () => {
  test("shows the match while one is active", () => {
    const session = sessionOn("match");

    expect(playedFrameOf(session).items).toEqual(
      describeFrame(shownView(session), CONTOURS_HIDDEN, session.debris, HOT_SEAT_VIEWER),
    );
  });

  test("shows attract mode otherwise", () => {
    const session = sessionOn("mainMenu", "credits");

    expect(playedFrameOf(session).items).toEqual(
      describeFrame(shownView(session), CONTOURS_HIDDEN, session.debris, ATTRACT_VIEWER),
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
      describeFrame(shownView(session), CONTOURS_HIDDEN, session.debris, HOT_SEAT_VIEWER),
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
    const session = sessionWith(extremeRandom, "match");
    playUntil(session, isRoundOver, false);
    return session;
  }

  test("follows the match right after a hit", () => {
    const session = roundOverSession();

    const shake = playedFrameOf(session).shake;

    expect(shake).toEqual(screenShakeOffset(shownView(session), extremeRandom));
    expect(shake).not.toEqual(NO_SHAKE);
  });

  test("is still under reduced motion", () => {
    const session = roundOverSession();

    expect(playedFrameOf(session, true).shake).toEqual(NO_SHAKE);
  });

  test("is still without a match", () => {
    const session = createScreenSession(1, extremeRandom);

    expect(playedFrameOf(session).shake).toEqual(NO_SHAKE);
  });

  test("is still for a played match that does not shake", () => {
    const session = roundOverSession();
    session.played = { ...session.played, shakes: false };

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
      session.played.aim({ angle: 25 * shot, power: 20 * shot });
      session.played.fire();
      for (let i = 0; i < 1000 && shownView(session).phase.kind === "inFlight"; i++) {
        stepScreenSession(session, reducedMotion);
      }
    }
    return shownView(session);
  }

  test("a planet hit throws large particles from the impact point", () => {
    const session = planetHitSession(false);
    const impact = shownView(session).impact!;

    expect(session.debris).toHaveLength(BURST_COUNT.large);
    expect(session.debris.every((particle) => particle.size === "large")).toBe(true);
    expect(session.debris.every((particle) => particle.x === impact.x && particle.y === impact.y)).toBe(true);
  });

  test("a ship hit throws large particles", () => {
    const session = sessionOn("match");

    playUntil(session, isRoundOver, false);

    expect(session.debris).toHaveLength(BURST_COUNT.large);
  });

  test("debris keeps flying after the impact", () => {
    const session = planetHitSession(false);
    const before = structuredClone(session.debris);

    stepScreenSession(session, false);

    expect(session.debris).not.toEqual(before);
  });

  test("no debris is thrown under reduced motion", () => {
    const session = planetHitSession(true);

    expect(shownView(session).impact).toBeDefined();
    expect(session.debris).toEqual([]);
  });

  test("debris in flight is cleared once reduced motion is set", () => {
    const session = planetHitSession(false);

    stepScreenSession(session, true);

    expect(session.debris).toEqual([]);
  });

  test("seeded matches end in the same state with or without debris", () => {
    expect(playSeededMatch(false)).toEqual(playSeededMatch(true));
  });

  test("attract mode throws debris like a match", () => {
    const session = sessionOn("mainMenu");

    stepUntilDebris(session);

    expect(session.debris.length).toBeGreaterThan(0);
  });

  test("attract mode keeps its debris across menu screens", () => {
    const session = sessionOn("mainMenu");
    stepUntilDebris(session);
    const debris = session.debris;

    enterScreen(session, "settings", 2, DEFAULT_MATCH_RULES);
    enterScreen(session, "credits", 3, DEFAULT_MATCH_RULES);

    expect(session.debris).toBe(debris);
  });

  test("starting a match clears attract mode's debris", () => {
    const session = sessionOn("mainMenu");
    stepUntilDebris(session);

    enterScreen(session, "match", 2, DEFAULT_MATCH_RULES);

    expect(session.debris).toEqual([]);
  });

  test("leaving a match clears its debris", () => {
    const session = planetHitSession(false);

    enterScreen(session, "mainMenu", 2, DEFAULT_MATCH_RULES);

    expect(session.debris).toEqual([]);
  });

  test("the frame draws the debris", () => {
    const session = planetHitSession(false);

    const dots = playedFrameOf(session).items.filter((item) => item.kind === "dot");

    expect(dots).toHaveLength(BURST_COUNT.large);
  });
});
