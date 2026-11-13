// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { COLOURS } from "./colours";
import { isInsidePlayingArea, type Segment } from "./core/flight";
import {
  adjustAim,
  createMatch,
  DEFAULT_MATCH_RULES,
  fire,
  matchView,
  step,
  type Match,
  type MatchView,
  type RoundLayout,
  type RoundOverView,
  type RoundResult,
} from "./core/match";
import type { Planet, Side } from "./core/round";
import {
  describeAttractFrame,
  describeBackdropFrame,
  describeFrame,
  type BloomItem,
  type DisplaySettings,
  type FrameItem,
  type GroupItem,
  type ImageItem,
  type LinesItem,
  type RingItem,
  type SpriteFrameItem,
  type StrokeRectItem,
  type TextItem,
} from "./frame";

const PLAYER_COLOURS: Record<Side, string> = { left: COLOURS.leftPlayer, right: COLOURS.rightPlayer };
const SHEET_FACING: Record<Side, number> = { left: 90, right: 270 };
const HIT_TITLES: Record<Side, string> = { left: "Player 1 hit player 2", right: "Player 2 hit player 1" };
const PLAYING_AREA = { left: 0, top: 0, width: 800, height: 600 };

const CONTOURS_SHOWN: DisplaySettings = { gravityWellContours: true };
const CONTOURS_HIDDEN: DisplaySettings = { gravityWellContours: false };

const LIGHT_PLANET: Planet = { sprite: 1, mass: 8, radius: 25, x: 300, y: 200 };
const HEAVY_PLANET: Planet = { sprite: 2, mass: 512, radius: 100, x: 500, y: 400 };

const EMPTY_LAYOUT: RoundLayout = {
  ships: {
    left: { x: 40, y: 300, aim: { angle: 90, power: 100 } },
    right: { x: 760, y: 300, aim: { angle: 270, power: 100 } },
  },
  planets: [],
};

const HIT: RoundResult = {
  outcome: "hit",
  shooter: "left",
  hitShip: "right",
  baseScore: 1500,
  quickHitBonus: 200,
  powerPenalty: 600,
  scoreChange: 1100,
};

const SELF_HIT: RoundResult = {
  outcome: "selfHit",
  shooter: "right",
  hitShip: "right",
  baseScore: -2000,
  quickHitBonus: 0,
  powerPenalty: 0,
  scoreChange: -2000,
};

function emptyMatch(seed: number): Match {
  return createMatch(seed, structuredClone(EMPTY_LAYOUT));
}

function planetMatch(seed: number): Match {
  const layout = { ...structuredClone(EMPTY_LAYOUT), planets: [{ ...LIGHT_PLANET }, { ...HEAVY_PLANET }] };
  return createMatch(seed, layout);
}

function ringsAround(frame: FrameItem[], planet: Planet): RingItem[] {
  return frame.filter(
    (item): item is RingItem => item.kind === "ring" && item.centre.x === planet.x && item.centre.y === planet.y,
  );
}

function frameOf(match: Match, display = CONTOURS_SHOWN): FrameItem[] {
  return flatten(describeFrame(matchView(match), display));
}

function frameOfView(view: MatchView): FrameItem[] {
  return flatten(describeFrame(view, CONTOURS_SHOWN));
}

function attractFrameOf(match: Match, display = CONTOURS_SHOWN): FrameItem[] {
  return flatten(describeAttractFrame(matchView(match), display));
}

function flatten(items: FrameItem[]): FrameItem[] {
  return items.flatMap((item) => (item.kind === "group" ? [item, ...flatten(item.items)] : [item]));
}

function textsOf(frame: FrameItem[]): string[] {
  return frame.flatMap((item) => (item.kind === "text" ? [item.text] : []));
}

function textItemOf(frame: FrameItem[], predicate: (text: string) => boolean): TextItem {
  const item = frame.find((candidate): candidate is TextItem => candidate.kind === "text" && predicate(candidate.text));
  if (item === undefined) {
    throw new Error("text not found in frame");
  }
  return item;
}

function linesOf(frame: FrameItem[]): LinesItem[] {
  return frame.filter((item): item is LinesItem => item.kind === "lines");
}

function afterglowOf(frame: FrameItem[]): LinesItem[] {
  return linesOf(frame).filter((item) => item.glow && item.dash.length === 0 && item.segments.length === 1);
}

function bloomsOf(frame: FrameItem[]): BloomItem[] {
  return frame.filter((item): item is BloomItem => item.kind === "bloom");
}

function strokeRectsOf(frame: FrameItem[]): StrokeRectItem[] {
  return frame.filter((item): item is StrokeRectItem => item.kind === "strokeRect");
}

function imagesOf(frame: FrameItem[], sprite: ImageItem["sprite"]): ImageItem[] {
  return frame.filter((item): item is ImageItem => item.kind === "image" && item.sprite === sprite);
}

function shipSpritesOf(frame: FrameItem[]): Set<string> {
  const shipFrames = frame.filter((item): item is SpriteFrameItem => item.kind === "spriteFrame");
  return new Set(shipFrames.map((item) => item.sprite));
}

function zoomGroupsOf(frame: FrameItem[]): GroupItem[] {
  return frame.filter((item): item is GroupItem => item.kind === "group" && item.transform.scale === 0.25);
}

function shipGroupOf(frame: FrameItem[], side: Side): GroupItem {
  const isShipFrame = (item: FrameItem) => item.kind === "spriteFrame" && item.sprite === `${side}Ship`;
  return frame.find((item): item is GroupItem => item.kind === "group" && item.items.some(isShipFrame))!;
}

function shipFramesOf(group: GroupItem): { left: number; alpha: number }[] {
  return (group.items as SpriteFrameItem[]).map((item) => ({ left: item.source.left, alpha: item.alpha }));
}

function toZoomView(point: { x: number; y: number }): { x: number; y: number } {
  return { x: 300 + point.x / 4, y: 225 + point.y / 4 };
}

function zoomedSegment(segment: Segment): Segment {
  return { from: toZoomView(segment.from), to: toZoomView(segment.to) };
}

function isSameSegment(a: Segment, b: Segment): boolean {
  return a.from.x === b.from.x && a.from.y === b.from.y && a.to.x === b.to.x && a.to.y === b.to.y;
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

function zoomedMatch(seed: number, layout = EMPTY_LAYOUT): Match {
  const match = createMatch(seed, structuredClone(layout));
  aimAt(match, 0, 250);
  fire(match);
  stepUntil(match, () => missileOutsidePlayingArea(match));
  return match;
}

function roundOverFrameOf(result: RoundResult): FrameItem[] {
  const match = emptyMatch(30);
  hitOpponent(match);
  const phase: RoundOverView = { kind: "roundOver", result, stepsSinceRoundOver: 10 };
  return frameOfView({ ...matchView(match), phase });
}

describe("aiming frame", () => {
  test("shows both ships, the aim line and the aim info of the active ship", () => {
    const match = emptyMatch(1);
    aimAt(match, 45, 120);
    const expectedAimLine = matchView(match).aimLine;

    const frame = frameOf(match);

    const lines = frame.filter((item) => item.kind === "lines");
    expect(shipSpritesOf(frame)).toEqual(new Set(["leftShip", "rightShip"]));
    expect(lines).toContainEqual(expect.objectContaining({ segments: [expectedAimLine] }));
    expect(textsOf(frame)).toEqual(expect.arrayContaining(["Angle: 45.00", "Power: 120.0"]));
  });

  test("shows no missile and no flight info", () => {
    const frame = frameOf(emptyMatch(2));

    expect(imagesOf(frame, "missile")).toHaveLength(0);
    expect(textsOf(frame).some((text) => text.startsWith("Power penalty"))).toBe(false);
  });
});

describe("aim reticle", () => {
  test("is a dashed glowing line in the active player's colour, ending in a ring", () => {
    const match = emptyMatch(14);
    const view = matchView(match);
    const expectedAimLine = view.aimLine;
    const colour = PLAYER_COLOURS[view.activePlayer];

    const frame = frameOf(match);

    const dashedLines = linesOf(frame).filter((item) => item.dash.length > 0);
    const rings = frame.filter((item) => item.kind === "ring");
    expect(dashedLines).toEqual([expect.objectContaining({ colour, glow: true, segments: [expectedAimLine] })]);
    expect(rings).toContainEqual(expect.objectContaining({ colour, centre: expectedAimLine.to }));
  });

  test("grows with the power", () => {
    const match = emptyMatch(15);
    aimAt(match, 90, 50);
    const shortLine = matchView(match).aimLine;
    aimAt(match, 90, 200);
    const longLine = matchView(match).aimLine;

    const length = (line: typeof shortLine) => Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y);
    expect(length(longLine)).toBeGreaterThan(length(shortLine));
    expect(linesOf(frameOf(match))).toContainEqual(expect.objectContaining({ segments: [longLine] }));
  });
});

describe("HUD", () => {
  test("shows each score in its player's colour", () => {
    const frame = frameOf(emptyMatch(16));

    expect(textItemOf(frame, (text) => text === "Player 1  --  0").colour).toBe(COLOURS.leftPlayer);
    expect(textItemOf(frame, (text) => text === "0  --  Player 2").colour).toBe(COLOURS.rightPlayer);
  });

  test("shows the aim readouts in Phosphor", () => {
    const match = emptyMatch(17);
    aimAt(match, 123.456, 87.66);

    const frame = frameOf(match);

    expect(textItemOf(frame, (text) => text === "Angle: 123.46").colour).toBe(COLOURS.phosphor);
    expect(textItemOf(frame, (text) => text === "Power: 87.7").colour).toBe(COLOURS.phosphor);
  });

  test("places the scores and aim readouts along the top edge", () => {
    const frame = frameOf(emptyMatch(52));

    const placement = { y: 5, baseline: "top", fontSize: 14 };
    expect(textItemOf(frame, (text) => text.startsWith("Angle"))).toMatchObject({ ...placement, x: 290, align: "left" });
    expect(textItemOf(frame, (text) => text.startsWith("Power"))).toMatchObject({ ...placement, x: 403, align: "left" });
    expect(textItemOf(frame, (text) => text.startsWith("Player 1"))).toMatchObject({ ...placement, x: 5, align: "left" });
    expect(textItemOf(frame, (text) => text.endsWith("Player 2"))).toMatchObject({ ...placement, x: 794, align: "right" });
  });

  test("centres the power penalty at the top edge and the timeout at the bottom edge", () => {
    const match = emptyMatch(53);
    fire(match);

    const frame = frameOf(match);

    expect(textItemOf(frame, (text) => text.startsWith("Power penalty"))).toMatchObject({
      x: 399,
      y: 5,
      align: "center",
      baseline: "top",
    });
    expect(textItemOf(frame, (text) => text.startsWith("Timeout in"))).toMatchObject({
      x: 399,
      y: 594,
      align: "center",
      baseline: "bottom",
    });
  });

  test("shows the power penalty in whole points", () => {
    const match = emptyMatch(54);
    fire(match);

    const frame = frameOfView({ ...matchView(match), powerPenalty: 123.7 });

    expect(textsOf(frame)).toContain("Power penalty: 123");
  });

  test("counts the flight steps down to the timeout, then reports the timed-out shot", () => {
    const match = emptyMatch(55);
    fire(match);
    const view = matchView(match);
    if (view.phase.kind !== "inFlight") {
      throw new Error("expected the missile to be in flight");
    }
    const timedOutView: MatchView = { ...view, phase: { ...view.phase, timedOut: true } };

    expect(textsOf(frameOfView(view))).toContain("Timeout in 750");
    expect(textsOf(frameOfView(timedOutView))).toContain("Shot timed out...");
  });

  test("draws no timeout readout when missiles never time out", () => {
    const rules = { ...DEFAULT_MATCH_RULES, timeoutSeconds: undefined };
    const match = createMatch(56, structuredClone(EMPTY_LAYOUT), rules);
    fire(match);
    const view = matchView(match);
    if (view.phase.kind !== "inFlight") {
      throw new Error("expected the missile to be in flight");
    }
    const timedOutView: MatchView = { ...view, phase: { ...view.phase, timedOut: true } };

    for (const frame of [frameOfView(view), frameOfView(timedOutView)]) {
      const texts = textsOf(frame);
      expect(texts.some((text) => text.startsWith("Timeout in"))).toBe(false);
      expect(texts).not.toContain("Shot timed out...");
      expect(texts).not.toContain("");
    }
  });

  test("shows the flight readouts in Instrument dim", () => {
    const match = emptyMatch(18);
    fire(match);

    const frame = frameOf(match);

    expect(textItemOf(frame, (text) => text.startsWith("Power penalty")).colour).toBe(COLOURS.instrumentDim);
    expect(textItemOf(frame, (text) => text.startsWith("Timeout in")).colour).toBe(COLOURS.instrumentDim);
  });

  test("uses the text font for readouts and the title font for the round banner", () => {
    const frame = frameOf(emptyMatch(19));

    expect(textItemOf(frame, (text) => text.startsWith("Angle")).font).toBe("text");
    expect(textItemOf(frame, (text) => text === "Round 1").font).toBe("title");
  });
});

describe("missile trail", () => {
  test("a finished shot leaves a solid trail in the shooter's colour", () => {
    const match = emptyMatch(20);
    const shooter = matchView(match).activePlayer;
    aimAt(match, 0, 250);
    fire(match);
    stepUntil(match, () => matchView(match).phase.kind === "aiming");

    const frame = frameOf(match);

    const trail = linesOf(frame).find((item) => item.colour === PLAYER_COLOURS[shooter] && item.segments.length > 0)!;
    expect(trail.dash).toEqual([]);
    expect(trail.glow).toBe(false);
    expect(afterglowOf(frame)).toHaveLength(0);
  });

  test("the afterglow follows the missile, brightest at its newest segment", () => {
    const match = emptyMatch(21);
    fire(match);
    for (let i = 0; i < 10; i++) {
      step(match);
    }

    const frame = frameOf(match);

    const afterglow = afterglowOf(frame);
    const alphas = afterglow.map((item) => item.alpha);
    const trails = matchView(match).trails;
    expect(afterglow).toHaveLength(10);
    expect(afterglow.at(-1)!.segments[0]).toEqual(trails.at(-1));
    expect(alphas.at(-1)).toBe(1);
    expect(alphas).toEqual([...alphas].sort((a, b) => a - b));
  });

  test("the afterglow covers only the last 1.5 s of flight", () => {
    const match = emptyMatch(22);
    fire(match);
    for (let i = 0; i < 60; i++) {
      step(match);
    }

    expect(afterglowOf(frameOf(match))).toHaveLength(45);
  });

  test("the afterglow never reaches back into an earlier shot", () => {
    const match = emptyMatch(23);
    aimAt(match, 0, 250);
    fire(match);
    stepUntil(match, () => matchView(match).phase.kind === "aiming");
    fire(match);
    for (let i = 0; i < 3; i++) {
      step(match);
    }

    expect(afterglowOf(frameOf(match))).toHaveLength(3);
  });
});

describe("gravity-well contours", () => {
  test("surround each planet with three faint rings, spaced wider for a heavier planet", () => {
    const frame = frameOf(planetMatch(11));

    const lightRings = ringsAround(frame, LIGHT_PLANET);
    const heavyRings = ringsAround(frame, HEAVY_PLANET);
    expect(lightRings.map((ring) => ring.radius)).toEqual([
      expect.closeTo(29.243, 3),
      expect.closeTo(33.485, 3),
      expect.closeTo(37.728, 3),
    ]);
    expect(heavyRings.map((ring) => ring.radius)).toEqual([
      expect.closeTo(133.941, 3),
      expect.closeTo(167.882, 3),
      expect.closeTo(201.823, 3),
    ]);
    expect([...lightRings, ...heavyRings].every((ring) => ring.colour === COLOURS.instrumentDim && ring.alpha < 1)).toBe(
      true,
    );
  });

  test("are drawn beneath the planet sprites", () => {
    const frame = frameOf(planetMatch(12));

    const isContour = (item: FrameItem) => item.kind === "ring" && item.colour === COLOURS.instrumentDim;
    const kinds = frame.map((item) => (item.kind === "image" ? item.sprite : isContour(item) ? "contour" : item.kind));
    const lastRing = kinds.lastIndexOf("contour");
    const firstPlanet = kinds.findIndex((kind) => kind.startsWith("planet"));
    expect(lastRing).toBeGreaterThanOrEqual(0);
    expect(lastRing).toBeLessThan(firstPlanet);
  });

  test("are hidden in a match when the display setting turns them off, leaving the planets", () => {
    const frame = frameOf(planetMatch(14), CONTOURS_HIDDEN);

    expect([...ringsAround(frame, LIGHT_PLANET), ...ringsAround(frame, HEAVY_PLANET)]).toHaveLength(0);
    expect(imagesOf(frame, "planet1")).toHaveLength(1);
    expect(imagesOf(frame, "planet2")).toHaveLength(1);
  });

  test("follow the display setting in attract mode", () => {
    const match = planetMatch(15);

    expect(ringsAround(attractFrameOf(match, CONTOURS_SHOWN), HEAVY_PLANET)).toHaveLength(3);
    expect(ringsAround(attractFrameOf(match, CONTOURS_HIDDEN), HEAVY_PLANET)).toHaveLength(0);
  });
});

describe("planets", () => {
  test("each planet sprite fills a box centred on the planet, slightly larger than its surface", () => {
    const frame = frameOf(planetMatch(13));

    expect(imagesOf(frame, "planet1")).toEqual([
      expect.objectContaining({ target: { left: 274, top: 174, width: 52, height: 52 } }),
    ]);
    expect(imagesOf(frame, "planet2")).toEqual([
      expect.objectContaining({ target: { left: 396, top: 296, width: 208, height: 208 } }),
    ]);
  });
});

describe("ships", () => {
  test("a ship aimed along its sprite sheet's facing shows the first frame alone, centred on the ship", () => {
    const frame = frameOf(emptyMatch(56));

    for (const side of ["left", "right"] as const) {
      const ship = EMPTY_LAYOUT.ships[side];
      const group = shipGroupOf(frame, side);
      expect(group.transform).toEqual({ x: ship.x, y: ship.y, rotation: 0, scale: 1 });
      expect(group.items).toEqual([
        expect.objectContaining({
          source: { left: 0, top: 0, width: 40, height: 33 },
          target: { left: -20, top: -16, width: 40, height: 33 },
          alpha: 1,
        }),
        expect.objectContaining({
          source: { left: 40, top: 0, width: 40, height: 33 },
          target: { left: -20, top: -16, width: 40, height: 33 },
          alpha: 0,
        }),
      ]);
    }
  });

  test("an aim on a frame boundary shows that frame alone", () => {
    const match = emptyMatch(57);
    const side = matchView(match).activePlayer;
    aimAt(match, SHEET_FACING[side] + 45, 100);

    const group = shipGroupOf(frameOf(match), side);

    expect(group.transform.rotation).toBeCloseTo(Math.PI / 4);
    expect(shipFramesOf(group)).toEqual([
      { left: 40, alpha: 1 },
      { left: 80, alpha: 0 },
    ]);
  });

  test("an aim between frames blends both by distance", () => {
    const match = emptyMatch(58);
    const side = matchView(match).activePlayer;
    aimAt(match, SHEET_FACING[side] + 22.5, 100);

    const group = shipGroupOf(frameOf(match), side);

    expect(group.transform.rotation).toBeCloseTo(Math.PI / 8);
    expect(shipFramesOf(group)).toEqual([
      { left: 0, alpha: 1 },
      { left: 40, alpha: expect.closeTo(0.5) },
    ]);
  });

  test("the last frame blends into the first", () => {
    const match = emptyMatch(59);
    const side = matchView(match).activePlayer;
    aimAt(match, SHEET_FACING[side] - 22.5, 100);

    const group = shipGroupOf(frameOf(match), side);

    expect(group.transform.rotation).toBeCloseTo((337.5 * Math.PI) / 180);
    expect(shipFramesOf(group)).toEqual([
      { left: 280, alpha: 1 },
      { left: 0, alpha: expect.closeTo(0.5) },
    ]);
  });
});

describe("in-flight frame", () => {
  test("a missile inside the playing area is drawn at its position without the zoom view", () => {
    const match = emptyMatch(3);
    fire(match);
    step(match);

    const frame = frameOf(match);

    const missiles = imagesOf(frame, "missile");
    const phase = matchView(match).phase;
    const missile = phase.kind === "inFlight" ? phase.missile : { x: NaN, y: NaN };
    expect(missiles).toEqual([
      expect.objectContaining({ target: { left: missile.x - 12.5, top: missile.y - 12.5, width: 25, height: 25 } }),
    ]);
    expect(zoomGroupsOf(frame)).toHaveLength(0);
    expect(frame.some((item) => item.kind === "fillRect")).toBe(false);
  });

  test("a missile outside the playing area is shown at a third of its size in the zoom view", () => {
    const match = zoomedMatch(4);
    const phase = matchView(match).phase;
    const zoomedMissile = toZoomView(phase.kind === "inFlight" ? phase.missile : { x: NaN, y: NaN });

    const frame = frameOf(match);

    const missiles = imagesOf(frame, "missile");
    const zoomGroups = zoomGroupsOf(frame);
    expect(missiles).toHaveLength(1);
    expect(missiles[0].target.width).toBeCloseTo(25 / 3);
    expect(missiles[0].target.height).toBeCloseTo(25 / 3);
    expect(missiles[0].target.left + missiles[0].target.width / 2).toBeCloseTo(zoomedMissile.x);
    expect(missiles[0].target.top + missiles[0].target.height / 2).toBeCloseTo(zoomedMissile.y);
    expect(zoomGroups).toHaveLength(1);
    expect(flatten(zoomGroups[0].items).some((item) => item.kind === "spriteFrame")).toBe(true);
    expect(frame.some((item) => item.kind === "fillRect")).toBe(true);
  });

  test("the zoom view shows the trails of earlier shots and the current one, mapped into it", () => {
    const match = emptyMatch(27);
    const firstShooter = matchView(match).activePlayer;
    aimAt(match, 0, 250);
    fire(match);
    stepUntil(match, () => matchView(match).phase.kind === "aiming");
    const earlierSegment = matchView(match).trails[0];
    aimAt(match, 0, 250);
    fire(match);
    stepUntil(match, () => missileOutsidePlayingArea(match));
    const currentSegment = matchView(match).trails.at(-1)!;

    const lines = linesOf(frameOf(match));

    const earlierTrail = lines.filter((item) => item.colour === PLAYER_COLOURS[firstShooter]);
    const currentTrail = lines.filter((item) => item.colour === PLAYER_COLOURS[opponentOf(firstShooter)]);
    const zoomedEarlier = zoomedSegment(earlierSegment);
    const zoomedCurrent = zoomedSegment(currentSegment);
    expect(earlierTrail.some((item) => item.segments.some((segment) => isSameSegment(segment, zoomedEarlier)))).toBe(true);
    expect(currentTrail.some((item) => item.segments.some((segment) => isSameSegment(segment, zoomedCurrent)))).toBe(true);
  });

  test("the zoom view is a radar inset with a faint grid and Instrument-dim outlines", () => {
    const frame = frameOf(zoomedMatch(24));

    const grid = linesOf(frame).find((item) => item.colour === COLOURS.instrumentDim)!;
    expect(grid.segments.length).toBeGreaterThan(0);
    expect(grid.alpha).toBeLessThan(1);
    expect(strokeRectsOf(frame).map((item) => item.colour)).toEqual([COLOURS.instrumentDim, COLOURS.instrumentDim]);
  });

  test("the zoom view is centred on screen, with the playing area shrunk to a quarter in its middle", () => {
    const frame = frameOf(zoomedMatch(28));

    expect(frame.filter((item) => item.kind === "fillRect")).toEqual([
      expect.objectContaining({ rect: PLAYING_AREA }),
    ]);
    expect(imagesOf(frame, "backdrop")).toEqual([
      expect.objectContaining({ target: { left: 100, top: 75, width: 600, height: 450 } }),
    ]);
    expect(zoomGroupsOf(frame).map((item) => item.transform)).toEqual([{ x: 300, y: 225, rotation: 0, scale: 0.25 }]);
    expect(strokeRectsOf(frame).map((item) => item.rect)).toEqual([
      { left: 100.5, top: 75.5, width: 599, height: 449 },
      { left: 300.5, top: 225.5, width: 199, height: 149 },
    ]);
  });

  test("the zoom view grid has a line every 50 pixels inside its outline", () => {
    const frame = frameOf(zoomedMatch(29));

    const grid = linesOf(frame).find((item) => item.colour === COLOURS.instrumentDim)!;
    expect(grid.segments).toHaveLength(19);
    expect(grid.segments[0]).toEqual({ from: { x: 150.5, y: 75.5 }, to: { x: 150.5, y: 524.5 } });
    expect(grid.segments[11]).toEqual({ from: { x: 100.5, y: 125.5 }, to: { x: 699.5, y: 125.5 } });
  });

  test("the zoom view shows gravity-well contours only while the display setting is on", () => {
    const farPlanet: Planet = { ...LIGHT_PLANET, x: 700, y: 500 };
    const match = zoomedMatch(31, { ...EMPTY_LAYOUT, planets: [farPlanet] });
    const zoomedItemsOf = (display: DisplaySettings) => zoomGroupsOf(frameOf(match, display))[0].items;

    const shown = zoomedItemsOf(CONTOURS_SHOWN);
    const hidden = zoomedItemsOf(CONTOURS_HIDDEN);

    expect(ringsAround(shown, farPlanet)).toHaveLength(3);
    expect(ringsAround(hidden, farPlanet)).toHaveLength(0);
    expect(imagesOf(hidden, "planet1")).toHaveLength(1);
  });

  test("shows the power penalty and the timeout but no aim line or aim info", () => {
    const match = emptyMatch(5);
    const aimedLine = matchView(match).aimLine;
    fire(match);

    const frame = frameOf(match);

    const texts = textsOf(frame);
    const lines = frame.filter((item) => item.kind === "lines");
    expect(texts.some((text) => text.startsWith("Power penalty"))).toBe(true);
    expect(texts.some((text) => text.startsWith("Timeout in"))).toBe(true);
    expect(texts.some((text) => text.startsWith("Angle"))).toBe(false);
    expect(lines).not.toContainEqual(expect.objectContaining({ segments: [aimedLine] }));
  });
});

describe("round-over frame", () => {
  test("omits the destroyed ship and shows the explosion on it with the round-over message", () => {
    const match = emptyMatch(6);
    const shooter = matchView(match).activePlayer;
    const target = opponentOf(shooter);
    hitOpponent(match);

    const frame = frameOf(match);

    const explosions = imagesOf(frame, "explosion");
    const targetShip = matchView(match).ships[target];
    expect(shipSpritesOf(frame)).toEqual(new Set([`${shooter}Ship`]));
    expect(explosions).toHaveLength(1);
    expect(explosions[0].target.left + explosions[0].target.width / 2).toBe(targetShip.x);
    expect(explosions[0].target.top + explosions[0].target.height / 2).toBe(targetShip.y);
    expect(textsOf(frame)).toContain(HIT_TITLES[shooter]);
  });

  test("a bloom flashes over the destroyed ship and fades out", () => {
    const match = emptyMatch(25);
    const target = opponentOf(matchView(match).activePlayer);
    hitOpponent(match);
    const targetShip = matchView(match).ships[target];

    const flash = bloomsOf(frameOf(match));
    step(match);
    const fading = bloomsOf(frameOf(match));
    for (let i = 0; i < 10; i++) {
      step(match);
    }
    const gone = bloomsOf(frameOf(match));

    expect(flash).toHaveLength(1);
    expect(flash[0].centre).toEqual({ x: targetShip.x, y: targetShip.y });
    expect(fading[0].alpha).toBeLessThan(flash[0].alpha);
    expect(gone).toHaveLength(0);
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

describe("round-over message", () => {
  test("sits in a double-outlined glass panel centred on screen, with corner brackets", () => {
    const frame = roundOverFrameOf(HIT);

    const brackets = linesOf(frame).filter((item) => item.colour === COLOURS.phosphor && item.segments.length === 8);
    expect(frame.filter((item) => item.kind === "fillRect")).toEqual([
      expect.objectContaining({ rect: { left: 174, top: 184, width: 450, height: 230 } }),
    ]);
    expect(strokeRectsOf(frame).map((item) => item.rect)).toEqual([
      { left: 174.5, top: 184.5, width: 449, height: 229 },
      { left: 178.5, top: 188.5, width: 441, height: 221 },
    ]);
    expect(brackets).toHaveLength(1);
    expect(brackets[0].segments.slice(0, 2)).toEqual([
      { from: { x: 174.5, y: 184.5 }, to: { x: 188.5, y: 184.5 } },
      { from: { x: 174.5, y: 184.5 }, to: { x: 174.5, y: 198.5 } },
    ]);
    expect(brackets[0].segments.slice(6)).toEqual([
      { from: { x: 623.5, y: 413.5 }, to: { x: 609.5, y: 413.5 } },
      { from: { x: 623.5, y: 413.5 }, to: { x: 623.5, y: 399.5 } },
    ]);
  });

  test("lays its texts out relative to the panel's top-left corner", () => {
    const frame = roundOverFrameOf(HIT);

    expect(frame).toContainEqual(
      expect.objectContaining({ kind: "group", transform: { x: 174, y: 184, rotation: 0, scale: 1 } }),
    );
  });

  test("a hit names both players in a title-font heading", () => {
    const frame = roundOverFrameOf(HIT);

    expect(textItemOf(frame, (text) => text === "Player 1 hit player 2")).toMatchObject({
      x: 224,
      y: 28,
      align: "center",
      font: "title",
      fontSize: 16,
      colour: COLOURS.phosphor,
    });
  });

  test("a hit lists base score, quick-hit bonus and power penalty, then the score change and the prompt", () => {
    const frame = roundOverFrameOf(HIT);

    const rows = [
      ["Hit opponent:", "1500", 65],
      ["Quick-hit bonus:", "200", 85],
      ["Power penalty:", "-600", 105],
    ] as const;
    for (const [label, value, top] of rows) {
      expect(textItemOf(frame, (text) => text === label)).toMatchObject({
        x: 50,
        y: top,
        align: "left",
        colour: COLOURS.instrumentDim,
      });
      expect(textItemOf(frame, (text) => text === value)).toMatchObject({
        x: 399,
        y: top,
        align: "right",
        colour: COLOURS.phosphor,
      });
    }
    expect(textItemOf(frame, (text) => text === "1100 added to score")).toMatchObject({
      x: 224,
      y: 140,
      align: "center",
      colour: COLOURS.leftPlayer,
    });
    expect(textItemOf(frame, (text) => text === "Press Space or Enter for the next round")).toMatchObject({
      x: 224,
      y: 180,
      align: "center",
      colour: COLOURS.instrumentDim,
    });
  });

  test("a self-hit names the shooter's own ship and lists only the deduction in a shorter panel", () => {
    const frame = roundOverFrameOf(SELF_HIT);

    const texts = textsOf(frame);
    expect(frame.filter((item) => item.kind === "fillRect")).toEqual([
      expect.objectContaining({ rect: { left: 174, top: 204, width: 450, height: 190 } }),
    ]);
    expect(texts).toContain("Player 2 hit their own ship");
    expect(textItemOf(frame, (text) => text === "Hit self:")).toMatchObject({ x: 50, y: 65 });
    expect(textItemOf(frame, (text) => text === "-2000")).toMatchObject({ x: 399, y: 65 });
    expect(texts).not.toContain("Quick-hit bonus:");
    expect(textItemOf(frame, (text) => text === "2000 deducted from score")).toMatchObject({
      y: 100,
      colour: COLOURS.rightPlayer,
    });
    expect(textItemOf(frame, (text) => text === "Press Space or Enter for the next round")).toMatchObject({ y: 140 });
  });

  test("a zero score change reads as added", () => {
    const frame = roundOverFrameOf({ ...HIT, scoreChange: 0 });

    expect(textsOf(frame)).toContain("0 added to score");
  });
});

describe("round banner", () => {
  test("shows the round number in the title font at the screen centre at round start", () => {
    const frame = frameOf(emptyMatch(8));

    expect(textItemOf(frame, (text) => text === "Round 1")).toMatchObject({
      x: 399,
      y: 299,
      align: "center",
      baseline: "middle",
      font: "title",
      fontSize: 0,
      alpha: 140 / 255,
    });
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
    expect(frame.some((item) => item.kind === "ring")).toBe(false);
    expect(imagesOf(frame, "missile")).toHaveLength(0);
    expect(frame.some((item) => item.kind === "image" && item.sprite.startsWith("planet"))).toBe(false);
    expect(textsOf(frame)).toHaveLength(0);
  });
});

describe("attract frame", () => {
  test("shows planets and both ships without HUD or aim reticle, dimmed over the playing area", () => {
    const match = planetMatch(40);

    const frame = attractFrameOf(match);

    expect(shipSpritesOf(frame)).toEqual(new Set(["leftShip", "rightShip"]));
    expect(ringsAround(frame, HEAVY_PLANET).length).toBeGreaterThan(0);
    expect(textsOf(frame)).toHaveLength(0);
    expect(linesOf(frame).some((item) => item.dash.length > 0)).toBe(false);
    expect(frame.at(-1)).toEqual(
      expect.objectContaining({ kind: "fillRect", rect: { left: 0, top: 0, width: 800, height: 600 } }),
    );
  });

  test("shows the missile and its afterglow in flight, without zoom view or flight HUD", () => {
    const match = emptyMatch(41);
    fire(match);
    for (let i = 0; i < 5; i++) {
      step(match);
    }

    const frame = attractFrameOf(match);

    expect(imagesOf(frame, "missile")).toHaveLength(1);
    expect(afterglowOf(frame).length).toBeGreaterThan(0);
    expect(zoomGroupsOf(frame)).toHaveLength(0);
    expect(textsOf(frame)).toHaveLength(0);
  });

  test("a hit shows the explosion without the round-over panel", () => {
    const match = emptyMatch(42);
    hitOpponent(match);

    const frame = attractFrameOf(match);

    expect(imagesOf(frame, "explosion")).toHaveLength(1);
    expect(textsOf(frame)).toHaveLength(0);
    expect(strokeRectsOf(frame)).toHaveLength(0);
  });
});
