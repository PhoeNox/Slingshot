// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { generateStars, starAlpha, type Star } from "./stars";

const STAR: Star = {
  x: 0,
  y: 0,
  size: 2,
  brightness: 0.8,
  twinkleDepth: 0.5,
  twinklePeriodMs: 4000,
  twinklePhase: 0,
  glows: false,
};

describe("generateStars", () => {
  test("places every star inside the playing area", () => {
    const stars = generateStars(Math.random);

    for (const star of stars) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(800);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(600);
    }
  });

  test("makes only a handful of stars glow", () => {
    const stars = generateStars(Math.random);
    const glowing = stars.filter((star) => star.glows);

    expect(glowing.length).toBeGreaterThan(0);
    expect(glowing.length).toBeLessThan(stars.length / 10);
  });
});

describe("starAlpha", () => {
  test("starts at the star's mid twinkle", () => {
    expect(starAlpha(STAR, 0)).toBeCloseTo(0.8 * (1 - 0.25));
  });

  test("dims by the full twinkle depth at the cycle's peak", () => {
    expect(starAlpha(STAR, 1000)).toBeCloseTo(0.8 * 0.5);
  });

  test("returns to full brightness at the cycle's trough", () => {
    expect(starAlpha(STAR, 3000)).toBeCloseTo(0.8);
  });

  test("repeats every period", () => {
    expect(starAlpha(STAR, 4700)).toBeCloseTo(starAlpha(STAR, 700));
  });
});
