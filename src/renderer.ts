// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { FONT_FAMILY } from "./assets";
import {
  activePlayer,
  BARREL_DISTANCE,
  isTimedOut,
  isZoomViewShown,
  phase,
  planets,
  powerPenalty,
  roundNumber,
  roundStepCount,
  scores,
  ships,
  timeoutCountdown,
  trails,
  type Aim,
  type InFlightPhase,
  type Match,
  type Missile,
  type Planet,
  type RoundOverPhase,
  type RoundResult,
  type Ship,
  type Side,
  type TrailSegment,
} from "./core/match";
import {
  PLAYING_AREA_HEIGHT,
  PLAYING_AREA_WIDTH,
  TRACKING_AREA_BOTTOM,
  TRACKING_AREA_LEFT,
  TRACKING_AREA_RIGHT,
  TRACKING_AREA_TOP,
} from "./core/playingArea";

export interface Sprites {
  backdrop: HTMLImageElement;
  planets: HTMLImageElement[];
  ships: Record<Side, HTMLImageElement>;
  missile: HTMLImageElement;
  explosion: HTMLImageElement;
}

const PLANET_SPRITE_FILL = 0.96;
const SHIP_FRAME_WIDTH = 40;
const SHIP_FRAME_HEIGHT = 33;
const SHIP_FRAME_COUNT = 8;
const SHIP_FRAME_ANGLE = 360 / SHIP_FRAME_COUNT;
const SHIP_SHEET_FACING_ANGLE: Record<Side, number> = { left: 90, right: 270 };
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
const PLAYER_NAMES: Record<Side, string> = { left: "Player 1", right: "Player 2" };

const EXPLOSION_STEPS = 6;
const EXPLOSION_SIZE_FACTOR = 100 / 9;

const MESSAGE_WIDTH = 450;
const MESSAGE_BASE_HEIGHT = 190;
const MESSAGE_HIT_EXTRA_HEIGHT = 40;
const MESSAGE_CENTRE_X = 399;
const MESSAGE_CENTRE_Y = 299;
const MESSAGE_TEXT_CENTRE_X = 224;
const MESSAGE_LABEL_LEFT = 50;
const MESSAGE_VALUE_RIGHT = 399;
const MESSAGE_TITLE_TOP = 28;
const MESSAGE_FIRST_ROW_TOP = 65;
const MESSAGE_ROW_HEIGHT = 20;
const MESSAGE_SCORE_CHANGE_TOP = 100;
const MESSAGE_PROMPT_TOP = 140;
const MESSAGE_DIM_COLOUR = "rgba(0, 0, 0, 0.69)";
const MESSAGE_OUTLINE_COLOUR = "rgb(150, 150, 150)";

const DIM_COLOUR = "rgba(0, 0, 0, 0.69)";
const ZOOM_SCALE = 0.25;
const ZOOM_MISSILE_SCALE = 1 / 3;
const ZOOM_VIEW_WIDTH = (TRACKING_AREA_RIGHT - TRACKING_AREA_LEFT) * ZOOM_SCALE;
const ZOOM_VIEW_HEIGHT = (TRACKING_AREA_BOTTOM - TRACKING_AREA_TOP) * ZOOM_SCALE;
const ZOOM_VIEW_LEFT = (PLAYING_AREA_WIDTH - ZOOM_VIEW_WIDTH) / 2;
const ZOOM_VIEW_TOP = (PLAYING_AREA_HEIGHT - ZOOM_VIEW_HEIGHT) / 2;
const ZOOMED_PLAYING_AREA_LEFT = -TRACKING_AREA_LEFT * ZOOM_SCALE;
const ZOOMED_PLAYING_AREA_TOP = -TRACKING_AREA_TOP * ZOOM_SCALE;
const ZOOMED_PLAYING_AREA_WIDTH = PLAYING_AREA_WIDTH * ZOOM_SCALE;
const ZOOMED_PLAYING_AREA_HEIGHT = PLAYING_AREA_HEIGHT * ZOOM_SCALE;
const ZOOM_VIEW_OUTLINE_COLOUR = "#fff";
const ZOOMED_PLAYING_AREA_OUTLINE_COLOUR = "rgb(150, 150, 150)";

interface ShipPose {
  rotation: number;
  frame: number;
  nextFrame: number;
  nextFrameWeight: number;
}

const BANNER_START_INTENSITY = 100;
const BANNER_END_INTENSITY = 30;
const BANNER_DECAY_PER_STEP = 1.04;
const BANNER_FONT_SIZE = 100;
const BANNER_GROWTH_DIVISOR = 25;
const BANNER_CENTRE_X = 399;
const BANNER_CENTRE_Y = 299;

export function drawFrame(context: CanvasRenderingContext2D, sprites: Sprites, match: Match): void {
  drawBackdrop(context, sprites.backdrop);
  drawPlanets(context, sprites.planets, planets(match));
  drawTrails(context, trails(match));
  const matchPhase = phase(match);
  if (matchPhase.kind === "aiming") {
    drawShips(context, sprites.ships, ships(match));
    drawAiming(context, ships(match), activePlayer(match));
  } else if (matchPhase.kind === "inFlight") {
    drawShips(context, sprites.ships, ships(match));
    drawFlight(context, sprites, match, matchPhase);
  } else {
    drawRoundOver(context, sprites, ships(match), matchPhase);
  }
  drawScores(context, scores(match));
  drawRoundBanner(context, roundNumber(match), roundStepCount(match));
}

function drawBackdrop(context: CanvasRenderingContext2D, backdrop: HTMLImageElement): void {
  context.drawImage(backdrop, 0, 0, PLAYING_AREA_WIDTH, PLAYING_AREA_HEIGHT);
}

function drawPlanets(
  context: CanvasRenderingContext2D,
  planetSprites: HTMLImageElement[],
  roundPlanets: readonly Readonly<Planet>[],
): void {
  for (const planet of roundPlanets) {
    const size = Math.round((2 * planet.radius) / PLANET_SPRITE_FILL);
    const left = planet.x - Math.floor(size / 2);
    const top = planet.y - Math.floor(size / 2);
    context.drawImage(planetSprites[planet.sprite - 1], left, top, size, size);
  }
}

function drawTrails(context: CanvasRenderingContext2D, roundTrails: readonly Readonly<TrailSegment>[]): void {
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
  roundShips: Readonly<Record<Side, Readonly<Ship>>>,
  destroyedShip?: Side,
): void {
  for (const side of ["left", "right"] as const) {
    if (side === destroyedShip) {
      continue;
    }
    const ship = roundShips[side];
    const pose = shipPose(ship.aim.angle, SHIP_SHEET_FACING_ANGLE[side]);
    drawShip(context, shipSheets[side], ship, pose);
  }
}

function shipPose(aimAngle: number, sheetFacingAngle: number): ShipPose {
  const rotation = (aimAngle - sheetFacingAngle + 360) % 360;
  const frame = Math.floor(rotation / SHIP_FRAME_ANGLE);
  return {
    rotation,
    frame,
    nextFrame: (frame + 1) % SHIP_FRAME_COUNT,
    nextFrameWeight: (rotation - frame * SHIP_FRAME_ANGLE) / SHIP_FRAME_ANGLE,
  };
}

function drawShip(
  context: CanvasRenderingContext2D,
  shipSheet: HTMLImageElement,
  ship: Readonly<Ship>,
  pose: ShipPose,
): void {
  context.save();
  context.translate(ship.x, ship.y);
  context.rotate((pose.rotation * Math.PI) / 180);
  drawShipFrame(context, shipSheet, pose.frame);
  context.globalAlpha = pose.nextFrameWeight;
  drawShipFrame(context, shipSheet, pose.nextFrame);
  context.restore();
}

function drawShipFrame(context: CanvasRenderingContext2D, shipSheet: HTMLImageElement, frame: number): void {
  const frameLeft = frame * SHIP_FRAME_WIDTH;
  const left = -SHIP_FRAME_WIDTH / 2;
  const top = -Math.floor(SHIP_FRAME_HEIGHT / 2);
  context.drawImage(
    shipSheet,
    frameLeft,
    0,
    SHIP_FRAME_WIDTH,
    SHIP_FRAME_HEIGHT,
    left,
    top,
    SHIP_FRAME_WIDTH,
    SHIP_FRAME_HEIGHT,
  );
}

function drawAiming(
  context: CanvasRenderingContext2D,
  roundShips: Readonly<Record<Side, Readonly<Ship>>>,
  side: Side,
): void {
  const ship = roundShips[side];
  drawAimLine(context, ship, BARREL_DISTANCE[side], SHIP_COLOURS[side]);
  drawAimInfo(context, ship.aim);
}

function drawAimLine(context: CanvasRenderingContext2D, ship: Readonly<Ship>, barrelDistance: number, colour: string): void {
  const radians = (ship.aim.angle * Math.PI) / 180;
  const directionX = Math.sin(radians);
  const directionY = -Math.cos(radians);
  const barrelX = ship.x + barrelDistance * directionX;
  const barrelY = ship.y + barrelDistance * directionY;
  context.save();
  context.strokeStyle = colour;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(barrelX, barrelY);
  context.lineTo(barrelX + ship.aim.power * directionX, barrelY + ship.aim.power * directionY);
  context.stroke();
  context.restore();
}

function drawAimInfo(context: CanvasRenderingContext2D, aim: Readonly<Aim>): void {
  context.save();
  context.fillStyle = "#fff";
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(`Angle: ${aim.angle.toFixed(2)}`, ANGLE_INFO_LEFT, HUD_TOP);
  context.fillText(`Power: ${aim.power.toFixed(1)}`, POWER_INFO_LEFT, HUD_TOP);
  context.restore();
}

function drawFlight(
  context: CanvasRenderingContext2D,
  sprites: Sprites,
  match: Match,
  flight: Readonly<InFlightPhase>,
): void {
  if (isZoomViewShown(match)) {
    drawZoomView(context, sprites, match, flight.missile);
  } else {
    drawMissile(context, sprites.missile, flight.missile);
  }
  drawPowerPenalty(context, powerPenalty(match));
  drawTimeoutInfo(context, timeoutCountdown(flight), isTimedOut(flight));
}

function drawMissile(context: CanvasRenderingContext2D, missileSprite: HTMLImageElement, flyingMissile: Readonly<Missile>): void {
  const left = flyingMissile.x - missileSprite.width / 2;
  const top = flyingMissile.y - missileSprite.height / 2;
  context.drawImage(missileSprite, left, top);
}

function drawZoomView(
  context: CanvasRenderingContext2D,
  sprites: Sprites,
  match: Match,
  flyingMissile: Readonly<Missile>,
): void {
  drawDimming(context);
  context.save();
  context.translate(ZOOM_VIEW_LEFT, ZOOM_VIEW_TOP);
  context.drawImage(sprites.backdrop, 0, 0, ZOOM_VIEW_WIDTH, ZOOM_VIEW_HEIGHT);
  drawZoomedPlayingArea(context, sprites, match);
  drawZoomedMissile(context, sprites.missile, flyingMissile);
  drawZoomOutlines(context);
  context.restore();
}

function drawDimming(context: CanvasRenderingContext2D): void {
  context.save();
  context.fillStyle = DIM_COLOUR;
  context.fillRect(0, 0, PLAYING_AREA_WIDTH, PLAYING_AREA_HEIGHT);
  context.restore();
}

function drawZoomedPlayingArea(context: CanvasRenderingContext2D, sprites: Sprites, match: Match): void {
  context.save();
  context.translate(ZOOMED_PLAYING_AREA_LEFT, ZOOMED_PLAYING_AREA_TOP);
  context.scale(ZOOM_SCALE, ZOOM_SCALE);
  drawPlanets(context, sprites.planets, planets(match));
  drawShips(context, sprites.ships, ships(match));
  context.restore();
}

function drawZoomedMissile(
  context: CanvasRenderingContext2D,
  missileSprite: HTMLImageElement,
  flyingMissile: Readonly<Missile>,
): void {
  const width = missileSprite.width * ZOOM_MISSILE_SCALE;
  const height = missileSprite.height * ZOOM_MISSILE_SCALE;
  const left = ZOOMED_PLAYING_AREA_LEFT + flyingMissile.x * ZOOM_SCALE - width / 2;
  const top = ZOOMED_PLAYING_AREA_TOP + flyingMissile.y * ZOOM_SCALE - height / 2;
  context.drawImage(missileSprite, left, top, width, height);
}

function drawZoomOutlines(context: CanvasRenderingContext2D): void {
  context.save();
  context.lineWidth = 1;
  context.strokeStyle = ZOOM_VIEW_OUTLINE_COLOUR;
  context.strokeRect(0.5, 0.5, ZOOM_VIEW_WIDTH - 1, ZOOM_VIEW_HEIGHT - 1);
  context.strokeStyle = ZOOMED_PLAYING_AREA_OUTLINE_COLOUR;
  context.strokeRect(
    ZOOMED_PLAYING_AREA_LEFT + 0.5,
    ZOOMED_PLAYING_AREA_TOP + 0.5,
    ZOOMED_PLAYING_AREA_WIDTH - 1,
    ZOOMED_PLAYING_AREA_HEIGHT - 1,
  );
  context.restore();
}

function drawPowerPenalty(context: CanvasRenderingContext2D, penalty: number): void {
  context.save();
  context.fillStyle = "#fff";
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText(`Power penalty: ${Math.trunc(penalty)}`, POWER_PENALTY_CENTRE_X, HUD_TOP);
  context.restore();
}

function drawTimeoutInfo(context: CanvasRenderingContext2D, countdown: number, timedOut: boolean): void {
  const text = timedOut ? "Shot timed out..." : `Timeout in ${countdown}`;
  context.save();
  context.fillStyle = "#fff";
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.fillText(text, TIMEOUT_INFO_CENTRE_X, TIMEOUT_INFO_BOTTOM);
  context.restore();
}

function drawRoundBanner(context: CanvasRenderingContext2D, round: number, stepsIntoRound: number): void {
  const intensity = BANNER_START_INTENSITY / BANNER_DECAY_PER_STEP ** stepsIntoRound;
  if (intensity <= BANNER_END_INTENSITY) {
    return;
  }
  const fontSize = (BANNER_FONT_SIZE * (BANNER_START_INTENSITY - intensity)) / BANNER_GROWTH_DIVISOR;
  context.save();
  context.globalAlpha = (2 * intensity - 60) / 255;
  context.fillStyle = "#fff";
  context.font = `${fontSize}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`Round ${round}`, BANNER_CENTRE_X, BANNER_CENTRE_Y);
  context.restore();
}

function drawScores(context: CanvasRenderingContext2D, matchScores: Readonly<Record<Side, number>>): void {
  context.save();
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textBaseline = "top";
  context.fillStyle = SHIP_COLOURS.left;
  context.textAlign = "left";
  context.fillText(`${PLAYER_NAMES.left}  --  ${matchScores.left}`, LEFT_SCORE_LEFT, HUD_TOP);
  context.fillStyle = SHIP_COLOURS.right;
  context.textAlign = "right";
  context.fillText(`${matchScores.right}  --  ${PLAYER_NAMES.right}`, RIGHT_SCORE_RIGHT, HUD_TOP);
  context.restore();
}

function drawRoundOver(
  context: CanvasRenderingContext2D,
  sprites: Sprites,
  roundShips: Readonly<Record<Side, Readonly<Ship>>>,
  roundOver: Readonly<RoundOverPhase>,
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
  const explosionStep = stepsSinceHit + 1;
  if (explosionStep >= EXPLOSION_STEPS) {
    return;
  }
  const size = Math.floor(explosionStep * (EXPLOSION_STEPS - explosionStep) * EXPLOSION_SIZE_FACTOR);
  context.drawImage(explosionSprite, ship.x - size / 2, ship.y - size / 2, size, size);
}

function drawRoundOverMessage(context: CanvasRenderingContext2D, result: Readonly<RoundResult>): void {
  const isHit = result.outcome === "hit";
  const height = MESSAGE_BASE_HEIGHT + (isHit ? MESSAGE_HIT_EXTRA_HEIGHT : 0);
  const left = MESSAGE_CENTRE_X - MESSAGE_WIDTH / 2;
  const top = MESSAGE_CENTRE_Y - Math.floor(height / 2);
  const textOffset = isHit ? MESSAGE_HIT_EXTRA_HEIGHT : 0;
  context.save();
  context.translate(left, top);
  context.fillStyle = MESSAGE_DIM_COLOUR;
  context.fillRect(0, 0, MESSAGE_WIDTH, height);
  context.strokeStyle = MESSAGE_OUTLINE_COLOUR;
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, MESSAGE_WIDTH - 1, height - 1);
  context.fillStyle = "#fff";
  context.font = `${HUD_FONT_SIZE}px ${FONT_FAMILY}`;
  context.textBaseline = "top";
  context.textAlign = "center";
  context.fillText(roundOverTitle(result), MESSAGE_TEXT_CENTRE_X, MESSAGE_TITLE_TOP);
  context.fillText(scoreChangeText(result.scoreChange), MESSAGE_TEXT_CENTRE_X, MESSAGE_SCORE_CHANGE_TOP + textOffset);
  context.fillText("Press Space or Enter for the next round", MESSAGE_TEXT_CENTRE_X, MESSAGE_PROMPT_TOP + textOffset);
  const rows = scoreBreakdownRows(result);
  rows.forEach(([label, value], index) => {
    const rowTop = MESSAGE_FIRST_ROW_TOP + index * MESSAGE_ROW_HEIGHT;
    context.textAlign = "left";
    context.fillText(label, MESSAGE_LABEL_LEFT, rowTop);
    context.textAlign = "right";
    context.fillText(`${value}`, MESSAGE_VALUE_RIGHT, rowTop);
  });
  context.restore();
}

function roundOverTitle(result: Readonly<RoundResult>): string {
  const shooterName = PLAYER_NAMES[result.shooter];
  return result.outcome === "hit"
    ? `${shooterName} hit ${PLAYER_NAMES[result.hitShip].toLowerCase()}`
    : `${shooterName} hit their own ship`;
}

function scoreBreakdownRows(result: Readonly<RoundResult>): [string, number][] {
  if (result.outcome === "selfHit") {
    return [["Hit self:", result.baseScore]];
  }
  return [
    ["Hit opponent:", result.baseScore],
    ["Quick-hit bonus:", result.quickHitBonus],
    ["Power penalty:", -result.powerPenalty],
  ];
}

function scoreChangeText(scoreChange: number): string {
  return scoreChange >= 0 ? `${scoreChange} added to score` : `${-scoreChange} deducted from score`;
}
