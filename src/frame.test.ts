// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { COLOURS } from "./colours";
import { isInsidePlayingArea, type Segment } from "./core/flight";
import { adjustAim, createMatch, fire, matchView, step, type Match, type RoundLayout } from "./core/match";
import type { Planet, Side } from "./core/round";
import {
  describeAttractFrame,
  describeBackdropFrame,
  describeFrame,
  type BloomItem,
  type FrameItem,
  type GroupItem,
  type ImageItem,
  type LinesItem,
  type RingItem,
  type SpriteFrameItem,
  type StrokeRectItem,
  type TextItem,
} from "./frame";
import {
  angleInfoText,
  gravityWellContourRadii,
  powerInfoText,
  roundOverTitle,
  scoreTexts,
  ZOOM_SCALE,
  zoomViewSegment,
} from "./presentation";

const PLAYER_COLOURS: Record<Side, string> = { left: COLOURS.leftPlayer, right: COLOURS.rightPlayer };

const LIGHT_PLANET: Planet = { sprite: 1, mass: 8, radius: 25, x: 300, y: 200 };
const HEAVY_PLANET: Planet = { sprite: 2, mass: 512, radius: 100, x: 500, y: 400 };

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

function planetMatch(seed: number): Match {
  const layout = { ...structuredClone(EMPTY_LAYOUT), planets: [{ ...LIGHT_PLANET }, { ...HEAVY_PLANET }] };
  return createMatch(seed, layout);
}

function ringsAround(frame: FrameItem[], planet: Planet): RingItem[] {
  return frame.filter(
    (item): item is RingItem => item.kind === "ring" && item.centre.x === planet.x && item.centre.y === planet.y,
  );
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
  return linesOf(frame).filter((item) => item.colour === COLOURS.phosphor && item.glow && item.segments.length === 1);
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
  return frame.filter((item): item is GroupItem => item.kind === "group" && item.transform.scale === ZOOM_SCALE);
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

describe("aiming frame", () => {
  test("shows both ships, the aim line and the aim info of the active ship", () => {
    const match = emptyMatch(1);
    const view = matchView(match);
    const aim = view.ships[view.activePlayer].aim;

    const frame = frameOf(match);

    const lines = frame.filter((item) => item.kind === "lines");
    const expectedAimLine = view.aimLine;
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
    const match = emptyMatch(16);
    const texts = scoreTexts(matchView(match).scores);

    const frame = frameOf(match);

    expect(textItemOf(frame, (text) => text === texts.left).colour).toBe(COLOURS.leftPlayer);
    expect(textItemOf(frame, (text) => text === texts.right).colour).toBe(COLOURS.rightPlayer);
  });

  test("shows the aim readouts in Phosphor", () => {
    const match = emptyMatch(17);
    const view = matchView(match);
    const aim = view.ships[view.activePlayer].aim;

    const frame = frameOf(match);

    expect(textItemOf(frame, (text) => text === angleInfoText(aim)).colour).toBe(COLOURS.phosphor);
    expect(textItemOf(frame, (text) => text === powerInfoText(aim)).colour).toBe(COLOURS.phosphor);
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
  test("surround each planet with faint rings at its contour radii", () => {
    const frame = frameOf(planetMatch(11));

    for (const planet of [LIGHT_PLANET, HEAVY_PLANET]) {
      const rings = ringsAround(frame, planet);
      expect(rings.map((ring) => ring.radius)).toEqual(gravityWellContourRadii(planet));
      expect(rings.every((ring) => ring.colour === COLOURS.instrumentDim && ring.alpha < 1)).toBe(true);
    }
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

  test("a heavier planet has a wider contour set", () => {
    const frame = frameOf(planetMatch(13));

    const lightOuter = Math.max(...ringsAround(frame, LIGHT_PLANET).map((ring) => ring.radius));
    const heavyOuter = Math.max(...ringsAround(frame, HEAVY_PLANET).map((ring) => ring.radius));
    expect(heavyOuter - HEAVY_PLANET.radius).toBeGreaterThan(lightOuter - LIGHT_PLANET.radius);
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
    const zoomedEarlier = zoomViewSegment(earlierSegment);
    const zoomedCurrent = zoomViewSegment(currentSegment);
    expect(earlierTrail.some((item) => item.segments.some((segment) => isSameSegment(segment, zoomedEarlier)))).toBe(true);
    expect(currentTrail.some((item) => item.segments.some((segment) => isSameSegment(segment, zoomedCurrent)))).toBe(true);
  });

  test("the zoom view is a radar inset with a faint grid and Instrument-dim outlines", () => {
    const match = emptyMatch(24);
    aimAt(match, 0, 250);
    fire(match);
    stepUntil(match, () => missileOutsidePlayingArea(match));

    const frame = frameOf(match);

    const grid = linesOf(frame).find((item) => item.colour === COLOURS.instrumentDim)!;
    expect(grid.segments.length).toBeGreaterThan(0);
    expect(grid.alpha).toBeLessThan(1);
    expect(strokeRectsOf(frame).map((item) => item.colour)).toEqual([COLOURS.instrumentDim, COLOURS.instrumentDim]);
  });

  test("shows the power penalty and the timeout but no aim line or aim info", () => {
    const match = emptyMatch(5);
    const aim = { ...matchView(match).ships[matchView(match).activePlayer].aim };
    const aimedLine = matchView(match).aimLine;
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

  test("the message sits in a double-outlined panel with corner brackets and a title-font heading", () => {
    const match = emptyMatch(26);
    hitOpponent(match);
    const phase = matchView(match).phase;
    if (phase.kind !== "roundOver") {
      throw new Error("expected the round to be over");
    }

    const frame = frameOf(match);

    const outlines = strokeRectsOf(frame);
    const brackets = linesOf(frame).filter((item) => item.colour === COLOURS.phosphor && item.segments.length === 8);
    const title = roundOverTitle(phase.result);
    expect(outlines).toHaveLength(2);
    expect(outlines[1].rect.width).toBeLessThan(outlines[0].rect.width);
    expect(brackets).toHaveLength(1);
    expect(textItemOf(frame, (text) => text === title).font).toBe("title");
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
    expect(frame.some((item) => item.kind === "ring")).toBe(false);
    expect(imagesOf(frame, "missile")).toHaveLength(0);
    expect(frame.some((item) => item.kind === "image" && item.sprite.startsWith("planet"))).toBe(false);
    expect(textsOf(frame)).toHaveLength(0);
  });
});

describe("attract frame", () => {
  function attractFrameOf(match: Match): FrameItem[] {
    return flatten(describeAttractFrame(matchView(match)));
  }

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
