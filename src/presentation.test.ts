// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import type { RoundResult } from "./core/match";
import type { Planet } from "./core/round";
import {
  afterglowSegments,
  cornerBrackets,
  explosionBloom,
  explosionSize,
  gravityWellContourRadii,
  gridLines,
  insetRect,
  roundBanner,
  roundOverMessageBox,
  roundOverTitle,
  scoreBreakdownRows,
  scoreChangeText,
  SHIP_FRAME_WIDTH,
  shipPose,
  timeoutText,
  ZOOM_VIEW,
  ZOOMED_PLAYING_AREA,
  zoomViewPoint,
} from "./presentation";

const hit: RoundResult = {
  outcome: "hit",
  shooter: "left",
  hitShip: "right",
  baseScore: 1500,
  quickHitBonus: 200,
  powerPenalty: 600,
  scoreChange: 1100,
};

const selfHit: RoundResult = {
  outcome: "selfHit",
  shooter: "right",
  hitShip: "right",
  baseScore: -2000,
  quickHitBonus: 0,
  powerPenalty: 0,
  scoreChange: -2000,
};

describe("shipPose", () => {
  test("an aim along the sheet facing shows the first frame alone", () => {
    const pose = shipPose(90, "left");

    expect(pose).toEqual({ rotation: 0, frameLeft: 0, nextFrameLeft: SHIP_FRAME_WIDTH, nextFrameWeight: 0 });
  });

  test("the right ship sheet faces the opposite way", () => {
    const pose = shipPose(270, "right");

    expect(pose.rotation).toBe(0);
    expect(pose.frameLeft).toBe(0);
  });

  test("an aim on a frame boundary shows that frame alone", () => {
    const pose = shipPose(135, "left");

    expect(pose.frameLeft).toBe(SHIP_FRAME_WIDTH);
    expect(pose.nextFrameLeft).toBe(2 * SHIP_FRAME_WIDTH);
    expect(pose.nextFrameWeight).toBe(0);
  });

  test("an aim between frames blends both by distance", () => {
    const pose = shipPose(112.5, "left");

    expect(pose.frameLeft).toBe(0);
    expect(pose.nextFrameLeft).toBe(SHIP_FRAME_WIDTH);
    expect(pose.nextFrameWeight).toBeCloseTo(0.5);
    expect(pose.rotation).toBeCloseTo(Math.PI / 8);
  });

  test("the last frame blends into the first", () => {
    const pose = shipPose(67.5, "left");

    expect(pose.frameLeft).toBe(7 * SHIP_FRAME_WIDTH);
    expect(pose.nextFrameLeft).toBe(0);
    expect(pose.nextFrameWeight).toBeCloseTo(0.5);
    expect(pose.rotation).toBeCloseTo((337.5 * Math.PI) / 180);
  });
});

describe("gravityWellContourRadii", () => {
  const light: Planet = { sprite: 1, mass: 8, radius: 25, x: 400, y: 300 };
  const heavy: Planet = { sprite: 2, mass: 512, radius: 100, x: 400, y: 300 };

  test("rings lie outside the planet in increasing order", () => {
    const radii = gravityWellContourRadii(light);

    expect(radii).toHaveLength(3);
    expect(radii[0]).toBeGreaterThan(light.radius);
    expect(radii[1]).toBeGreaterThan(radii[0]);
    expect(radii[2]).toBeGreaterThan(radii[1]);
  });

  test("a heavier planet has a wider contour set", () => {
    const lightRadii = gravityWellContourRadii(light);
    const heavyRadii = gravityWellContourRadii(heavy);

    const lightWidth = lightRadii[2] - light.radius;
    const heavyWidth = heavyRadii[2] - heavy.radius;
    expect(heavyWidth).toBeGreaterThan(lightWidth);
  });
});

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

describe("panel geometry", () => {
  const rect = { left: 10, top: 20, width: 100, height: 50 };

  test("insetRect shrinks a rect evenly on all sides", () => {
    expect(insetRect(rect, 4)).toEqual({ left: 14, top: 24, width: 92, height: 42 });
  });

  test("cornerBrackets draws two arms pointing inwards from each corner", () => {
    const brackets = cornerBrackets(rect, 5);

    expect(brackets).toHaveLength(8);
    expect(brackets.slice(0, 2)).toEqual([
      { from: { x: 10, y: 20 }, to: { x: 15, y: 20 } },
      { from: { x: 10, y: 20 }, to: { x: 10, y: 25 } },
    ]);
    expect(brackets.slice(6)).toEqual([
      { from: { x: 110, y: 70 }, to: { x: 105, y: 70 } },
      { from: { x: 110, y: 70 }, to: { x: 110, y: 65 } },
    ]);
  });

  test("gridLines draws interior lines at the given spacing", () => {
    const grid = gridLines(rect, 25);

    expect(grid).toEqual([
      { from: { x: 35, y: 20 }, to: { x: 35, y: 70 } },
      { from: { x: 60, y: 20 }, to: { x: 60, y: 70 } },
      { from: { x: 85, y: 20 }, to: { x: 85, y: 70 } },
      { from: { x: 10, y: 45 }, to: { x: 110, y: 45 } },
    ]);
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

describe("round-over message", () => {
  test("a hit names the shooter and the hit ship", () => {
    expect(roundOverTitle(hit)).toBe("Player 1 hit player 2");
  });

  test("a self-hit names the shooter's own ship", () => {
    expect(roundOverTitle(selfHit)).toBe("Player 2 hit their own ship");
  });

  test("a hit lists base score, quick-hit bonus and power penalty", () => {
    expect(scoreBreakdownRows(hit)).toEqual([
      { label: "Hit opponent:", value: "1500", top: 65 },
      { label: "Quick-hit bonus:", value: "200", top: 85 },
      { label: "Power penalty:", value: "-600", top: 105 },
    ]);
  });

  test("a self-hit lists only the deduction", () => {
    expect(scoreBreakdownRows(selfHit)).toEqual([{ label: "Hit self:", value: "-2000", top: 65 }]);
  });

  test("a hit message is taller to fit its extra rows", () => {
    const hitBox = roundOverMessageBox("hit");
    const selfHitBox = roundOverMessageBox("selfHit");

    expect(hitBox.height).toBeGreaterThan(selfHitBox.height);
    expect(hitBox.top).toBeLessThan(selfHitBox.top);
  });

  test.each([
    [1100, "1100 added to score"],
    [0, "0 added to score"],
    [-2000, "2000 deducted from score"],
  ])("score change %i reads %s", (scoreChange, text) => {
    expect(scoreChangeText(scoreChange)).toBe(text);
  });
});

describe("timeoutText", () => {
  test("before the timeout it counts down the flight steps left", () => {
    expect(timeoutText(250, false)).toBe("Timeout in 250");
  });

  test("after the timeout it reports the shot timed out", () => {
    expect(timeoutText(0, true)).toBe("Shot timed out...");
  });
});

describe("zoom view", () => {
  test("the zoom view is centred on the screen", () => {
    expect(ZOOM_VIEW).toEqual({ left: 100, top: 75, width: 600, height: 450 });
  });

  test("the zoomed playing area sits inside the zoom view", () => {
    expect(ZOOMED_PLAYING_AREA).toEqual({ left: 300, top: 225, width: 200, height: 150 });
  });

  test.each([
    [{ x: -800, y: -600 }, { x: 100, y: 75 }],
    [{ x: 0, y: 0 }, { x: 300, y: 225 }],
    [{ x: 800, y: 600 }, { x: 500, y: 375 }],
    [{ x: 1600, y: 1200 }, { x: 700, y: 525 }],
  ])("tracking area point %o maps to screen point %o", (point, screenPoint) => {
    expect(zoomViewPoint(point)).toEqual(screenPoint);
  });
});
