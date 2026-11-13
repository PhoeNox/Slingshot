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
  type Match,
  type MatchRules,
  type RoundLayout,
} from "./core/match";
import { burstDebris, BURST_COUNT } from "./debris";
import { describeFrame, type DisplaySettings } from "./frame";
import {
  createScreenSession,
  describeScreenSessionFrame,
  enterScreen,
  screenSessionShake,
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

function sessionOn(...screens: ScreenSession["screen"][]): ScreenSession {
  const session = createScreenSession(centredRandom);
  screens.forEach((screen, index) => enterScreen(session, screen, index + 1, DEFAULT_MATCH_RULES));
  return session;
}

const SIX_PLANET_RULES: MatchRules = { ...DEFAULT_MATCH_RULES, planetCount: { min: 6, max: 6 } };

const CONTOURS_HIDDEN: DisplaySettings = { gravityWellContours: false };

const extremeRandom = () => 1;
const centredRandom = () => 0.5;

describe("entering a screen", () => {
  test("starts attract mode behind the main menu", () => {
    const session = sessionOn("mainMenu");

    expect(session.attract).toBeDefined();
    expect(session.match).toBeUndefined();
  });

  test("discards attract mode when a match starts", () => {
    const session = sessionOn("mainMenu", "match");

    expect(session.attract).toBeUndefined();
    expect(session.match).toBeDefined();
  });

  test("starts the match under the given match rules", () => {
    const session = createScreenSession(centredRandom);

    enterScreen(session, "match", 1, SIX_PLANET_RULES);

    expect(session.match!.rules).toEqual(SIX_PLANET_RULES);
    expect(session.match!.planets).toHaveLength(6);
  });

  test("keeps attract mode on the default match rules", () => {
    const session = createScreenSession(centredRandom);

    enterScreen(session, "mainMenu", 1, SIX_PLANET_RULES);

    expect(session.attract!.match.rules).toEqual(DEFAULT_MATCH_RULES);
  });

  test("drops the match when leaving it", () => {
    const session = sessionOn("mainMenu", "match", "mainMenu");

    expect(session.match).toBeUndefined();
    expect(session.attract).toBeDefined();
  });

  test("keeps attract mode across a main menu, credits, main menu round trip", () => {
    const session = sessionOn("mainMenu");
    const attract = session.attract;

    enterScreen(session, "credits", 7, DEFAULT_MATCH_RULES);
    enterScreen(session, "mainMenu", 8, DEFAULT_MATCH_RULES);

    expect(session.attract).toBe(attract);
  });
});

describe("stepping", () => {
  test("plays attract mode behind the main menu", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(session.attract);

    stepScreenSession(session, false);

    expect(session.attract).not.toEqual(before);
  });

  test("plays the main menu's attract mode behind the settings", () => {
    const session = sessionOn("mainMenu");
    const attract = session.attract;
    enterScreen(session, "settings", 7, DEFAULT_MATCH_RULES);
    const before = structuredClone(session.attract);

    stepScreenSession(session, false);

    expect(session.attract).toBe(attract);
    expect(session.attract).not.toEqual(before);
  });

  test("pauses attract mode behind the credits", () => {
    const session = sessionOn("mainMenu", "credits");
    const before = structuredClone(session.attract);

    stepScreenSession(session, false);

    expect(session.attract).toEqual(before);
  });

  test("pauses attract mode under reduced motion", () => {
    const session = sessionOn("mainMenu");
    const before = structuredClone(session.attract);

    stepScreenSession(session, true);

    expect(session.attract).toEqual(before);
  });

  test("steps the active match", () => {
    const session = sessionOn("match");
    fire(session.match!);
    const before = structuredClone(session.match);

    stepScreenSession(session, true);

    expect(session.match).not.toEqual(before);
  });
});

describe("describing the frame", () => {
  test("shows the match while one is active", () => {
    const session = sessionOn("match");

    expect(describeScreenSessionFrame(session, CONTOURS_HIDDEN)).toEqual(
      describeFrame(matchView(session.match!), CONTOURS_HIDDEN, session.debris, "match"),
    );
  });

  test("shows attract mode otherwise", () => {
    const session = sessionOn("mainMenu", "credits");

    expect(describeScreenSessionFrame(session, CONTOURS_HIDDEN)).toEqual(
      describeFrame(matchView(session.attract!.match), CONTOURS_HIDDEN, session.debris, "attract"),
    );
  });
});

describe("screen shake", () => {
  test("follows the match right after a hit", () => {
    const session = sessionOn("match");
    session.match = roundOverMatch();

    const shake = screenSessionShake(session, false, extremeRandom);

    expect(shake).toEqual(screenShakeOffset(matchView(session.match), extremeRandom));
    expect(shake).not.toEqual(NO_SHAKE);
  });

  test("is still under reduced motion", () => {
    const session = sessionOn("match");
    session.match = roundOverMatch();

    expect(screenSessionShake(session, true, extremeRandom)).toBe(NO_SHAKE);
  });

  test("is still without a match", () => {
    const session = sessionOn("mainMenu");

    expect(screenSessionShake(session, false, extremeRandom)).toBe(NO_SHAKE);
  });
});

describe("debris", () => {
  const PLANET_IN_THE_WAY: RoundLayout = { ...FACING_LAYOUT, planets: [{ sprite: 1, mass: 8, radius: 30, x: 400, y: 300 }] };

  function planetHitSession(reducedMotion: boolean): ScreenSession {
    const session = sessionOn("match");
    session.match = createMatch(5, structuredClone(PLANET_IN_THE_WAY));
    fire(session.match);
    for (let i = 0; i < 1000 && matchView(session.match).impact === undefined; i++) {
      stepScreenSession(session, reducedMotion);
    }
    return session;
  }

  function playSeededMatch(reducedMotion: boolean): Match {
    const session = sessionOn("match");
    const match = session.match!;
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
    const impact = matchView(session.match!).impact!;

    expect(session.debris).toHaveLength(BURST_COUNT.large);
    expect(session.debris.every((particle) => particle.size === "large")).toBe(true);
    expect(session.debris.every((particle) => particle.x === impact.x && particle.y === impact.y)).toBe(true);
  });

  test("a ship hit throws large particles", () => {
    const session = sessionOn("match");
    session.match = createMatch(1, structuredClone(FACING_LAYOUT));
    fire(session.match);
    for (let i = 0; i < 1000 && matchView(session.match).phase.kind !== "roundOver"; i++) {
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

    expect(matchView(session.match!).impact).toBeDefined();
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

    const dots = describeScreenSessionFrame(session, CONTOURS_HIDDEN).filter((item) => item.kind === "dot");

    expect(dots).toHaveLength(BURST_COUNT.large);
  });
});
