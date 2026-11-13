// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { isInsidePlayingArea } from "./core/flight";
import { adjustAim, aimLine, createMatch, fire, matchView, step, type Match, type RoundLayout } from "./core/match";
import type { Side } from "./core/round";
import { describeBackdropFrame, describeFrame, type FrameItem, type GroupItem, type ImageItem, type SpriteFrameItem } from "./frame";
import { angleInfoText, powerInfoText, roundOverTitle, ZOOM_SCALE } from "./presentation";

const EMPTY_LAYOUT: RoundLayout = {
  ships: {
    left: { x: 40, y: 300, aim: { angle: 90, power: 100 } },
    right: { x: 760, y: 300, aim: { angle: 270, power: 100 } },
  },
  planets: [],
};

function emptyMatch(seed: number): Match {
  return createMatch(seed, structuredClone(EMPTY_LAYOUT));
}

function frameOf(match: Match): FrameItem[] {
  return flatten(describeFrame(matchView(match)));
}

function flatten(items: FrameItem[]): FrameItem[] {
  return items.flatMap((item) => (item.kind === "group" ? [item, ...flatten(item.items)] : [item]));
}

function textsOf(frame: FrameItem[]): string[] {
  return frame.flatMap((item) => (item.kind === "text" ? [item.text] : []));
}

function imagesOf(frame: FrameItem[], sprite: ImageItem["sprite"]): ImageItem[] {
  return frame.filter((item): item is ImageItem => item.kind === "image" && item.sprite === sprite);
}

function shipSpritesOf(frame: FrameItem[]): Set<string> {
  const shipFrames = frame.filter((item): item is SpriteFrameItem => item.kind === "spriteFrame");
  return new Set(shipFrames.map((item) => item.sprite));
}

function zoomGroupsOf(frame: FrameItem[]): GroupItem[] {
  return frame.filter((item): item is GroupItem => item.kind === "group" && item.transform.scale === ZOOM_SCALE);
}

function opponentOf(side: Side): Side {
  return side === "left" ? "right" : "left";
}

function aimAt(match: Match, angle: number, power: number): void {
  const aim = matchView(match).ships[matchView(match).activePlayer].aim;
  adjustAim(match, { angle: angle - aim.angle, power: power - aim.power });
}

function stepUntil(match: Match, done: () => boolean): void {
  for (let i = 0; i < 1000; i++) {
    if (done()) {
      return;
    }
    step(match);
  }
  throw new Error("condition not reached after 1000 steps");
}

function hitOpponent(match: Match): void {
  const angle = matchView(match).activePlayer === "left" ? 90 : 270;
  aimAt(match, angle, 100);
  fire(match);
  stepUntil(match, () => matchView(match).phase.kind === "roundOver");
}

function missileOutsidePlayingArea(match: Match): boolean {
  const phase = matchView(match).phase;
  return phase.kind === "inFlight" && !isInsidePlayingArea(phase.missile);
}

describe("aiming frame", () => {
  test("shows both ships, the aim line and the aim info of the active ship", () => {
    const match = emptyMatch(1);
    const view = matchView(match);
    const aim = view.ships[view.activePlayer].aim;

    const frame = frameOf(match);

    const lines = frame.filter((item) => item.kind === "lines");
    const expectedAimLine = aimLine(view);
    expect(shipSpritesOf(frame)).toEqual(new Set(["leftShip", "rightShip"]));
    expect(lines).toContainEqual(expect.objectContaining({ segments: [expectedAimLine] }));
    expect(textsOf(frame)).toEqual(expect.arrayContaining([angleInfoText(aim), powerInfoText(aim)]));
  });

  test("shows no missile and no flight info", () => {
    const frame = frameOf(emptyMatch(2));

    expect(imagesOf(frame, "missile")).toHaveLength(0);
    expect(textsOf(frame).some((text) => text.startsWith("Power penalty"))).toBe(false);
  });
});

describe("in-flight frame", () => {
  test("a missile inside the playing area is drawn at its position without the zoom view", () => {
    const match = emptyMatch(3);
    fire(match);
    step(match);

    const frame = frameOf(match);

    const missiles = imagesOf(frame, "missile");
    expect(missiles).toHaveLength(1);
    expect(missiles[0].target.width).toBe(25);
    expect(zoomGroupsOf(frame)).toHaveLength(0);
    expect(frame.some((item) => item.kind === "fillRect")).toBe(false);
  });

  test("a missile outside the playing area is shown in the zoom view", () => {
    const match = emptyMatch(4);
    aimAt(match, 0, 250);
    fire(match);
    stepUntil(match, () => missileOutsidePlayingArea(match));

    const frame = frameOf(match);

    const missiles = imagesOf(frame, "missile");
    const zoomGroups = zoomGroupsOf(frame);
    expect(missiles).toHaveLength(1);
    expect(missiles[0].target.width).toBeCloseTo(25 / 3);
    expect(zoomGroups).toHaveLength(1);
    expect(flatten(zoomGroups[0].items).some((item) => item.kind === "spriteFrame")).toBe(true);
    expect(frame.some((item) => item.kind === "fillRect")).toBe(true);
  });

  test("shows the power penalty and the timeout but no aim line or aim info", () => {
    const match = emptyMatch(5);
    const aim = { ...matchView(match).ships[matchView(match).activePlayer].aim };
    const aimedLine = aimLine(matchView(match));
    fire(match);

    const frame = frameOf(match);

    const texts = textsOf(frame);
    const lines = frame.filter((item) => item.kind === "lines");
    expect(texts.some((text) => text.startsWith("Power penalty"))).toBe(true);
    expect(texts.some((text) => text.startsWith("Timeout in"))).toBe(true);
    expect(texts).not.toContain(angleInfoText(aim));
    expect(lines).not.toContainEqual(expect.objectContaining({ segments: [aimedLine] }));
  });
});

describe("round-over frame", () => {
  test("omits the destroyed ship and shows the explosion on it with the round-over message", () => {
    const match = emptyMatch(6);
    const shooter = matchView(match).activePlayer;
    const target = opponentOf(shooter);
    hitOpponent(match);
    const phase = matchView(match).phase;
    if (phase.kind !== "roundOver") {
      throw new Error("expected the round to be over");
    }

    const frame = frameOf(match);

    const explosions = imagesOf(frame, "explosion");
    const targetShip = matchView(match).ships[target];
    expect(shipSpritesOf(frame)).toEqual(new Set([`${shooter}Ship`]));
    expect(explosions).toHaveLength(1);
    expect(explosions[0].target.left + explosions[0].target.width / 2).toBe(targetShip.x);
    expect(explosions[0].target.top + explosions[0].target.height / 2).toBe(targetShip.y);
    expect(textsOf(frame)).toContain(roundOverTitle(phase.result));
  });

  test("the explosion is gone after it has burnt out while the message stays", () => {
    const match = emptyMatch(7);
    hitOpponent(match);
    for (let i = 0; i < 5; i++) {
      step(match);
    }

    const frame = frameOf(match);

    expect(imagesOf(frame, "explosion")).toHaveLength(0);
    expect(textsOf(frame)).toContain("Press Space or Enter for the next round");
  });
});

describe("round banner", () => {
  test("shows the round number at round start", () => {
    const frame = frameOf(emptyMatch(8));

    expect(textsOf(frame)).toContain("Round 1");
  });

  test("is gone once it has faded", () => {
    const match = emptyMatch(9);
    for (let i = 0; i < 31; i++) {
      step(match);
    }

    const frame = frameOf(match);

    expect(textsOf(frame).some((text) => text.startsWith("Round"))).toBe(false);
  });
});

describe("backdrop-only frame", () => {
  test("shows the backdrop covering the playing area and nothing else", () => {
    const frame = flatten(describeBackdropFrame());

    expect(imagesOf(frame, "backdrop")).toEqual([
      expect.objectContaining({ target: { left: 0, top: 0, width: 800, height: 600 } }),
    ]);
    expect(shipSpritesOf(frame).size).toBe(0);
    expect(imagesOf(frame, "missile")).toHaveLength(0);
    expect(frame.some((item) => item.kind === "image" && item.sprite.startsWith("planet"))).toBe(false);
    expect(textsOf(frame)).toHaveLength(0);
  });
});
