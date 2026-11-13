// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { afterglowSegments, explosionBloom, explosionSize, roundBanner, trailAlpha } from "./animationCurves";

describe("explosionSize", () => {
  test.each([
    [0, 55],
    [1, 88],
    [2, 100],
    [3, 88],
    [4, 55],
  ])("%i steps since the hit gives size %i", (steps, size) => {
    expect(explosionSize(steps)).toBe(size);
  });

  test("the explosion is gone five steps after the hit", () => {
    expect(explosionSize(5)).toBeNull();
    expect(explosionSize(20)).toBeNull();
  });
});

describe("explosionBloom", () => {
  test("the bloom starts at full strength and widens as it fades", () => {
    const start = explosionBloom(0)!;
    const later = explosionBloom(4)!;

    expect(start.alpha).toBe(1);
    expect(later.radius).toBeGreaterThan(start.radius);
    expect(later.alpha).toBeLessThan(start.alpha);
  });

  test("the bloom is gone eight steps after the hit", () => {
    expect(explosionBloom(7)).not.toBeNull();
    expect(explosionBloom(8)).toBeNull();
  });
});

describe("roundBanner", () => {
  test("the banner starts at size zero with the round number", () => {
    const banner = roundBanner(3, 0);

    expect(banner).toEqual({ text: "Round 3", fontSize: 0, alpha: 140 / 255 });
  });

  test("the banner grows and fades over the steps into the round", () => {
    const early = roundBanner(1, 10)!;
    const late = roundBanner(1, 20)!;

    expect(late.fontSize).toBeGreaterThan(early.fontSize);
    expect(late.alpha).toBeLessThan(early.alpha);
  });

  test("the banner is shown up to 30 steps into the round", () => {
    expect(roundBanner(1, 30)).not.toBeNull();
    expect(roundBanner(1, 31)).toBeNull();
  });
});

describe("afterglowSegments", () => {
  const trail = Array.from({ length: 60 }, (_, index) => ({ from: { x: index, y: 0 }, to: { x: index + 1, y: 0 } }));

  test("covers only the segments flown by the current shot", () => {
    const glow = afterglowSegments(trail, 3);

    expect(glow.map((entry) => entry.segment)).toEqual(trail.slice(57));
  });

  test("covers at most the last 45 segments", () => {
    const glow = afterglowSegments(trail, 60);

    expect(glow).toHaveLength(45);
    expect(glow[0].segment).toBe(trail[15]);
  });

  test("fades by age, from full at the newest segment", () => {
    const glow = afterglowSegments(trail, 60);

    expect(glow.at(-1)!.alpha).toBe(1);
    expect(glow[0].alpha).toBeCloseTo(1 / 45);
  });

  test("a just-launched shot has no afterglow", () => {
    expect(afterglowSegments(trail, 0)).toEqual([]);
  });
});

describe("trailAlpha", () => {
  test("fades by a quarter with each later shot", () => {
    expect(trailAlpha(0)).toBe(0.6);
    expect(trailAlpha(1)).toBeCloseTo(0.45);
    expect(trailAlpha(2)).toBeCloseTo(0.3375);
  });

  test("never drops below a faint floor", () => {
    expect(trailAlpha(5)).toBe(0.15);
    expect(trailAlpha(20)).toBe(0.15);
  });
});
