// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterglowSegments, explosionBloom, explosionSize, roundBanner, trailAlpha } from "./animationCurves";
import { COLOURS } from "./colours";
import type { Missile, Point, Segment } from "./core/flight";
import type { InFlightView, MatchView, RoundOutcome, RoundOverView, RoundResult } from "./core/match";
import {
  PLAYING_AREA_HEIGHT,
  PLAYING_AREA_WIDTH,
  TRACKING_AREA_BOTTOM,
  TRACKING_AREA_LEFT,
  TRACKING_AREA_RIGHT,
  TRACKING_AREA_TOP,
} from "./core/playingArea";
import type { Aim, Planet, Ship, Side } from "./core/round";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

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

interface ShipPose {
  rotation: number;
  frameLeft: number;
  nextFrameLeft: number;
  nextFrameWeight: number;
}

interface BreakdownRow {
  label: string;
  value: string;
  top: number;
}

interface RoundOverTextTops {
  title: number;
  scoreChange: number;
  prompt: number;
}

const SIDES: readonly Side[] = ["left", "right"];

const PLAYER_NAMES: Record<Side, string> = { left: "Player 1", right: "Player 2" };
const PLAYER_COLOURS: Record<Side, string> = { left: COLOURS.leftPlayer, right: COLOURS.rightPlayer };
const SOLID: number[] = [];

const SCREEN_CENTRE_X = 399;
const SCREEN_CENTRE_Y = 299;

const SHIP_FRAME_WIDTH = 40;
const SHIP_FRAME_HEIGHT = 33;
const SHIP_FRAME_OFFSET_LEFT = -SHIP_FRAME_WIDTH / 2;
const SHIP_FRAME_OFFSET_TOP = -Math.floor(SHIP_FRAME_HEIGHT / 2);
const SHIP_FRAME_COUNT = 8;
const SHIP_FRAME_ANGLE = 360 / SHIP_FRAME_COUNT;
const SHIP_SHEET_FACING_ANGLE: Record<Side, number> = { left: 90, right: 270 };

const AIM_DASH = [8, 6];
const AIM_TIP_RADIUS = 5;

const BRACKET_LENGTH = 14;

const PLANET_SPRITE_FILL = 0.96;
const GRAVITY_WELL_CONTOUR_COUNT = 3;
const GRAVITY_WELL_CONTOUR_SPACING_PER_SQRT_MASS = 1.5;
const GRAVITY_WELL_CONTOUR_ALPHA = 0.45;

const MISSILE_SPRITE_SIZE = 25;

const HUD_FONT_SIZE = 14;
const HUD_TOP = 5;
const ANGLE_INFO_LEFT = 290;
const POWER_INFO_LEFT = 403;
const TIMEOUT_INFO_BOTTOM = 594;
const LEFT_SCORE_LEFT = 5;
const RIGHT_SCORE_RIGHT = 794;

const GLASS_COLOUR = "rgba(4, 8, 21, 0.78)";
const PANEL_OUTLINE_GAP = 4;
const PANEL_TITLE_FONT_SIZE = 16;

const MESSAGE_WIDTH = 450;
const MESSAGE_BASE_HEIGHT = 190;
const MESSAGE_HIT_EXTRA_HEIGHT = 40;
const MESSAGE_TEXT_CENTRE_X = 224;
const MESSAGE_LABEL_LEFT = 50;
const MESSAGE_VALUE_RIGHT = 399;
const MESSAGE_TITLE_TOP = 28;
const MESSAGE_FIRST_ROW_TOP = 65;
const MESSAGE_ROW_HEIGHT = 20;
const MESSAGE_SCORE_CHANGE_TOP = 100;
const MESSAGE_PROMPT_TOP = 140;
const MESSAGE_PROMPT_TEXT = "Press Space or Enter for the next round";

const ZOOM_DIM_COLOUR = "rgba(4, 8, 21, 0.75)";
const ZOOM_GRID_SPACING = 50;
const ZOOM_GRID_ALPHA = 0.3;
const ZOOM_SCALE = 0.25;
const ZOOM_MISSILE_SCALE = 1 / 3;
const ZOOMED_MISSILE_SIZE = MISSILE_SPRITE_SIZE * ZOOM_MISSILE_SCALE;
const ZOOM_VIEW_WIDTH = (TRACKING_AREA_RIGHT - TRACKING_AREA_LEFT) * ZOOM_SCALE;
const ZOOM_VIEW_HEIGHT = (TRACKING_AREA_BOTTOM - TRACKING_AREA_TOP) * ZOOM_SCALE;
const ZOOM_VIEW_LEFT = (PLAYING_AREA_WIDTH - ZOOM_VIEW_WIDTH) / 2;
const ZOOM_VIEW_TOP = (PLAYING_AREA_HEIGHT - ZOOM_VIEW_HEIGHT) / 2;

const ZOOM_VIEW: Readonly<Rect> = {
  left: ZOOM_VIEW_LEFT,
  top: ZOOM_VIEW_TOP,
  width: ZOOM_VIEW_WIDTH,
  height: ZOOM_VIEW_HEIGHT,
};

const ZOOMED_PLAYING_AREA: Readonly<Rect> = {
  left: ZOOM_VIEW_LEFT - TRACKING_AREA_LEFT * ZOOM_SCALE,
  top: ZOOM_VIEW_TOP - TRACKING_AREA_TOP * ZOOM_SCALE,
  width: PLAYING_AREA_WIDTH * ZOOM_SCALE,
  height: PLAYING_AREA_HEIGHT * ZOOM_SCALE,
};

const ATTRACT_DIM_COLOUR = "rgba(4, 8, 21, 0.55)";

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
      return attractFlightItems(view, view.phase);
    case "roundOver":
      return hitSceneItems(view.ships, view.phase);
  }
}

function attractFlightItems(view: MatchView, flight: InFlightView): FrameItem[] {
  const ships = shipItems(view.ships, SIDES);
  const afterglow = afterglowItems(view.trails, flight);
  const missile = missileItem(flight.missile);
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
  const reticle = aimReticleItems(view.aimLine, PLAYER_COLOURS[side]);
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
  const afterglow = afterglowItems(view.trails, flight);
  const missile = view.zoomViewShown ? zoomViewItems(view, flight) : [missileItem(flight.missile)];
  const penaltyText = powerPenaltyText(view.powerPenalty);
  const timeout = timeoutText(flight.missile.flightStepsLeft, flight.timedOut);
  return [
    ...ships,
    ...afterglow,
    ...missile,
    hudText(penaltyText, COLOURS.instrumentDim, SCREEN_CENTRE_X, HUD_TOP, "center", "top"),
    hudText(timeout, COLOURS.instrumentDim, SCREEN_CENTRE_X, TIMEOUT_INFO_BOTTOM, "center", "bottom"),
  ];
}

function afterglowItems(roundTrails: MatchView["trails"], flight: InFlightView): LinesItem[] {
  const fading = afterglowSegments(roundTrails, flight.stepsFlown);
  return fading.map(({ segment, alpha }) => glowLinesItem(PLAYER_COLOURS[segment.shooter], [segment], alpha, SOLID));
}

function missileItem(flyingMissile: Readonly<Missile>): ImageItem {
  const box = centredBox(flyingMissile, MISSILE_SPRITE_SIZE, MISSILE_SPRITE_SIZE);
  return imageItem("missile", box);
}

function zoomViewItems(view: MatchView, flight: InFlightView): FrameItem[] {
  const dimming: FillRectItem = { kind: "fillRect", colour: ZOOM_DIM_COLOUR, rect: PLAYING_AREA };
  const backdrop = imageItem("backdrop", ZOOM_VIEW);
  const grid = zoomGridItem();
  const zoomedPlayingArea = zoomedPlayingAreaItem(view);
  const zoomedTrails = zoomedTrailItems(view.trails, flight);
  const zoomedMissile = zoomedMissileItem(flight.missile);
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

function zoomedTrailItems(roundTrails: MatchView["trails"], flight: InFlightView): LinesItem[] {
  const trails = trailItems(roundTrails);
  const afterglow = afterglowItems(roundTrails, flight);
  return [...trails, ...afterglow].map(zoomedLinesItem);
}

function zoomedLinesItem(item: LinesItem): LinesItem {
  const segments = item.segments.map(zoomViewSegment);
  return { ...item, segments };
}

function zoomedMissileItem(flyingMissile: Readonly<Missile>): ImageItem {
  const centre = zoomViewPoint(flyingMissile);
  const box = centredBox(centre, ZOOMED_MISSILE_SIZE, ZOOMED_MISSILE_SIZE);
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
      x: SCREEN_CENTRE_X,
      y: SCREEN_CENTRE_Y,
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

function shipPose(aimAngle: number, side: Side): ShipPose {
  const rotationDegrees = (aimAngle - SHIP_SHEET_FACING_ANGLE[side] + 360) % 360;
  const frame = Math.floor(rotationDegrees / SHIP_FRAME_ANGLE);
  const nextFrame = (frame + 1) % SHIP_FRAME_COUNT;
  return {
    rotation: (rotationDegrees * Math.PI) / 180,
    frameLeft: frame * SHIP_FRAME_WIDTH,
    nextFrameLeft: nextFrame * SHIP_FRAME_WIDTH,
    nextFrameWeight: (rotationDegrees - frame * SHIP_FRAME_ANGLE) / SHIP_FRAME_ANGLE,
  };
}

function gravityWellContourRadii(planet: Readonly<Planet>): number[] {
  const spacing = Math.sqrt(planet.mass) * GRAVITY_WELL_CONTOUR_SPACING_PER_SQRT_MASS;
  return Array.from({ length: GRAVITY_WELL_CONTOUR_COUNT }, (_, index) => planet.radius + (index + 1) * spacing);
}

function planetBox(planet: Readonly<Planet>): Rect {
  const size = Math.round((2 * planet.radius) / PLANET_SPRITE_FILL);
  return {
    left: planet.x - Math.floor(size / 2),
    top: planet.y - Math.floor(size / 2),
    width: size,
    height: size,
  };
}

function centredBox(centre: Readonly<Point>, width: number, height: number): Rect {
  return { left: centre.x - width / 2, top: centre.y - height / 2, width, height };
}

function strokeOutline(rect: Readonly<Rect>): Rect {
  return { left: rect.left + 0.5, top: rect.top + 0.5, width: rect.width - 1, height: rect.height - 1 };
}

function insetRect(rect: Readonly<Rect>, inset: number): Rect {
  return {
    left: rect.left + inset,
    top: rect.top + inset,
    width: rect.width - 2 * inset,
    height: rect.height - 2 * inset,
  };
}

function cornerBrackets(rect: Readonly<Rect>, length: number): Segment[] {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const corners = [
    { x: rect.left, y: rect.top, dx: 1, dy: 1 },
    { x: right, y: rect.top, dx: -1, dy: 1 },
    { x: rect.left, y: bottom, dx: 1, dy: -1 },
    { x: right, y: bottom, dx: -1, dy: -1 },
  ];
  return corners.flatMap(({ x, y, dx, dy }) => [
    { from: { x, y }, to: { x: x + dx * length, y } },
    { from: { x, y }, to: { x, y: y + dy * length } },
  ]);
}

function gridLines(rect: Readonly<Rect>, spacing: number): Segment[] {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const columnCount = Math.ceil(rect.width / spacing) - 1;
  const rowCount = Math.ceil(rect.height / spacing) - 1;
  const columns = Array.from({ length: columnCount }, (_, index) => {
    const x = rect.left + (index + 1) * spacing;
    return { from: { x, y: rect.top }, to: { x, y: bottom } };
  });
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const y = rect.top + (index + 1) * spacing;
    return { from: { x: rect.left, y }, to: { x: right, y } };
  });
  return [...columns, ...rows];
}

function zoomViewPoint(point: Readonly<Point>): Point {
  return {
    x: ZOOMED_PLAYING_AREA.left + point.x * ZOOM_SCALE,
    y: ZOOMED_PLAYING_AREA.top + point.y * ZOOM_SCALE,
  };
}

function zoomViewSegment(segment: Readonly<Segment>): Segment {
  const from = zoomViewPoint(segment.from);
  const to = zoomViewPoint(segment.to);
  return { from, to };
}

function angleInfoText(aim: Readonly<Aim>): string {
  return `Angle: ${aim.angle.toFixed(2)}`;
}

function powerInfoText(aim: Readonly<Aim>): string {
  return `Power: ${aim.power.toFixed(1)}`;
}

function powerPenaltyText(penalty: number): string {
  return `Power penalty: ${Math.trunc(penalty)}`;
}

function timeoutText(flightStepsLeft: number, timedOut: boolean): string {
  return timedOut ? "Shot timed out..." : `Timeout in ${flightStepsLeft}`;
}

function scoreTexts(scores: Readonly<Record<Side, number>>): Record<Side, string> {
  return {
    left: `${PLAYER_NAMES.left}  --  ${scores.left}`,
    right: `${scores.right}  --  ${PLAYER_NAMES.right}`,
  };
}

function roundOverMessageBox(outcome: RoundOutcome): Rect {
  const height = MESSAGE_BASE_HEIGHT + (outcome === "hit" ? MESSAGE_HIT_EXTRA_HEIGHT : 0);
  return {
    left: SCREEN_CENTRE_X - MESSAGE_WIDTH / 2,
    top: SCREEN_CENTRE_Y - Math.floor(height / 2),
    width: MESSAGE_WIDTH,
    height,
  };
}

function roundOverTextTops(outcome: RoundOutcome): RoundOverTextTops {
  const rowsOffset = outcome === "hit" ? MESSAGE_HIT_EXTRA_HEIGHT : 0;
  return {
    title: MESSAGE_TITLE_TOP,
    scoreChange: MESSAGE_SCORE_CHANGE_TOP + rowsOffset,
    prompt: MESSAGE_PROMPT_TOP + rowsOffset,
  };
}

function roundOverTitle(result: Readonly<RoundResult>): string {
  const shooterName = PLAYER_NAMES[result.shooter];
  return result.outcome === "hit"
    ? `${shooterName} hit ${PLAYER_NAMES[result.hitShip].toLowerCase()}`
    : `${shooterName} hit their own ship`;
}

function scoreBreakdownRows(result: Readonly<RoundResult>): BreakdownRow[] {
  const entries: [string, number][] = result.outcome === "selfHit"
    ? [["Hit self:", result.baseScore]]
    : [
        ["Hit opponent:", result.baseScore],
        ["Quick-hit bonus:", result.quickHitBonus],
        ["Power penalty:", -result.powerPenalty],
      ];
  return entries.map(([label, value], index) => ({
    label,
    value: `${value}`,
    top: MESSAGE_FIRST_ROW_TOP + index * MESSAGE_ROW_HEIGHT,
  }));
}

function scoreChangeText(scoreChange: number): string {
  return scoreChange >= 0 ? `${scoreChange} added to score` : `${-scoreChange} deducted from score`;
}
