// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  PLAYING_AREA_HEIGHT,
  PLAYING_AREA_WIDTH,
  TRACKING_AREA_BOTTOM,
  TRACKING_AREA_LEFT,
  TRACKING_AREA_RIGHT,
  TRACKING_AREA_TOP,
} from "./playingArea";
import type { Aim, Planet, Ship, Side } from "./round";

export const STEPS_PER_SECOND = 30;

export interface Point {
  x: number;
  y: number;
}

export interface Body extends Point {
  vx: number;
  vy: number;
}

export type ShotRecord = Body;

export interface Missile extends ShotRecord {
  stepsFlown: number;
  flightStepsLeft: number | undefined;
  bounces: boolean;
}

export interface Segment {
  from: Point;
  to: Point;
}

export interface FlightStep {
  segment: Segment;
  shotEnded: boolean;
  hitPlanet: boolean;
  hitShip: Side | undefined;
}

const GRAVITY = 120;
const LAUNCH_SPEED_PER_POWER = 0.1;
const RADIANS_PER_DEGREE = Math.PI / 180;
const SHIP_HIT_RADIUS = 14;
const SHIP_HIT_SAMPLES = 10;
const SHIP_HIT_SAMPLE_SPACING = 0.1;

export function shotRecordFor(ship: Readonly<Ship>, barrelDistance: number): ShotRecord {
  const direction = directionOf(ship.aim);
  const barrelTip = offsetAlong(ship, direction, barrelDistance);
  const speed = LAUNCH_SPEED_PER_POWER * ship.aim.power;
  return {
    ...barrelTip,
    vx: speed * direction.x,
    vy: speed * direction.y,
  };
}

export function aimLineFor(ship: Readonly<Ship>, barrelDistance: number): Segment {
  const direction = directionOf(ship.aim);
  const from = offsetAlong(ship, direction, barrelDistance);
  const to = offsetAlong(from, direction, ship.aim.power);
  return { from, to };
}

function directionOf(aim: Readonly<Aim>): Point {
  const radians = aim.angle * RADIANS_PER_DEGREE;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
}

function offsetAlong(origin: Readonly<Point>, direction: Readonly<Point>, distance: number): Point {
  return {
    x: origin.x + distance * direction.x,
    y: origin.y + distance * direction.y,
  };
}

export function launchMissile(shot: ShotRecord, timeoutSteps: number | undefined, bounces: boolean): Missile {
  return { ...shot, stepsFlown: 0, flightStepsLeft: timeoutSteps, bounces };
}

export function flyMissile(
  missile: Missile,
  planets: readonly Readonly<Planet>[],
  ships: Readonly<Record<Side, Readonly<Ship>>>,
): FlightStep {
  const from = { x: missile.x, y: missile.y };
  advanceMissile(missile, planets);
  const leftTrackingArea = !missile.bounces && !isInsideTrackingArea(missile);
  const hitPlanet = !leftTrackingArea && stopAtPlanetSurface(missile, from, planets);
  const hitShip = leftTrackingArea ? undefined : stopAtShip(missile, from, ships);
  const hitSomething = hitPlanet || hitShip !== undefined;
  if (missile.bounces && !hitSomething) {
    reflectOffEdges(missile, from);
  }
  const shotEnded = leftTrackingArea
    || hitSomething
    || isEndedByTimeout(missile);
  const to = { x: missile.x, y: missile.y };
  return { segment: { from, to }, shotEnded, hitPlanet, hitShip };
}

function advanceMissile(missile: Missile, planets: readonly Readonly<Planet>[]): void {
  missile.stepsFlown++;
  if (missile.flightStepsLeft !== undefined) {
    missile.flightStepsLeft--;
  }
  applyGravity(missile, planets);
  missile.x += missile.vx;
  missile.y += missile.vy;
}

export function applyGravity(body: Body, planets: readonly Readonly<Planet>[]): void {
  for (const planet of planets) {
    const dx = body.x - planet.x;
    const dy = body.y - planet.y;
    const distanceSquared = dx * dx + dy * dy;
    const distanceCubed = distanceSquared * Math.sqrt(distanceSquared);
    body.vx -= (GRAVITY * planet.mass * dx) / distanceCubed;
    body.vy -= (GRAVITY * planet.mass * dy) / distanceCubed;
  }
}

export function isInsideTrackingArea(point: Readonly<Point>): boolean {
  return point.x >= TRACKING_AREA_LEFT
    && point.x < TRACKING_AREA_RIGHT
    && point.y >= TRACKING_AREA_TOP
    && point.y < TRACKING_AREA_BOTTOM;
}

export function isInsidePlayingArea(point: Readonly<Point>): boolean {
  return point.x >= 0
    && point.x < PLAYING_AREA_WIDTH
    && point.y >= 0
    && point.y < PLAYING_AREA_HEIGHT;
}

export function hasTimedOut(missile: Readonly<Missile>): boolean {
  return missile.flightStepsLeft !== undefined && missile.flightStepsLeft < 0;
}

function isEndedByTimeout(missile: Readonly<Missile>): boolean {
  return hasTimedOut(missile) && (missile.bounces || !isInsidePlayingArea(missile));
}

export function reflectOffEdges(body: Body, from: Readonly<Point>): void {
  const crossingX = edgeCrossingFraction(from.x, body.x, PLAYING_AREA_WIDTH);
  const crossingY = edgeCrossingFraction(from.y, body.y, PLAYING_AREA_HEIGHT);
  const crossing = Math.min(crossingX, crossingY);
  if (crossing === Infinity) {
    return;
  }
  body.x = from.x + crossing * (body.x - from.x);
  body.y = from.y + crossing * (body.y - from.y);
  if (crossingX === crossing) {
    body.vx = -body.vx;
  }
  if (crossingY === crossing) {
    body.vy = -body.vy;
  }
}

function edgeCrossingFraction(from: number, to: number, extent: number): number {
  if (to < 0) {
    return from / (from - to);
  }
  if (to > extent) {
    return (extent - from) / (to - from);
  }
  return Infinity;
}

function stopAtPlanetSurface(missile: Missile, from: Readonly<Point>, planets: readonly Readonly<Planet>[]): boolean {
  const entry = planetEntryPoint(from, missile, planets);
  if (entry === undefined) {
    return false;
  }
  missile.x = entry.x;
  missile.y = entry.y;
  return true;
}

export function planetEntryPoint(
  from: Readonly<Point>,
  to: Readonly<Point>,
  planets: readonly Readonly<Planet>[],
): Point | undefined {
  for (const planet of planets) {
    const toX = to.x - planet.x;
    const toY = to.y - planet.y;
    const radiusSquared = planet.radius * planet.radius;
    if (toX * toX + toY * toY > radiusSquared) {
      continue;
    }
    const fromX = from.x - planet.x;
    const fromY = from.y - planet.y;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const a = dx * dx + dy * dy;
    const b = 2 * (fromX * dx + fromY * dy);
    const c = fromX * fromX + fromY * fromY - radiusSquared;
    const entryFraction = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    return { x: from.x + entryFraction * dx, y: from.y + entryFraction * dy };
  }
  return undefined;
}

function stopAtShip(
  missile: Missile,
  from: Readonly<Point>,
  ships: Readonly<Record<Side, Readonly<Ship>>>,
): Side | undefined {
  const radiusSquared = SHIP_HIT_RADIUS * SHIP_HIT_RADIUS;
  for (let i = 0; i < SHIP_HIT_SAMPLES; i++) {
    const sampleX = from.x + i * SHIP_HIT_SAMPLE_SPACING * missile.vx;
    const sampleY = from.y + i * SHIP_HIT_SAMPLE_SPACING * missile.vy;
    for (const side of ["left", "right"] as const) {
      const dx = sampleX - ships[side].x;
      const dy = sampleY - ships[side].y;
      if (dx * dx + dy * dy <= radiusSquared) {
        missile.x = sampleX;
        missile.y = sampleY;
        return side;
      }
    }
  }
  return undefined;
}
