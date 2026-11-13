// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { COLOURS } from "./colours";
import { stepsFlown, type Missile, type Point, type Segment } from "./core/flight";
import {
  aimLine,
  isTimedOut,
  isZoomViewShown,
  powerPenalty,
  type InFlightView,
  type MatchView,
  type RoundOverView,
  type RoundResult,
} from "./core/match";
import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./core/playingArea";
import type { Aim, Planet, Ship, Side } from "./core/round";
import {
  afterglowSegments,
  angleInfoText,
  centredBox,
  cornerBrackets,
  explosionBloom,
  explosionSize,
  gravityWellContourRadii,
  gridLines,
  insetRect,
  MESSAGE_LABEL_LEFT,
  MESSAGE_PROMPT_TEXT,
  MESSAGE_TEXT_CENTRE_X,
  MESSAGE_VALUE_RIGHT,
  planetBox,
  powerInfoText,
  powerPenaltyText,
  roundBanner,
  roundOverMessageBox,
  roundOverTextTops,
  roundOverTitle,
  scoreBreakdownRows,
  scoreChangeText,
  scoreTexts,
  SHIP_FRAME_HEIGHT,
  SHIP_FRAME_OFFSET_LEFT,
  SHIP_FRAME_OFFSET_TOP,
  SHIP_FRAME_WIDTH,
  shipPose,
  strokeOutline,
  timeoutText,
  trailAlpha,
  ZOOM_SCALE,
  ZOOM_VIEW,
  ZOOMED_PLAYING_AREA,
  zoomedMissileSize,
  zoomViewPoint,
  zoomViewSegment,
  type Rect,
} from "./presentation";

export type SpriteName = "backdrop" | "missile" | "explosion" | `${Side}Ship` | `planet${number}`;

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export interface ImageItem {
  kind: "image";
  sprite: SpriteName;
  target: Rect;
}

export interface SpriteFrameItem {
  kind: "spriteFrame";
  sprite: SpriteName;
  source: Rect;
  target: Rect;
  alpha: number;
}

export interface RingItem {
  kind: "ring";
  colour: string;
  centre: Point;
  radius: number;
  alpha: number;
}

export interface LinesItem {
  kind: "lines";
  colour: string;
  segments: Segment[];
  alpha: number;
  dash: number[];
  glow: boolean;
}

export interface BloomItem {
  kind: "bloom";
  colour: string;
  centre: Point;
  radius: number;
  alpha: number;
}

export interface FillRectItem {
  kind: "fillRect";
  colour: string;
  rect: Rect;
}

export interface StrokeRectItem {
  kind: "strokeRect";
  colour: string;
  rect: Rect;
}

export interface TextItem {
  kind: "text";
  text: string;
  x: number;
  y: number;
  colour: string;
  font: "title" | "text";
  fontSize: number;
  align: "left" | "center" | "right";
  baseline: "top" | "middle" | "bottom";
  alpha: number;
}

export interface GroupItem {
  kind: "group";
  transform: Transform;
  items: FrameItem[];
}

export type FrameItem =
  | ImageItem
  | SpriteFrameItem
  | RingItem
  | LinesItem
  | BloomItem
  | FillRectItem
  | StrokeRectItem
  | TextItem
  | GroupItem;

const SIDES: readonly Side[] = ["left", "right"];

const PLAYER_COLOURS: Record<Side, string> = { left: COLOURS.leftPlayer, right: COLOURS.rightPlayer };
const SOLID: number[] = [];

const AIM_DASH = [8, 6];
const AIM_TIP_RADIUS = 5;

const BRACKET_LENGTH = 14;

const GRAVITY_WELL_CONTOUR_ALPHA = 0.45;

const MISSILE_SPRITE_SIZE = 25;

const HUD_FONT_SIZE = 14;
const HUD_TOP = 5;
const ANGLE_INFO_LEFT = 290;
const POWER_INFO_LEFT = 403;
const POWER_PENALTY_CENTRE_X = 399;
const TIMEOUT_INFO_CENTRE_X = 399;
const TIMEOUT_INFO_BOTTOM = 594;
const LEFT_SCORE_LEFT = 5;
const RIGHT_SCORE_RIGHT = 794;

const GLASS_COLOUR = "rgba(4, 8, 21, 0.78)";
const PANEL_OUTLINE_GAP = 4;
const PANEL_TITLE_FONT_SIZE = 16;

const ZOOM_DIM_COLOUR = "rgba(4, 8, 21, 0.75)";
const ZOOM_GRID_SPACING = 50;
const ZOOM_GRID_ALPHA = 0.3;

const ATTRACT_DIM_COLOUR = "rgba(4, 8, 21, 0.55)";

const BANNER_CENTRE_X = 399;
const BANNER_CENTRE_Y = 299;

const PLAYING_AREA: Readonly<Rect> = { left: 0, top: 0, width: PLAYING_AREA_WIDTH, height: PLAYING_AREA_HEIGHT };

export function describeFrame(view: MatchView): FrameItem[] {
  const planets = planetItems(view.planets);
  const trails = trailItems(view.trails);
  const phase = phaseItems(view);
  const scores = scoreItems(view.scores);
  const banner = roundBannerItems(view.roundNumber, view.roundStepCount);
  return [...planets, ...trails, ...phase, ...scores, ...banner];
}

export function describeAttractFrame(view: MatchView): FrameItem[] {
  const planets = planetItems(view.planets);
  const trails = trailItems(view.trails);
  const phase = attractPhaseItems(view);
  const dimming: FillRectItem = { kind: "fillRect", colour: ATTRACT_DIM_COLOUR, rect: PLAYING_AREA };
  return [...planets, ...trails, ...phase, dimming];
}

function attractPhaseItems(view: MatchView): FrameItem[] {
  switch (view.phase.kind) {
    case "aiming":
      return shipItems(view.ships, SIDES);
    case "inFlight":
      return attractFlightItems(view, view.phase.missile);
    case "roundOver":
      return hitSceneItems(view.ships, view.phase);
  }
}

function attractFlightItems(view: MatchView, flyingMissile: Readonly<Missile>): FrameItem[] {
  const ships = shipItems(view.ships, SIDES);
  const afterglow = afterglowItems(view.trails, flyingMissile);
  const missile = missileItem(flyingMissile);
  return [...ships, ...afterglow, missile];
}

export function describeBackdropFrame(): FrameItem[] {
  const backdrop = imageItem("backdrop", PLAYING_AREA);
  return [backdrop];
}

function phaseItems(view: MatchView): FrameItem[] {
  switch (view.phase.kind) {
    case "aiming":
      return aimingItems(view);
    case "inFlight":
      return flightItems(view, view.phase);
    case "roundOver":
      return roundOverItems(view.ships, view.phase);
  }
}

function imageItem(sprite: SpriteName, target: Readonly<Rect>): ImageItem {
  return { kind: "image", sprite, target };
}

function hudText(
  text: string,
  colour: string,
  x: number,
  y: number,
  align: TextItem["align"],
  baseline: TextItem["baseline"],
): TextItem {
  return { kind: "text", text, x, y, colour, font: "text", fontSize: HUD_FONT_SIZE, align, baseline, alpha: 1 };
}

function glowLinesItem(colour: string, segments: Segment[], alpha: number, dash: number[]): LinesItem {
  return { kind: "lines", colour, segments, alpha, dash, glow: true };
}

function bracketItem(rect: Readonly<Rect>): LinesItem {
  const brackets = cornerBrackets(rect, BRACKET_LENGTH);
  return glowLinesItem(COLOURS.phosphor, brackets, 1, SOLID);
}

function planetItems(roundPlanets: MatchView["planets"]): FrameItem[] {
  const contours = roundPlanets.flatMap(gravityWellContourItems);
  const sprites = roundPlanets.map(planetSpriteItem);
  return [...contours, ...sprites];
}

function gravityWellContourItems(planet: Readonly<Planet>): RingItem[] {
  const radii = gravityWellContourRadii(planet);
  return radii.map((radius) => ({
    kind: "ring",
    colour: COLOURS.instrumentDim,
    centre: { x: planet.x, y: planet.y },
    radius,
    alpha: GRAVITY_WELL_CONTOUR_ALPHA,
  }));
}

function planetSpriteItem(planet: Readonly<Planet>): ImageItem {
  const sprite: SpriteName = `planet${planet.sprite}`;
  const box = planetBox(planet);
  return imageItem(sprite, box);
}

function trailItems(roundTrails: MatchView["trails"]): LinesItem[] {
  const latestShotNumber = roundTrails.at(-1)?.shotNumber ?? 0;
  const shotNumbers = new Set(roundTrails.map((segment) => segment.shotNumber));
  return [...shotNumbers].map((shotNumber) => {
    const segments = roundTrails.filter((segment) => segment.shotNumber === shotNumber);
    const alpha = trailAlpha(latestShotNumber - shotNumber);
    return {
      kind: "lines",
      colour: PLAYER_COLOURS[segments[0].shooter],
      segments,
      alpha,
      dash: SOLID,
      glow: false,
    };
  });
}

function shipItems(roundShips: MatchView["ships"], sides: readonly Side[]): GroupItem[] {
  return sides.map((side) => shipItem(side, roundShips[side]));
}

function shipItem(side: Side, ship: Readonly<Ship>): GroupItem {
  const pose = shipPose(ship.aim.angle, side);
  const frame = shipFrameItem(side, pose.frameLeft, 1);
  const nextFrame = shipFrameItem(side, pose.nextFrameLeft, pose.nextFrameWeight);
  return {
    kind: "group",
    transform: { x: ship.x, y: ship.y, rotation: pose.rotation, scale: 1 },
    items: [frame, nextFrame],
  };
}

function shipFrameItem(side: Side, frameLeft: number, alpha: number): SpriteFrameItem {
  const sprite: SpriteName = `${side}Ship`;
  return {
    kind: "spriteFrame",
    sprite,
    source: { left: frameLeft, top: 0, width: SHIP_FRAME_WIDTH, height: SHIP_FRAME_HEIGHT },
    target: {
      left: SHIP_FRAME_OFFSET_LEFT,
      top: SHIP_FRAME_OFFSET_TOP,
      width: SHIP_FRAME_WIDTH,
      height: SHIP_FRAME_HEIGHT,
    },
    alpha,
  };
}

function aimingItems(view: MatchView): FrameItem[] {
  const side = view.activePlayer;
  const ships = shipItems(view.ships, SIDES);
  const segment = aimLine(view);
  const reticle = aimReticleItems(segment, PLAYER_COLOURS[side]);
  const aimInfo = aimInfoItems(view.ships[side].aim);
  return [...ships, ...reticle, ...aimInfo];
}

function aimReticleItems(line: Readonly<Segment>, colour: string): FrameItem[] {
  const dashedLine = glowLinesItem(colour, [line], 1, AIM_DASH);
  const tip: RingItem = { kind: "ring", colour, centre: line.to, radius: AIM_TIP_RADIUS, alpha: 1 };
  return [dashedLine, tip];
}

function aimInfoItems(aim: Readonly<Aim>): TextItem[] {
  const angleText = angleInfoText(aim);
  const powerText = powerInfoText(aim);
  return [
    hudText(angleText, COLOURS.phosphor, ANGLE_INFO_LEFT, HUD_TOP, "left", "top"),
    hudText(powerText, COLOURS.phosphor, POWER_INFO_LEFT, HUD_TOP, "left", "top"),
  ];
}

function flightItems(view: MatchView, flight: InFlightView): FrameItem[] {
  const ships = shipItems(view.ships, SIDES);
  const afterglow = afterglowItems(view.trails, flight.missile);
  const missile = isZoomViewShown(view) ? zoomViewItems(view, flight.missile) : [missileItem(flight.missile)];
  const penalty = powerPenalty(view);
  const timedOut = isTimedOut(flight);
  const penaltyText = powerPenaltyText(penalty);
  const timeout = timeoutText(flight.missile.flightStepsLeft, timedOut);
  return [
    ...ships,
    ...afterglow,
    ...missile,
    hudText(penaltyText, COLOURS.instrumentDim, POWER_PENALTY_CENTRE_X, HUD_TOP, "center", "top"),
    hudText(timeout, COLOURS.instrumentDim, TIMEOUT_INFO_CENTRE_X, TIMEOUT_INFO_BOTTOM, "center", "bottom"),
  ];
}

function afterglowItems(roundTrails: MatchView["trails"], flyingMissile: Readonly<Missile>): LinesItem[] {
  const flown = stepsFlown(flyingMissile);
  const fading = afterglowSegments(roundTrails, flown);
  return fading.map(({ segment, alpha }) => glowLinesItem(COLOURS.phosphor, [segment], alpha, SOLID));
}

function missileItem(flyingMissile: Readonly<Missile>): ImageItem {
  const box = centredBox(flyingMissile, MISSILE_SPRITE_SIZE, MISSILE_SPRITE_SIZE);
  return imageItem("missile", box);
}

function zoomViewItems(view: MatchView, flyingMissile: Readonly<Missile>): FrameItem[] {
  const dimming: FillRectItem = { kind: "fillRect", colour: ZOOM_DIM_COLOUR, rect: PLAYING_AREA };
  const backdrop = imageItem("backdrop", ZOOM_VIEW);
  const grid = zoomGridItem();
  const zoomedPlayingArea = zoomedPlayingAreaItem(view);
  const zoomedTrails = zoomedTrailItems(view.trails, flyingMissile);
  const zoomedMissile = zoomedMissileItem(flyingMissile);
  const outlines = zoomOutlineItems();
  return [dimming, backdrop, grid, zoomedPlayingArea, ...zoomedTrails, zoomedMissile, ...outlines];
}

function zoomGridItem(): LinesItem {
  const gridArea = strokeOutline(ZOOM_VIEW);
  const segments = gridLines(gridArea, ZOOM_GRID_SPACING);
  return { kind: "lines", colour: COLOURS.instrumentDim, segments, alpha: ZOOM_GRID_ALPHA, dash: SOLID, glow: false };
}

function zoomedPlayingAreaItem(view: MatchView): GroupItem {
  const planets = planetItems(view.planets);
  const ships = shipItems(view.ships, SIDES);
  return {
    kind: "group",
    transform: { x: ZOOMED_PLAYING_AREA.left, y: ZOOMED_PLAYING_AREA.top, rotation: 0, scale: ZOOM_SCALE },
    items: [...planets, ...ships],
  };
}

function zoomedTrailItems(roundTrails: MatchView["trails"], flyingMissile: Readonly<Missile>): LinesItem[] {
  const trails = trailItems(roundTrails);
  const afterglow = afterglowItems(roundTrails, flyingMissile);
  return [...trails, ...afterglow].map(zoomedLinesItem);
}

function zoomedLinesItem(item: LinesItem): LinesItem {
  const segments = item.segments.map(zoomViewSegment);
  return { ...item, segments };
}

function zoomedMissileItem(flyingMissile: Readonly<Missile>): ImageItem {
  const centre = zoomViewPoint(flyingMissile);
  const size = zoomedMissileSize(MISSILE_SPRITE_SIZE, MISSILE_SPRITE_SIZE);
  const box = centredBox(centre, size.width, size.height);
  return imageItem("missile", box);
}

function zoomOutlineItems(): FrameItem[] {
  const zoomViewOutline = strokeOutline(ZOOM_VIEW);
  const playingAreaOutline = strokeOutline(ZOOMED_PLAYING_AREA);
  const brackets = bracketItem(zoomViewOutline);
  return [
    { kind: "strokeRect", colour: COLOURS.instrumentDim, rect: zoomViewOutline },
    { kind: "strokeRect", colour: COLOURS.instrumentDim, rect: playingAreaOutline },
    brackets,
  ];
}

function scoreItems(matchScores: MatchView["scores"]): TextItem[] {
  const texts = scoreTexts(matchScores);
  return [
    hudText(texts.left, PLAYER_COLOURS.left, LEFT_SCORE_LEFT, HUD_TOP, "left", "top"),
    hudText(texts.right, PLAYER_COLOURS.right, RIGHT_SCORE_RIGHT, HUD_TOP, "right", "top"),
  ];
}

function roundBannerItems(round: number, stepsIntoRound: number): TextItem[] {
  const banner = roundBanner(round, stepsIntoRound);
  if (banner === null) {
    return [];
  }
  return [
    {
      kind: "text",
      text: banner.text,
      x: BANNER_CENTRE_X,
      y: BANNER_CENTRE_Y,
      colour: COLOURS.phosphor,
      font: "title",
      fontSize: banner.fontSize,
      align: "center",
      baseline: "middle",
      alpha: banner.alpha,
    },
  ];
}

function roundOverItems(roundShips: MatchView["ships"], roundOver: RoundOverView): FrameItem[] {
  const hitScene = hitSceneItems(roundShips, roundOver);
  const message = roundOverMessageItems(roundOver.result);
  return [...hitScene, ...message];
}

function hitSceneItems(roundShips: MatchView["ships"], roundOver: RoundOverView): FrameItem[] {
  const hitSide = roundOver.result.hitShip;
  const survivingSides = SIDES.filter((side) => side !== hitSide);
  const ships = shipItems(roundShips, survivingSides);
  const hitShip = roundShips[hitSide];
  const explosion = explosionItems(hitShip, roundOver.stepsSinceRoundOver);
  const bloom = bloomItems(hitShip, roundOver.stepsSinceRoundOver);
  return [...ships, ...explosion, ...bloom];
}

function explosionItems(ship: Readonly<Ship>, stepsSinceHit: number): ImageItem[] {
  const size = explosionSize(stepsSinceHit);
  if (size === null) {
    return [];
  }
  const box = centredBox(ship, size, size);
  return [imageItem("explosion", box)];
}

function bloomItems(ship: Readonly<Ship>, stepsSinceHit: number): BloomItem[] {
  const bloom = explosionBloom(stepsSinceHit);
  if (bloom === null) {
    return [];
  }
  return [
    {
      kind: "bloom",
      colour: COLOURS.phosphor,
      centre: { x: ship.x, y: ship.y },
      radius: bloom.radius,
      alpha: bloom.alpha,
    },
  ];
}

function roundOverMessageItems(result: Readonly<RoundResult>): FrameItem[] {
  const box = roundOverMessageBox(result.outcome);
  const panel = roundOverPanelItems(box);
  const tops = roundOverTextTops(result.outcome);
  const title = roundOverTitleItem(result, tops.title);
  const scoreChange = scoreChangeText(result.scoreChange);
  const rows = scoreBreakdownRows(result);
  const rowTexts = rows.flatMap((row) => [
    hudText(row.label, COLOURS.instrumentDim, MESSAGE_LABEL_LEFT, row.top, "left", "top"),
    hudText(row.value, COLOURS.phosphor, MESSAGE_VALUE_RIGHT, row.top, "right", "top"),
  ]);
  const shooterColour = PLAYER_COLOURS[result.shooter];
  return [
    ...panel,
    {
      kind: "group",
      transform: { x: box.left, y: box.top, rotation: 0, scale: 1 },
      items: [
        title,
        hudText(scoreChange, shooterColour, MESSAGE_TEXT_CENTRE_X, tops.scoreChange, "center", "top"),
        hudText(MESSAGE_PROMPT_TEXT, COLOURS.instrumentDim, MESSAGE_TEXT_CENTRE_X, tops.prompt, "center", "top"),
        ...rowTexts,
      ],
    },
  ];
}

function roundOverPanelItems(box: Readonly<Rect>): FrameItem[] {
  const outerOutline = strokeOutline(box);
  const innerBox = insetRect(box, PANEL_OUTLINE_GAP);
  const innerOutline = strokeOutline(innerBox);
  const brackets = bracketItem(outerOutline);
  return [
    { kind: "fillRect", colour: GLASS_COLOUR, rect: box },
    { kind: "strokeRect", colour: COLOURS.instrumentDim, rect: outerOutline },
    { kind: "strokeRect", colour: COLOURS.instrumentDim, rect: innerOutline },
    brackets,
  ];
}

function roundOverTitleItem(result: Readonly<RoundResult>, top: number): TextItem {
  const title = roundOverTitle(result);
  return {
    kind: "text",
    text: title,
    x: MESSAGE_TEXT_CENTRE_X,
    y: top,
    colour: COLOURS.phosphor,
    font: "title",
    fontSize: PANEL_TITLE_FONT_SIZE,
    align: "center",
    baseline: "top",
    alpha: 1,
  };
}
