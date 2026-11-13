// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterglowSegments, explosionBloom, explosionSize, roundBanner, trailAlpha } from "./animationCurves";
import { COLOURS } from "./colours";
import type { Missile, Point, Segment } from "./core/flight";
import type { InFlightView, MatchView, RoundOutcome, RoundOverView, RoundResult, Zoom } from "./core/match";
import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./core/playingArea";
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

export interface DisplaySettings {
  gravityWellContours: boolean;
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

const ZOOM_OUTLINE_ALPHA = 0.5;

const ATTRACT_DIM_COLOUR = "rgba(4, 8, 21, 0.55)";

const PLAYING_AREA: Readonly<Rect> = { left: 0, top: 0, width: PLAYING_AREA_WIDTH, height: PLAYING_AREA_HEIGHT };

export function describeFrame(view: MatchView, display: Readonly<DisplaySettings>): FrameItem[] {
  const scene = sceneItems(view, display);
  const zoomedScene = zoomedSceneItems(scene, view.zoom);
  const border = bounceBorderItems(view.bounce);
  const hud = phaseHudItems(view);
  const scores = scoreItems(view.scores);
  const banner = roundBannerItems(view.roundNumber, view.roundStepCount);
  return [...zoomedScene, ...border, ...hud, ...scores, ...banner];
}

function bounceBorderItems(bounce: boolean): StrokeRectItem[] {
  if (!bounce) {
    return [];
  }
  const outline = strokeOutline(PLAYING_AREA);
  return [{ kind: "strokeRect", colour: COLOURS.instrumentDim, rect: outline }];
}

function sceneItems(view: MatchView, display: Readonly<DisplaySettings>): FrameItem[] {
  const planets = planetItems(view.planets, display);
  const trails = trailItems(view.trails);
  const phase = phaseSceneItems(view);
  return [...planets, ...trails, ...phase];
}

function zoomedSceneItems(scene: FrameItem[], zoom: Readonly<Zoom>): FrameItem[] {
  if (zoom.scale === 1) {
    return scene;
  }
  const transform = zoomTransform(zoom);
  const outline = playingAreaOutlineItem(transform);
  const zoomGroup: GroupItem = { kind: "group", transform, items: scene };
  return [outline, zoomGroup];
}

function zoomTransform(zoom: Readonly<Zoom>): Transform {
  return { x: 0 - zoom.left * zoom.scale, y: 0 - zoom.top * zoom.scale, rotation: 0, scale: zoom.scale };
}

function playingAreaOutlineItem(transform: Readonly<Transform>): LinesItem {
  const zoomedArea = {
    left: transform.x,
    top: transform.y,
    width: PLAYING_AREA_WIDTH * transform.scale,
    height: PLAYING_AREA_HEIGHT * transform.scale,
  };
  const outline = strokeOutline(zoomedArea);
  const segments = rectSegments(outline);
  return {
    kind: "lines",
    colour: COLOURS.instrumentDim,
    segments,
    alpha: ZOOM_OUTLINE_ALPHA,
    dash: SOLID,
    glow: false,
  };
}

export function describeAttractFrame(view: MatchView, display: Readonly<DisplaySettings>): FrameItem[] {
  const planets = planetItems(view.planets, display);
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
  return flightSceneItems(view, flight, MISSILE_SPRITE_SIZE);
}

export function describeBackdropFrame(): FrameItem[] {
  const backdrop = imageItem("backdrop", PLAYING_AREA);
  return [backdrop];
}

function phaseSceneItems(view: MatchView): FrameItem[] {
  switch (view.phase.kind) {
    case "aiming":
      return aimingSceneItems(view);
    case "inFlight":
      return flightSceneItems(view, view.phase, MISSILE_SPRITE_SIZE / view.zoom.scale);
    case "roundOver":
      return hitSceneItems(view.ships, view.phase);
  }
}

function phaseHudItems(view: MatchView): FrameItem[] {
  switch (view.phase.kind) {
    case "aiming":
      return aimInfoItems(view.ships[view.activePlayer].aim);
    case "inFlight":
      return flightHudItems(view.powerPenalty, view.phase);
    case "roundOver":
      return roundOverMessageItems(view.phase.result);
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

function planetItems(roundPlanets: MatchView["planets"], display: Readonly<DisplaySettings>): FrameItem[] {
  const contours = display.gravityWellContours ? roundPlanets.flatMap(gravityWellContourItems) : [];
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

function aimingSceneItems(view: MatchView): FrameItem[] {
  const ships = shipItems(view.ships, SIDES);
  const reticle = aimReticleItems(view.aimLine, PLAYER_COLOURS[view.activePlayer]);
  return [...ships, ...reticle];
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

function flightSceneItems(view: MatchView, flight: InFlightView, missileSize: number): FrameItem[] {
  const ships = shipItems(view.ships, SIDES);
  const afterglow = afterglowItems(view.trails, flight);
  const missile = missileItem(flight.missile, missileSize);
  return [...ships, ...afterglow, missile];
}

function flightHudItems(powerPenalty: number, flight: InFlightView): TextItem[] {
  const penaltyText = powerPenaltyText(powerPenalty);
  const timeout = timeoutItems(flight);
  return [hudText(penaltyText, COLOURS.instrumentDim, SCREEN_CENTRE_X, HUD_TOP, "center", "top"), ...timeout];
}

function timeoutItems(flight: InFlightView): TextItem[] {
  const stepsLeft = flight.missile.flightStepsLeft;
  if (stepsLeft === undefined) {
    return [];
  }
  const text = timeoutText(stepsLeft, flight.timedOut);
  return [hudText(text, COLOURS.instrumentDim, SCREEN_CENTRE_X, TIMEOUT_INFO_BOTTOM, "center", "bottom")];
}

function afterglowItems(roundTrails: MatchView["trails"], flight: InFlightView): LinesItem[] {
  const fading = afterglowSegments(roundTrails, flight.stepsFlown);
  return fading.map(({ segment, alpha }) => glowLinesItem(PLAYER_COLOURS[segment.shooter], [segment], alpha, SOLID));
}

function missileItem(flyingMissile: Readonly<Missile>, size: number): ImageItem {
  const box = centredBox(flyingMissile, size, size);
  return imageItem("missile", box);
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

function rectSegments(rect: Readonly<Rect>): Segment[] {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const corners = [
    { x: rect.left, y: rect.top },
    { x: right, y: rect.top },
    { x: right, y: bottom },
    { x: rect.left, y: bottom },
  ];
  return corners.map((corner, index) => ({ from: corner, to: corners[(index + 1) % corners.length] }));
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
