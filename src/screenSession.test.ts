// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { createMatch, fire, matchView, step, type Match, type RoundLayout } from "./core/match";
import { describeAttractFrame, describeFrame, type DisplaySettings } from "./frame";
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
  const session = createScreenSession();
  screens.forEach((screen, index) => enterScreen(session, screen, index + 1));
  return session;
}

const CONTOURS_HIDDEN: DisplaySettings = { gravityWellContours: false };

const extremeRandom = () => 1;

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

  test("drops the match when leaving it", () => {
    const session = sessionOn("mainMenu", "match", "mainMenu");

    expect(session.match).toBeUndefined();
    expect(session.attract).toBeDefined();
  });

  test("keeps attract mode across a main menu, credits, main menu round trip", () => {
    const session = sessionOn("mainMenu");
    const attract = session.attract;

    enterScreen(session, "credits", 7);
    enterScreen(session, "mainMenu", 8);

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
    enterScreen(session, "settings", 7);
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
      describeFrame(matchView(session.match!), CONTOURS_HIDDEN),
    );
  });

  test("shows attract mode otherwise", () => {
    const session = sessionOn("mainMenu", "credits");

    expect(describeScreenSessionFrame(session, CONTOURS_HIDDEN)).toEqual(
      describeAttractFrame(matchView(session.attract!.match), CONTOURS_HIDDEN),
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
