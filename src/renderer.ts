// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { FONT_FAMILY } from "./assets";
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
  type ShipPose,
} from "./presentation";

export interface Sprites {
  backdrop: HTMLImageElement;
  planets: HTMLImageElement[];
  ships: Record<Side, HTMLImageElement>;
  missile: HTMLImageElement;
  explosion: HTMLImageElement;
}

const SHIP_COLOURS: Record<Side, string> = { left: "rgb(209, 170, 133)", right: "rgb(132, 152, 192)" };

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

export function drawFrame(context: CanvasRenderingContext2D, sprites: Sprites, view: MatchView): void {
  drawBackdrop(context, sprites.backdrop);
  drawPlanets(context, sprites.planets, view.planets);
  drawTrails(context, view.trails);
  if (view.phase.kind === "aiming") {
    drawShips(context, sprites.ships, view.ships);
    drawAiming(context, view);
  } else if (view.phase.kind === "inFlight") {
    drawShips(context, sprites.ships, view.ships);
    drawFlight(context, sprites, view, view.phase);
  } else {
    drawRoundOver(context, sprites, view.ships, view.phase);
  }
  drawScores(context, view.scores);
  drawRoundBanner(context, view.roundNumber, view.roundStepCount);
}

function drawBackdrop(context: CanvasRenderingContext2D, backdrop: HTMLImageElement): void {
  context.drawImage(backdrop, 0, 0, PLAYING_AREA_WIDTH, PLAYING_AREA_HEIGHT);
}

function drawPlanets(
  context: CanvasRenderingContext2D,
  planetSprites: HTMLImageElement[],
  roundPlanets: MatchView["planets"],
): void {
  for (const planet of roundPlanets) {
    const box = planetBox(planet);
    context.drawImage(planetSprites[planet.sprite - 1], box.left, box.top, box.width, box.height);
  }
}

function drawTrails(context: CanvasRenderingContext2D, roundTrails: MatchView["trails"]): void {
  context.save();
  context.lineWidth = 1;
  for (const side of ["left", "right"] as const) {
    context.strokeStyle = SHIP_COLOURS[side];
    context.beginPath();
    for (const segment of roundTrails) {
      if (segment.shooter === side) {
        context.moveTo(segment.from.x, segment.from.y);
        context.lineTo(segment.to.x, segment.to.y);
      }
    }
    context.stroke();
  }
  context.restore();
}

function drawShips(
  context: CanvasRenderingContext2D,
  shipSheets: Record<Side, HTMLImageElement>,
  roundShips: MatchView["ships"],
  destroyedShip?: Side,
): void {
  for (const side of ["left", "right"] as const) {
    if (side === destroyedShip) {
      continue;
    }
    const ship = roundShips[side];
    const pose = shipPose(ship.aim.angle, side);
    drawShip(context, shipSheets[side], ship, pose);
  }
}

function drawShip(
  context: CanvasRenderingContext2D,
  shipSheet: HTMLImageElement,
  ship: Readonly<Ship>,
  pose: ShipPose,
): void {
  context.save();
  context.translate(ship.x, ship.y);
  context.rotate(pose.rotation);
  drawShipFrame(context, shipSheet, pose.frameLeft);
  context.globalAlpha = pose.nextFrameWeight;
  drawShipFrame(context, shipSheet, pose.nextFrameLeft);
  context.restore();
}

function drawShipFrame(context: CanvasRenderingContext2D, shipSheet: HTMLImageElement, frameLeft: number): void {
  context.drawImage(
    shipSheet,
    frameLeft,
    0,
    SHIP_FRAME_WIDTH,
    SHIP_FRAME_HEIGHT,
    SHIP_FRAME_OFFSET_LEFT,
    SHIP_FRAME_OFFSET_TOP,
    SHIP_FRAME_WIDTH,
    SHIP_FRAME_HEIGHT,
  );
}

function drawAiming(context: CanvasRenderingContext2D, view: MatchView): void {
  const side = view.activePlayer;
  const line = aimLine(view);
  drawAimLine(context, line, SHIP_COLOURS[side]);
  drawAimInfo(context, view.ships[side].aim);
}

function drawAimLine(context: CanvasRenderingContext2D, line: Readonly<Segment>, colour: string): void {
  context.save();
  context.strokeStyle = colour;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(line.from.x, line.from.y);
  context.lineTo(line.to.x, line.to.y);
  context.stroke();
  context.restore();
}

function drawAimInfo(context: CanvasRenderingContext2D, aim: Readonly<Aim>): void {
  const angleText = angleInfoText(aim);
  const powerText = powerInfoText(aim);
  context.save();
  context.fillStyle = "#fff";
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(angleText, ANGLE_INFO_LEFT, HUD_TOP);
  context.fillText(powerText, POWER_INFO_LEFT, HUD_TOP);
  context.restore();
}

function drawFlight(
  context: CanvasRenderingContext2D,
  sprites: Sprites,
  view: MatchView,
  flight: InFlightView,
): void {
  if (isZoomViewShown(view)) {
    drawZoomView(context, sprites, view, flight.missile);
  } else {
    drawMissile(context, sprites.missile, flight.missile);
  }
  const penalty = powerPenalty(view);
  const timedOut = isTimedOut(flight);
  drawPowerPenalty(context, penalty);
  drawTimeoutInfo(context, flight.missile.flightStepsLeft, timedOut);
}

function drawMissile(context: CanvasRenderingContext2D, missileSprite: HTMLImageElement, flyingMissile: Readonly<Missile>): void {
  const box = centredBox(flyingMissile, missileSprite.width, missileSprite.height);
  context.drawImage(missileSprite, box.left, box.top);
}

function drawZoomView(
  context: CanvasRenderingContext2D,
  sprites: Sprites,
  view: MatchView,
  flyingMissile: Readonly<Missile>,
): void {
  drawDimming(context);
  context.drawImage(sprites.backdrop, ZOOM_VIEW.left, ZOOM_VIEW.top, ZOOM_VIEW.width, ZOOM_VIEW.height);
  drawZoomedPlayingArea(context, sprites, view);
  drawZoomedMissile(context, sprites.missile, flyingMissile);
  drawZoomOutlines(context);
}

function drawDimming(context: CanvasRenderingContext2D): void {
  context.save();
  context.fillStyle = DIM_COLOUR;
  context.fillRect(0, 0, PLAYING_AREA_WIDTH, PLAYING_AREA_HEIGHT);
  context.restore();
}

function drawZoomedPlayingArea(context: CanvasRenderingContext2D, sprites: Sprites, view: MatchView): void {
  context.save();
  context.translate(ZOOMED_PLAYING_AREA.left, ZOOMED_PLAYING_AREA.top);
  context.scale(ZOOM_SCALE, ZOOM_SCALE);
  drawPlanets(context, sprites.planets, view.planets);
  drawShips(context, sprites.ships, view.ships);
  context.restore();
}

function drawZoomedMissile(
  context: CanvasRenderingContext2D,
  missileSprite: HTMLImageElement,
  flyingMissile: Readonly<Missile>,
): void {
  const centre = zoomViewPoint(flyingMissile);
  const size = zoomedMissileSize(missileSprite.width, missileSprite.height);
  const box = centredBox(centre, size.width, size.height);
  context.drawImage(missileSprite, box.left, box.top, box.width, box.height);
}

function drawZoomOutlines(context: CanvasRenderingContext2D): void {
  const zoomViewOutline = strokeOutline(ZOOM_VIEW);
  const playingAreaOutline = strokeOutline(ZOOMED_PLAYING_AREA);
  context.save();
  context.lineWidth = 1;
  context.strokeStyle = ZOOM_VIEW_OUTLINE_COLOUR;
  context.strokeRect(zoomViewOutline.left, zoomViewOutline.top, zoomViewOutline.width, zoomViewOutline.height);
  context.strokeStyle = ZOOMED_PLAYING_AREA_OUTLINE_COLOUR;
  context.strokeRect(
    playingAreaOutline.left,
    playingAreaOutline.top,
    playingAreaOutline.width,
    playingAreaOutline.height,
  );
  context.restore();
}

function drawPowerPenalty(context: CanvasRenderingContext2D, penalty: number): void {
  const text = powerPenaltyText(penalty);
  context.save();
  context.fillStyle = "#fff";
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText(text, POWER_PENALTY_CENTRE_X, HUD_TOP);
  context.restore();
}

function drawTimeoutInfo(context: CanvasRenderingContext2D, flightStepsLeft: number, timedOut: boolean): void {
  const text = timeoutText(flightStepsLeft, timedOut);
  context.save();
  context.fillStyle = "#fff";
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.fillText(text, TIMEOUT_INFO_CENTRE_X, TIMEOUT_INFO_BOTTOM);
  context.restore();
}

function drawRoundBanner(context: CanvasRenderingContext2D, round: number, stepsIntoRound: number): void {
  const banner = roundBanner(round, stepsIntoRound);
  if (banner === null) {
    return;
  }
  context.save();
  context.globalAlpha = banner.alpha;
  context.fillStyle = "#fff";
  context.font = `${banner.fontSize}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(banner.text, BANNER_CENTRE_X, BANNER_CENTRE_Y);
  context.restore();
}

function drawScores(context: CanvasRenderingContext2D, matchScores: MatchView["scores"]): void {
  const texts = scoreTexts(matchScores);
  context.save();
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textBaseline = "top";
  context.fillStyle = SHIP_COLOURS.left;
  context.textAlign = "left";
  context.fillText(texts.left, LEFT_SCORE_LEFT, HUD_TOP);
  context.fillStyle = SHIP_COLOURS.right;
  context.textAlign = "right";
  context.fillText(texts.right, RIGHT_SCORE_RIGHT, HUD_TOP);
  context.restore();
}

function drawRoundOver(
  context: CanvasRenderingContext2D,
  sprites: Sprites,
  roundShips: MatchView["ships"],
  roundOver: RoundOverView,
): void {
  const result = roundOver.result;
  drawShips(context, sprites.ships, roundShips, result.hitShip);
  drawExplosion(context, sprites.explosion, roundShips[result.hitShip], roundOver.stepsSinceRoundOver);
  drawRoundOverMessage(context, result);
}

function drawExplosion(
  context: CanvasRenderingContext2D,
  explosionSprite: HTMLImageElement,
  ship: Readonly<Ship>,
  stepsSinceHit: number,
): void {
  const size = explosionSize(stepsSinceHit);
  if (size === null) {
    return;
  }
  const box = centredBox(ship, size, size);
  context.drawImage(explosionSprite, box.left, box.top, box.width, box.height);
}

function drawRoundOverMessage(context: CanvasRenderingContext2D, result: Readonly<RoundResult>): void {
  const box = roundOverMessageBox(result.outcome);
  const outline = strokeOutline(box);
  const tops = roundOverTextTops(result.outcome);
  const title = roundOverTitle(result);
  const scoreChange = scoreChangeText(result.scoreChange);
  const rows = scoreBreakdownRows(result);
  context.save();
  context.fillStyle = MESSAGE_DIM_COLOUR;
  context.fillRect(box.left, box.top, box.width, box.height);
  context.strokeStyle = MESSAGE_OUTLINE_COLOUR;
  context.lineWidth = 1;
  context.strokeRect(outline.left, outline.top, outline.width, outline.height);
  context.translate(box.left, box.top);
  context.fillStyle = "#fff";
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textBaseline = "top";
  context.textAlign = "center";
  context.fillText(title, MESSAGE_TEXT_CENTRE_X, tops.title);
  context.fillText(scoreChange, MESSAGE_TEXT_CENTRE_X, tops.scoreChange);
  context.fillText(MESSAGE_PROMPT_TEXT, MESSAGE_TEXT_CENTRE_X, tops.prompt);
  for (const row of rows) {
    context.textAlign = "left";
    context.fillText(row.label, MESSAGE_LABEL_LEFT, row.top);
    context.textAlign = "right";
    context.fillText(row.value, MESSAGE_VALUE_RIGHT, row.top);
  }
  context.restore();
}
