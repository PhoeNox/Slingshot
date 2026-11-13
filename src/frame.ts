// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Missile, Segment } from "./core/flight";
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
import type { Aim, Ship, Side } from "./core/round";
import {
  angleInfoText,
  centredBox,
  explosionSize,
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
  ZOOM_SCALE,
  ZOOM_VIEW,
  ZOOMED_PLAYING_AREA,
  zoomedMissileSize,
  zoomViewPoint,
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

export interface LinesItem {
  kind: "lines";
  colour: string;
  segments: Segment[];
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

export type FrameItem = ImageItem | SpriteFrameItem | LinesItem | FillRectItem | StrokeRectItem | TextItem | GroupItem;

const SIDES: readonly Side[] = ["left", "right"];

const SHIP_COLOURS: Record<Side, string> = { left: "rgb(209, 170, 133)", right: "rgb(132, 152, 192)" };
const TEXT_COLOUR = "#fff";

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

const MESSAGE_DIM_COLOUR = "rgba(0, 0, 0, 0.69)";
const MESSAGE_OUTLINE_COLOUR = "rgb(150, 150, 150)";

const DIM_COLOUR = "rgba(0, 0, 0, 0.69)";
const ZOOM_VIEW_OUTLINE_COLOUR = "#fff";
const ZOOMED_PLAYING_AREA_OUTLINE_COLOUR = "rgb(150, 150, 150)";

const BANNER_CENTRE_X = 399;
const BANNER_CENTRE_Y = 299;

const PLAYING_AREA: Readonly<Rect> = { left: 0, top: 0, width: PLAYING_AREA_WIDTH, height: PLAYING_AREA_HEIGHT };

export function describeFrame(view: MatchView): FrameItem[] {
  const backdrop = imageItem("backdrop", PLAYING_AREA);
  const planets = planetItems(view.planets);
  const trails = trailItems(view.trails);
  const phase = phaseItems(view);
  const scores = scoreItems(view.scores);
  const banner = roundBannerItems(view.roundNumber, view.roundStepCount);
  return [backdrop, ...planets, ...trails, ...phase, ...scores, ...banner];
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
  return { kind: "text", text, x, y, colour, fontSize: HUD_FONT_SIZE, align, baseline, alpha: 1 };
}

function planetItems(roundPlanets: MatchView["planets"]): ImageItem[] {
  return roundPlanets.map((planet) => {
    const sprite: SpriteName = `planet${planet.sprite}`;
    const box = planetBox(planet);
    return imageItem(sprite, box);
  });
}

function trailItems(roundTrails: MatchView["trails"]): LinesItem[] {
  return SIDES.map((side) => ({
    kind: "lines",
    colour: SHIP_COLOURS[side],
    segments: roundTrails.filter((segment) => segment.shooter === side),
  }));
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
  const line = aimLineItem(segment, SHIP_COLOURS[side]);
  const aimInfo = aimInfoItems(view.ships[side].aim);
  return [...ships, line, ...aimInfo];
}

function aimLineItem(line: Readonly<Segment>, colour: string): LinesItem {
  return { kind: "lines", colour, segments: [line] };
}

function aimInfoItems(aim: Readonly<Aim>): TextItem[] {
  const angleText = angleInfoText(aim);
  const powerText = powerInfoText(aim);
  return [
    hudText(angleText, TEXT_COLOUR, ANGLE_INFO_LEFT, HUD_TOP, "left", "top"),
    hudText(powerText, TEXT_COLOUR, POWER_INFO_LEFT, HUD_TOP, "left", "top"),
  ];
}

function flightItems(view: MatchView, flight: InFlightView): FrameItem[] {
  const ships = shipItems(view.ships, SIDES);
  const missile = isZoomViewShown(view) ? zoomViewItems(view, flight.missile) : [missileItem(flight.missile)];
  const penalty = powerPenalty(view);
  const timedOut = isTimedOut(flight);
  const penaltyText = powerPenaltyText(penalty);
  const timeout = timeoutText(flight.missile.flightStepsLeft, timedOut);
  return [
    ...ships,
    ...missile,
    hudText(penaltyText, TEXT_COLOUR, POWER_PENALTY_CENTRE_X, HUD_TOP, "center", "top"),
    hudText(timeout, TEXT_COLOUR, TIMEOUT_INFO_CENTRE_X, TIMEOUT_INFO_BOTTOM, "center", "bottom"),
  ];
}

function missileItem(flyingMissile: Readonly<Missile>): ImageItem {
  const box = centredBox(flyingMissile, MISSILE_SPRITE_SIZE, MISSILE_SPRITE_SIZE);
  return imageItem("missile", box);
}

function zoomViewItems(view: MatchView, flyingMissile: Readonly<Missile>): FrameItem[] {
  const dimming: FillRectItem = { kind: "fillRect", colour: DIM_COLOUR, rect: PLAYING_AREA };
  const backdrop = imageItem("backdrop", ZOOM_VIEW);
  const zoomedPlayingArea = zoomedPlayingAreaItem(view);
  const zoomedMissile = zoomedMissileItem(flyingMissile);
  const outlines = zoomOutlineItems();
  return [dimming, backdrop, zoomedPlayingArea, zoomedMissile, ...outlines];
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

function zoomedMissileItem(flyingMissile: Readonly<Missile>): ImageItem {
  const centre = zoomViewPoint(flyingMissile);
  const size = zoomedMissileSize(MISSILE_SPRITE_SIZE, MISSILE_SPRITE_SIZE);
  const box = centredBox(centre, size.width, size.height);
  return imageItem("missile", box);
}

function zoomOutlineItems(): StrokeRectItem[] {
  const zoomViewOutline = strokeOutline(ZOOM_VIEW);
  const playingAreaOutline = strokeOutline(ZOOMED_PLAYING_AREA);
  return [
    { kind: "strokeRect", colour: ZOOM_VIEW_OUTLINE_COLOUR, rect: zoomViewOutline },
    { kind: "strokeRect", colour: ZOOMED_PLAYING_AREA_OUTLINE_COLOUR, rect: playingAreaOutline },
  ];
}

function scoreItems(matchScores: MatchView["scores"]): TextItem[] {
  const texts = scoreTexts(matchScores);
  return [
    hudText(texts.left, SHIP_COLOURS.left, LEFT_SCORE_LEFT, HUD_TOP, "left", "top"),
    hudText(texts.right, SHIP_COLOURS.right, RIGHT_SCORE_RIGHT, HUD_TOP, "right", "top"),
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
      colour: TEXT_COLOUR,
      fontSize: banner.fontSize,
      align: "center",
      baseline: "middle",
      alpha: banner.alpha,
    },
  ];
}

function roundOverItems(roundShips: MatchView["ships"], roundOver: RoundOverView): FrameItem[] {
  const result = roundOver.result;
  const survivingSides = SIDES.filter((side) => side !== result.hitShip);
  const ships = shipItems(roundShips, survivingSides);
  const explosion = explosionItems(roundShips[result.hitShip], roundOver.stepsSinceRoundOver);
  const message = roundOverMessageItems(result);
  return [...ships, ...explosion, ...message];
}

function explosionItems(ship: Readonly<Ship>, stepsSinceHit: number): ImageItem[] {
  const size = explosionSize(stepsSinceHit);
  if (size === null) {
    return [];
  }
  const box = centredBox(ship, size, size);
  return [imageItem("explosion", box)];
}

function roundOverMessageItems(result: Readonly<RoundResult>): FrameItem[] {
  const box = roundOverMessageBox(result.outcome);
  const outline = strokeOutline(box);
  const tops = roundOverTextTops(result.outcome);
  const title = roundOverTitle(result);
  const scoreChange = scoreChangeText(result.scoreChange);
  const rows = scoreBreakdownRows(result);
  const rowTexts = rows.flatMap((row) => [
    hudText(row.label, TEXT_COLOUR, MESSAGE_LABEL_LEFT, row.top, "left", "top"),
    hudText(row.value, TEXT_COLOUR, MESSAGE_VALUE_RIGHT, row.top, "right", "top"),
  ]);
  return [
    { kind: "fillRect", colour: MESSAGE_DIM_COLOUR, rect: box },
    { kind: "strokeRect", colour: MESSAGE_OUTLINE_COLOUR, rect: outline },
    {
      kind: "group",
      transform: { x: box.left, y: box.top, rotation: 0, scale: 1 },
      items: [
        hudText(title, TEXT_COLOUR, MESSAGE_TEXT_CENTRE_X, tops.title, "center", "top"),
        hudText(scoreChange, TEXT_COLOUR, MESSAGE_TEXT_CENTRE_X, tops.scoreChange, "center", "top"),
        hudText(MESSAGE_PROMPT_TEXT, TEXT_COLOUR, MESSAGE_TEXT_CENTRE_X, tops.prompt, "center", "top"),
        ...rowTexts,
      ],
    },
  ];
}
