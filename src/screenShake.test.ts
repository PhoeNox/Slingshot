// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { createMatch, fire, matchView, step, type Match, type RoundLayout } from "./core/match";
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

const extremeRandom = () => 1;

describe("screenShakeOffset", () => {
  test("is still while aiming", () => {
    const match = createMatch(2, structuredClone(FACING_LAYOUT));

    expect(screenShakeOffset(matchView(match), extremeRandom)).toBe(NO_SHAKE);
  });

  test("shakes hardest right after the hit and calms down", () => {
    const match = roundOverMatch();

    const start = screenShakeOffset(matchView(match), extremeRandom);
    for (let i = 0; i < 5; i++) {
      step(match);
    }
    const later = screenShakeOffset(matchView(match), extremeRandom);

    expect(start.x).toBeGreaterThan(0);
    expect(later.x).toBeLessThan(start.x);
  });

  test("stays within a few pixels", () => {
    const match = roundOverMatch();

    const offset = screenShakeOffset(matchView(match), extremeRandom);

    expect(Math.abs(offset.x)).toBeLessThanOrEqual(6);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(6);
  });

  test("stops ten steps after the hit", () => {
    const match = roundOverMatch();
    for (let i = 0; i < 10; i++) {
      step(match);
    }

    expect(screenShakeOffset(matchView(match), extremeRandom)).toBe(NO_SHAKE);
  });
});
