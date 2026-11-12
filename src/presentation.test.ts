// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import type { RoundResult } from "./core/match";
import {
  explosionSize,
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
