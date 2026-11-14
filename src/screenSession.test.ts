// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import type { AttractMode } from "./core/attract";
import {
  adjustAim,
  createMatch,
  DEFAULT_MATCH_RULES,
  fire,
  matchView,
  step,
  type Match,
  type MatchRules,
  type RoundLayout,
} from "./core/match";
import { burstDebris, BURST_COUNT } from "./debris";
import { ATTRACT_VIEWER, describeFrame, HOT_SEAT_VIEWER, type DisplaySettings } from "./frame";
import type { RouteScreen } from "./navigation";
import {
  aimMatch,
  createScreenSession,
  describeScreenSessionFrame,
  enterScreen,
  fireMatch,
  isMatchActive,
  stepScreenSession,
  type ScreenSession,
} from "./screenSession";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";

const FACING_LAYOUT: RoundLayout = {
  ships: {
    left: { x: 40, y: 300, aim: { angle: 90, power: 100 } },
    right: { x: 760, y: 300, aim: { angle: 270, power: 100 } },
  },
  planets: [],
};

function roundOverMatch(): Match {
  const match = createMatch(1, structuredClone(FACING_LAYOUT));
  fire(match);
  for (let i = 0; i < 1000 && matchView(match).phase.kind !== "roundOver"; i++) {
    step(match);
  }
  return match;
}

function sessionOn(...screens: RouteScreen[]): ScreenSession {
  const session = createScreenSession(1, centredRandom);
  screens.forEach((screen, index) => enterScreen(session, screen, index + 1, DEFAULT_MATCH_RULES));
  return session;
}

function shownMatch(session: ScreenSession): Match {
  if (session.state.screen !== "match") {
    throw new Error("expected a match");
  }
  return session.state.match;
}

function shownAttract(session: ScreenSession): AttractMode {
  if (!("attract" in session.state)) {
    throw new Error("expected attract mode");
  }
  return session.state.attract;
}

function showMatch(session: ScreenSession, match: Match): void {
  session.state = { screen: "match", match };
}

const SIX_PLANET_RULES: MatchRules = { ...DEFAULT_MATCH_RULES, planetCount: { min: 6, max: 6 } };

const CONTOURS_HIDDEN: DisplaySettings = { gravityWellContours: false };

const extremeRandom = () => 1;
const centredRandom = () => 0.5;

describe("entering a screen", () => {
  test("starts on the main menu with attract mode", () => {
    const session = createScreenSession(1, centredRandom);

    expect(session.state.screen).toBe("mainMenu");
    expect(session.state).toHaveProperty("attract");
  });

  test("keeps the starting attract mode behind the main menu", () => {
    const session = createScreenSession(1, centredRandom);
    const attract = shownAttract(session);

    enterScreen(session, "mainMenu", 2, DEFAULT_MATCH_RULES);

    expect(shownAttract(session)).toBe(attract);
  });

  test("discards attract mode when a match starts", () => {
    const session = sessionOn("mainMenu", "match");

    expect(session.state.screen).toBe("match");
    expect(session.state).not.toHaveProperty("attract");
  });

  test("starts the match under the given match rules", () => {
    const session = createScreenSession(1, centredRandom);

    enterScreen(session, "match", 1, SIX_PLANET_RULES);

    expect(shownMatch(session).rules).toEqual(SIX_PLANET_RULES);
    expect(shownMatch(session).planets).toHaveLength(6);
  });

  test("keeps attract mode on the default match rules", () => {
    const session = sessionOn("match");

    enterScreen(session, "mainMenu", 2, SIX_PLANET_RULES);

    expect(shownAttract(session).match.rules).toEqual(DEFAULT_MATCH_RULES);
  });

  test("drops the match when leaving it", () => {
    const session = sessionOn("mainMenu", "match", "mainMenu");

    expect(session.state.screen).toBe("mainMenu");
    expect(session.state).not.toHaveProperty("match");
  });

  test("keeps attract mode across a main menu, credits, main menu round trip", () => {
    const session = sessionOn("mainMenu");
    const attract = shownAttract(session);

    enterScreen(session, "credits", 7, DEFAULT_MATCH_RULES);
    enterScreen(session, "mainMenu", 8, DEFAULT_MATCH_RULES);

    expect(shownAttract(session)).toBe(attract);
  });
});

describe("aiming and firing", () => {
  test("reports a match as active only on the match screen", () => {
    expect(isMatchActive(sessionOn("match"))).toBe(true);
    expect(isMatchActive(sessionOn("mainMenu"))).toBe(false);
  });

  test("aims the active match", () => {
    const session = sessionOn("match");
    const expected = structuredClone(shownMatch(session));
    adjustAim(expected, { angle: 15, power: -20 });

    aimMatch(session, { angle: 15, power: -20 });

    expect(shownMatch(session)).toEqual(expected);
  });

  test("fires the active match", () => {
    const session = sessionOn("match");

    fireMatch(session);

    expect(matchView(shownMatch(session)).phase.kind).toBe("inFlight");
  });

  test("ignores aim and fire without a match", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(session.state);

    aimMatch(session, { angle: 15, power: -20 });
    fireMatch(session);

    expect(session.state).toEqual(before);
  });
});

describe("stepping", () => {
  test("plays attract mode behind the main menu", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownAttract(session));

    stepScreenSession(session, false);

    expect(shownAttract(session)).not.toEqual(before);
  });

  test("plays the main menu's attract mode behind the settings", () => {
    const session = sessionOn("mainMenu");
    const attract = shownAttract(session);
    enterScreen(session, "settings", 7, DEFAULT_MATCH_RULES);
    const before = structuredClone(attract);

    stepScreenSession(session, false);

    expect(shownAttract(session)).toBe(attract);
    expect(shownAttract(session)).not.toEqual(before);
  });

  test("pauses attract mode behind the credits", () => {
    const session = sessionOn("mainMenu", "credits");
    const before = structuredClone(shownAttract(session));

    stepScreenSession(session, false);

    expect(shownAttract(session)).toEqual(before);
  });

  test("pauses attract mode under reduced motion", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(shownAttract(session));

    stepScreenSession(session, true);

    expect(shownAttract(session)).toEqual(before);
  });

  test("steps the active match", () => {
    const session = sessionOn("match");
    fire(shownMatch(session));
    const before = structuredClone(shownMatch(session));

    stepScreenSession(session, true);

    expect(shownMatch(session)).not.toEqual(before);
  });
});

describe("describing the frame", () => {
  test("shows the match while one is active", () => {
    const session = sessionOn("match");

    expect(describeScreenSessionFrame(session, CONTOURS_HIDDEN, false).items).toEqual(
      describeFrame(matchView(shownMatch(session)), CONTOURS_HIDDEN, session.debris, HOT_SEAT_VIEWER),
    );
  });

  test("shows attract mode otherwise", () => {
    const session = sessionOn("mainMenu", "credits");

    expect(describeScreenSessionFrame(session, CONTOURS_HIDDEN, false).items).toEqual(
      describeFrame(matchView(shownAttract(session).match), CONTOURS_HIDDEN, session.debris, ATTRACT_VIEWER),
    );
  });
});

describe("screen shake", () => {
  function roundOverSession(): ScreenSession {
    const session = createScreenSession(1, extremeRandom);
    showMatch(session, roundOverMatch());
    return session;
  }

  test("follows the match right after a hit", () => {
    const session = roundOverSession();

    const shake = describeScreenSessionFrame(session, CONTOURS_HIDDEN, false).shake;

    expect(shake).toEqual(screenShakeOffset(matchView(shownMatch(session)), extremeRandom));
    expect(shake).not.toEqual(NO_SHAKE);
  });

  test("is still under reduced motion", () => {
    const session = roundOverSession();

    expect(describeScreenSessionFrame(session, CONTOURS_HIDDEN, true).shake).toBe(NO_SHAKE);
  });

  test("is still without a match", () => {
    const session = createScreenSession(1, extremeRandom);

    expect(describeScreenSessionFrame(session, CONTOURS_HIDDEN, false).shake).toBe(NO_SHAKE);
  });
});

describe("debris", () => {
  const PLANET_IN_THE_WAY: RoundLayout = { ...FACING_LAYOUT, planets: [{ sprite: 1, mass: 8, radius: 30, x: 400, y: 300 }] };

  function planetHitSession(reducedMotion: boolean): ScreenSession {
    const session = sessionOn("match");
    const match = createMatch(5, structuredClone(PLANET_IN_THE_WAY));
    showMatch(session, match);
    fire(match);
    for (let i = 0; i < 1000 && matchView(match).impact === undefined; i++) {
      stepScreenSession(session, reducedMotion);
    }
    return session;
  }

  function playSeededMatch(reducedMotion: boolean): Match {
    const session = sessionOn("match");
    const match = shownMatch(session);
    for (let shot = 0; shot < 6; shot++) {
      adjustAim(match, { angle: 25 * shot, power: 20 * shot });
      fire(match);
      for (let i = 0; i < 1000 && matchView(match).phase.kind === "inFlight"; i++) {
        stepScreenSession(session, reducedMotion);
      }
    }
    return match;
  }

  test("a planet hit throws large particles from the impact point", () => {
    const session = planetHitSession(false);
    const impact = matchView(shownMatch(session)).impact!;

    expect(session.debris).toHaveLength(BURST_COUNT.large);
    expect(session.debris.every((particle) => particle.size === "large")).toBe(true);
    expect(session.debris.every((particle) => particle.x === impact.x && particle.y === impact.y)).toBe(true);
  });

  test("a ship hit throws large particles", () => {
    const session = sessionOn("match");
    const match = createMatch(1, structuredClone(FACING_LAYOUT));
    showMatch(session, match);
    fire(match);
    for (let i = 0; i < 1000 && matchView(match).phase.kind !== "roundOver"; i++) {
      stepScreenSession(session, false);
    }

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

    expect(matchView(shownMatch(session)).impact).toBeDefined();
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
    for (let i = 0; i < 5000 && session.debris.length === 0; i++) {
      stepScreenSession(session, false);
    }

    expect(session.debris.length).toBeGreaterThan(0);
  });

  test("starting and leaving a match clears the debris", () => {
    const session = planetHitSession(false);

    enterScreen(session, "mainMenu", 2, DEFAULT_MATCH_RULES);
    expect(session.debris).toEqual([]);

    session.debris = burstDebris({ x: 100, y: 100 }, "large", false, centredRandom);
    enterScreen(session, "match", 3, DEFAULT_MATCH_RULES);
    expect(session.debris).toEqual([]);
  });

  test("the frame draws the debris", () => {
    const session = planetHitSession(false);

    const dots = describeScreenSessionFrame(session, CONTOURS_HIDDEN, false).items.filter((item) => item.kind === "dot");

    expect(dots).toHaveLength(BURST_COUNT.large);
  });
});
