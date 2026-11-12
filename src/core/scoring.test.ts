// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { nextRoundShooter, powerPenaltyFor, roundResultFor } from "./scoring";

describe("roundResultFor", () => {
  test.each([
    [1, 500],
    [2, 200],
    [3, 100],
    [4, 0],
    [7, 0],
  ])("a hit on attempt %i earns a quick-hit bonus of %i", (attempt, bonus) => {
    const result = roundResultFor("left", "right", attempt, 100);

    expect(result).toEqual({
      outcome: "hit",
      shooter: "left",
      hitShip: "right",
      baseScore: 1500,
      quickHitBonus: bonus,
      powerPenalty: 500,
      scoreChange: 1500 + bonus - 500,
    });
  });

  test("a hit deducts the power penalty of the hitting shot", () => {
    const result = roundResultFor("right", "left", 4, 240);

    expect(result.powerPenalty).toBe(1200);
    expect(result.scoreChange).toBe(1500 - 1200);
  });

  test("a self-hit deducts 2000 with no quick-hit bonus or power penalty", () => {
    const result = roundResultFor("right", "right", 1, 300);

    expect(result).toEqual({
      outcome: "selfHit",
      shooter: "right",
      hitShip: "right",
      baseScore: -2000,
      quickHitBonus: 0,
      powerPenalty: 0,
      scoreChange: -2000,
    });
  });
});

describe("powerPenaltyFor", () => {
  test.each([
    [0, 0],
    [100, 500],
    [350, 1750],
  ])("power %i gives a power penalty of %i", (power, penalty) => {
    expect(powerPenaltyFor(power)).toBe(penalty);
  });
});

describe("nextRoundShooter", () => {
  test.each([
    ["left", "left"],
    ["right", "left"],
  ] as const)("left with the lower score shoots first after %s shot last", (lastShooter, expected) => {
    expect(nextRoundShooter({ left: 100, right: 900 }, lastShooter)).toBe(expected);
  });

  test.each([
    ["left", "right"],
    ["right", "right"],
  ] as const)("right with the lower score shoots first after %s shot last", (lastShooter, expected) => {
    expect(nextRoundShooter({ left: -500, right: -2000 }, lastShooter)).toBe(expected);
  });

  test.each([
    ["left", "right"],
    ["right", "left"],
  ] as const)("on tied scores the player after %s shoots first", (lastShooter, expected) => {
    expect(nextRoundShooter({ left: 700, right: 700 }, lastShooter)).toBe(expected);
  });
});
