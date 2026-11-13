// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Point, Segment } from "./core/flight";
import type { RoundOutcome, RoundResult } from "./core/match";
import {
  PLAYING_AREA_HEIGHT,
  PLAYING_AREA_WIDTH,
  TRACKING_AREA_BOTTOM,
  TRACKING_AREA_LEFT,
  TRACKING_AREA_RIGHT,
  TRACKING_AREA_TOP,
} from "./core/playingArea";
import type { Aim, Planet, Side } from "./core/round";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ShipPose {
  rotation: number;
  frameLeft: number;
  nextFrameLeft: number;
  nextFrameWeight: number;
}

export interface RoundBanner {
  text: string;
  fontSize: number;
  alpha: number;
}

export interface BreakdownRow {
  label: string;
  value: string;
  top: number;
}

export interface FadingSegment {
  segment: Readonly<Segment>;
  alpha: number;
}

export interface Bloom {
  radius: number;
  alpha: number;
}

export interface RoundOverTextTops {
  title: number;
  scoreChange: number;
  prompt: number;
}

export const SHIP_FRAME_WIDTH = 40;
export const SHIP_FRAME_HEIGHT = 33;
export const SHIP_FRAME_OFFSET_LEFT = -SHIP_FRAME_WIDTH / 2;
export const SHIP_FRAME_OFFSET_TOP = -Math.floor(SHIP_FRAME_HEIGHT / 2);
const SHIP_FRAME_COUNT = 8;
const SHIP_FRAME_ANGLE = 360 / SHIP_FRAME_COUNT;
const SHIP_SHEET_FACING_ANGLE: Record<Side, number> = { left: 90, right: 270 };

const PLANET_SPRITE_FILL = 0.96;
const GRAVITY_WELL_CONTOUR_COUNT = 3;
const GRAVITY_WELL_CONTOUR_SPACING_PER_SQRT_MASS = 1.5;

const PLAYER_NAMES: Record<Side, string> = { left: "Player 1", right: "Player 2" };

const AFTERGLOW_STEPS = 45;

const LATEST_TRAIL_ALPHA = 0.6;
const OLDEST_TRAIL_ALPHA = 0.15;
const TRAIL_FADE_PER_SHOT = 0.75;

const EXPLOSION_STEPS = 6;
const EXPLOSION_SIZE_FACTOR = 100 / 9;
const BLOOM_STEPS = 8;
const BLOOM_START_RADIUS = 60;
const BLOOM_GROWTH_PER_STEP = 15;

const BANNER_START_INTENSITY = 100;
const BANNER_END_INTENSITY = 30;
const BANNER_DECAY_PER_STEP = 1.04;
const BANNER_FONT_SIZE = 100;
const BANNER_GROWTH_DIVISOR = 25;

const MESSAGE_WIDTH = 450;
const MESSAGE_BASE_HEIGHT = 190;
const MESSAGE_HIT_EXTRA_HEIGHT = 40;
const MESSAGE_CENTRE_X = 399;
const MESSAGE_CENTRE_Y = 299;
const MESSAGE_TITLE_TOP = 28;
const MESSAGE_FIRST_ROW_TOP = 65;
const MESSAGE_ROW_HEIGHT = 20;
const MESSAGE_SCORE_CHANGE_TOP = 100;
const MESSAGE_PROMPT_TOP = 140;

export const ZOOM_SCALE = 0.25;
const ZOOM_MISSILE_SCALE = 1 / 3;
const ZOOM_VIEW_WIDTH = (TRACKING_AREA_RIGHT - TRACKING_AREA_LEFT) * ZOOM_SCALE;
const ZOOM_VIEW_HEIGHT = (TRACKING_AREA_BOTTOM - TRACKING_AREA_TOP) * ZOOM_SCALE;
const ZOOM_VIEW_LEFT = (PLAYING_AREA_WIDTH - ZOOM_VIEW_WIDTH) / 2;
const ZOOM_VIEW_TOP = (PLAYING_AREA_HEIGHT - ZOOM_VIEW_HEIGHT) / 2;

export const ZOOM_VIEW: Readonly<Rect> = {
  left: ZOOM_VIEW_LEFT,
  top: ZOOM_VIEW_TOP,
  width: ZOOM_VIEW_WIDTH,
  height: ZOOM_VIEW_HEIGHT,
};

export const ZOOMED_PLAYING_AREA: Readonly<Rect> = {
  left: ZOOM_VIEW_LEFT - TRACKING_AREA_LEFT * ZOOM_SCALE,
  top: ZOOM_VIEW_TOP - TRACKING_AREA_TOP * ZOOM_SCALE,
  width: PLAYING_AREA_WIDTH * ZOOM_SCALE,
  height: PLAYING_AREA_HEIGHT * ZOOM_SCALE,
};

export const MESSAGE_TEXT_CENTRE_X = 224;
export const MESSAGE_LABEL_LEFT = 50;
export const MESSAGE_VALUE_RIGHT = 399;
export const MESSAGE_PROMPT_TEXT = "Press Space or Enter for the next round";

export function shipPose(aimAngle: number, side: Side): ShipPose {
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

export function gravityWellContourRadii(planet: Readonly<Planet>): number[] {
  const spacing = Math.sqrt(planet.mass) * GRAVITY_WELL_CONTOUR_SPACING_PER_SQRT_MASS;
  return Array.from({ length: GRAVITY_WELL_CONTOUR_COUNT }, (_, index) => planet.radius + (index + 1) * spacing);
}

export function planetBox(planet: Readonly<Planet>): Rect {
  const size = Math.round((2 * planet.radius) / PLANET_SPRITE_FILL);
  return {
    left: planet.x - Math.floor(size / 2),
    top: planet.y - Math.floor(size / 2),
    width: size,
    height: size,
  };
}

export function centredBox(centre: Readonly<Point>, width: number, height: number): Rect {
  return { left: centre.x - width / 2, top: centre.y - height / 2, width, height };
}

export function strokeOutline(rect: Readonly<Rect>): Rect {
  return { left: rect.left + 0.5, top: rect.top + 0.5, width: rect.width - 1, height: rect.height - 1 };
}

export function insetRect(rect: Readonly<Rect>, inset: number): Rect {
  return {
    left: rect.left + inset,
    top: rect.top + inset,
    width: rect.width - 2 * inset,
    height: rect.height - 2 * inset,
  };
}

export function cornerBrackets(rect: Readonly<Rect>, length: number): Segment[] {
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

export function gridLines(rect: Readonly<Rect>, spacing: number): Segment[] {
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

export function afterglowSegments(trail: readonly Readonly<Segment>[], stepsFlown: number): FadingSegment[] {
  const count = Math.min(stepsFlown, AFTERGLOW_STEPS);
  const recent = trail.slice(trail.length - count);
  return recent.map((segment, index) => ({
    segment,
    alpha: (AFTERGLOW_STEPS - count + index + 1) / AFTERGLOW_STEPS,
  }));
}

export function trailAlpha(shotsSince: number): number {
  return Math.max(LATEST_TRAIL_ALPHA * TRAIL_FADE_PER_SHOT ** shotsSince, OLDEST_TRAIL_ALPHA);
}

export function explosionSize(stepsSinceHit: number): number | null {
  const explosionStep = stepsSinceHit + 1;
  if (explosionStep >= EXPLOSION_STEPS) {
    return null;
  }
  return Math.floor(explosionStep * (EXPLOSION_STEPS - explosionStep) * EXPLOSION_SIZE_FACTOR);
}

export function explosionBloom(stepsSinceHit: number): Bloom | null {
  if (stepsSinceHit >= BLOOM_STEPS) {
    return null;
  }
  return {
    radius: BLOOM_START_RADIUS + stepsSinceHit * BLOOM_GROWTH_PER_STEP,
    alpha: 1 - stepsSinceHit / BLOOM_STEPS,
  };
}

export function roundBanner(round: number, stepsIntoRound: number): RoundBanner | null {
  const intensity = BANNER_START_INTENSITY / BANNER_DECAY_PER_STEP ** stepsIntoRound;
  if (intensity <= BANNER_END_INTENSITY) {
    return null;
  }
  return {
    text: `Round ${round}`,
    fontSize: (BANNER_FONT_SIZE * (BANNER_START_INTENSITY - intensity)) / BANNER_GROWTH_DIVISOR,
    alpha: (2 * intensity - 60) / 255,
  };
}

export function zoomViewPoint(point: Readonly<Point>): Point {
  return {
    x: ZOOMED_PLAYING_AREA.left + point.x * ZOOM_SCALE,
    y: ZOOMED_PLAYING_AREA.top + point.y * ZOOM_SCALE,
  };
}

export function zoomViewSegment(segment: Readonly<Segment>): Segment {
  const from = zoomViewPoint(segment.from);
  const to = zoomViewPoint(segment.to);
  return { from, to };
}

export function zoomedMissileSize(spriteWidth: number, spriteHeight: number): { width: number; height: number } {
  return { width: spriteWidth * ZOOM_MISSILE_SCALE, height: spriteHeight * ZOOM_MISSILE_SCALE };
}

export function angleInfoText(aim: Readonly<Aim>): string {
  return `Angle: ${aim.angle.toFixed(2)}`;
}

export function powerInfoText(aim: Readonly<Aim>): string {
  return `Power: ${aim.power.toFixed(1)}`;
}

export function powerPenaltyText(penalty: number): string {
  return `Power penalty: ${Math.trunc(penalty)}`;
}

export function timeoutText(flightStepsLeft: number, timedOut: boolean): string {
  return timedOut ? "Shot timed out..." : `Timeout in ${flightStepsLeft}`;
}

export function scoreTexts(scores: Readonly<Record<Side, number>>): Record<Side, string> {
  return {
    left: `${PLAYER_NAMES.left}  --  ${scores.left}`,
    right: `${scores.right}  --  ${PLAYER_NAMES.right}`,
  };
}

export function roundOverMessageBox(outcome: RoundOutcome): Rect {
  const height = MESSAGE_BASE_HEIGHT + (outcome === "hit" ? MESSAGE_HIT_EXTRA_HEIGHT : 0);
  return {
    left: MESSAGE_CENTRE_X - MESSAGE_WIDTH / 2,
    top: MESSAGE_CENTRE_Y - Math.floor(height / 2),
    width: MESSAGE_WIDTH,
    height,
  };
}

export function roundOverTextTops(outcome: RoundOutcome): RoundOverTextTops {
  const rowsOffset = outcome === "hit" ? MESSAGE_HIT_EXTRA_HEIGHT : 0;
  return {
    title: MESSAGE_TITLE_TOP,
    scoreChange: MESSAGE_SCORE_CHANGE_TOP + rowsOffset,
    prompt: MESSAGE_PROMPT_TOP + rowsOffset,
  };
}

export function roundOverTitle(result: Readonly<RoundResult>): string {
  const shooterName = PLAYER_NAMES[result.shooter];
  return result.outcome === "hit"
    ? `${shooterName} hit ${PLAYER_NAMES[result.hitShip].toLowerCase()}`
    : `${shooterName} hit their own ship`;
}

export function scoreBreakdownRows(result: Readonly<RoundResult>): BreakdownRow[] {
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

export function scoreChangeText(scoreChange: number): string {
  return scoreChange >= 0 ? `${scoreChange} added to score` : `${-scoreChange} deducted from score`;
}
