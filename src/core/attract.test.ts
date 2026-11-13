// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import {
  createAttractMode,
  MAX_CANDIDATE_FLIGHT_STEPS,
  NEXT_ROUND_DELAY_STEPS,
  SHOT_DELAY_STEPS,
  stepAttractMode,
  type AttractMode,
} from "./attract";
import { matchView, previewShot } from "./match";

function stepUntil(attract: AttractMode, done: () => boolean): void {
  for (let i = 0; i < 100_000; i++) {
    if (done()) {
      return;
    }
    stepAttractMode(attract);
  }
  throw new Error("condition never reached");
}

function phaseOf(attract: AttractMode) {
  return matchView(attract.match).phase.kind;
}

describe("attract mode", () => {
  test("fires a shot after a short aiming pause", () => {
    const attract = createAttractMode(1);

    for (let i = 0; i < SHOT_DELAY_STEPS - 1; i++) {
      stepAttractMode(attract);
    }
    expect(phaseOf(attract)).toBe("aiming");

    stepAttractMode(attract);
    expect(phaseOf(attract)).toBe("inFlight");
  });

  test("shots alternate sides within a round", () => {
    const attract = createAttractMode(2);
    stepUntil(attract, () => phaseOf(attract) === "roundOver");

    const trails = matchView(attract.match).trails;
    const shooters = trails
      .filter((segment, index) => index === 0 || trails[index - 1].shotNumber !== segment.shotNumber)
      .map((segment) => segment.shooter);
    shooters.forEach((shooter, index) => {
      if (index > 0) {
        expect(shooter).not.toBe(shooters[index - 1]);
      }
    });
  });

  test("aims at a flight at least as long inside the playing area as a shot straight off-screen", () => {
    const attract = createAttractMode(3);
    stepAttractMode(attract);
    const view = matchView(attract.match);
    const chosenAim = view.ships[view.activePlayer].aim;
    const offScreenAim = { angle: 0, power: 300 };

    const chosenFlight = previewShot(attract.match, chosenAim, MAX_CANDIDATE_FLIGHT_STEPS);
    const offScreenFlight = previewShot(attract.match, offScreenAim, MAX_CANDIDATE_FLIGHT_STEPS);

    expect(chosenFlight.endedWithinLimit).toBe(true);
    expect(chosenFlight.inAreaSteps).toBeGreaterThan(0);
    expect(chosenFlight.inAreaSteps).toBeGreaterThanOrEqual(offScreenFlight.inAreaSteps);
  });

  test("a hit plays out, then a fresh round starts", () => {
    const attract = createAttractMode(4);
    stepUntil(attract, () => phaseOf(attract) === "roundOver");
    const roundNumber = matchView(attract.match).roundNumber;

    for (let i = 0; i < NEXT_ROUND_DELAY_STEPS - 1; i++) {
      stepAttractMode(attract);
    }
    expect(phaseOf(attract)).toBe("roundOver");

    stepAttractMode(attract);
    expect(phaseOf(attract)).toBe("aiming");
    expect(matchView(attract.match).roundNumber).toBe(roundNumber + 1);
    expect(matchView(attract.match).trails).toEqual([]);
  });

  test("the same seed plays the same demo", () => {
    const first = createAttractMode(5);
    const second = createAttractMode(5);
    for (let i = 0; i < 2000; i++) {
      stepAttractMode(first);
      stepAttractMode(second);
    }

    expect(matchView(first.match)).toEqual(matchView(second.match));
  });
});
