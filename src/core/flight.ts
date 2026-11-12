import {
  PLAYING_AREA_HEIGHT,
  PLAYING_AREA_WIDTH,
  TRACKING_AREA_BOTTOM,
  TRACKING_AREA_LEFT,
  TRACKING_AREA_RIGHT,
  TRACKING_AREA_TOP,
} from "./playingArea";
import type { Planet, Ship } from "./round";

export interface Point {
  x: number;
  y: number;
}

export interface ShotRecord {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Missile extends ShotRecord {
  flightStepsLeft: number;
}

export interface Segment {
  from: Point;
  to: Point;
}

export interface FlightStep {
  segment: Segment;
  shotEnded: boolean;
}

const GRAVITY = 120;
const LAUNCH_SPEED_PER_POWER = 0.1;
const RADIANS_PER_DEGREE = Math.PI / 180;
const FLIGHT_TIMEOUT_STEPS = 750;

export function shotRecordFor(ship: Readonly<Ship>, barrelDistance: number): ShotRecord {
  const radians = ship.aim.angle * RADIANS_PER_DEGREE;
  const directionX = Math.sin(radians);
  const directionY = -Math.cos(radians);
  const speed = LAUNCH_SPEED_PER_POWER * ship.aim.power;
  return {
    x: ship.x + barrelDistance * directionX,
    y: ship.y + barrelDistance * directionY,
    vx: speed * directionX,
    vy: speed * directionY,
  };
}

export function launchMissile(shot: ShotRecord): Missile {
  return { ...shot, flightStepsLeft: FLIGHT_TIMEOUT_STEPS };
}

export function flyMissile(missile: Missile, planets: readonly Readonly<Planet>[]): FlightStep {
  const from = { x: missile.x, y: missile.y };
  advanceMissile(missile, planets);
  const shotEnded = !isInsideTrackingArea(missile)
    || stopAtPlanetSurface(missile, from, planets)
    || isLostAfterTimeout(missile);
  const to = { x: missile.x, y: missile.y };
  return { segment: { from, to }, shotEnded };
}

function advanceMissile(missile: Missile, planets: readonly Readonly<Planet>[]): void {
  missile.flightStepsLeft--;
  for (const planet of planets) {
    const dx = missile.x - planet.x;
    const dy = missile.y - planet.y;
    const distanceSquared = dx * dx + dy * dy;
    const distanceCubed = distanceSquared * Math.sqrt(distanceSquared);
    missile.vx -= (GRAVITY * planet.mass * dx) / distanceCubed;
    missile.vy -= (GRAVITY * planet.mass * dy) / distanceCubed;
  }
  missile.x += missile.vx;
  missile.y += missile.vy;
}

function isInsideTrackingArea(point: Readonly<Point>): boolean {
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
  return missile.flightStepsLeft < 0;
}

function isLostAfterTimeout(missile: Readonly<Missile>): boolean {
  return hasTimedOut(missile) && !isInsidePlayingArea(missile);
}

function stopAtPlanetSurface(missile: Missile, from: Readonly<Point>, planets: readonly Readonly<Planet>[]): boolean {
  for (const planet of planets) {
    const toX = missile.x - planet.x;
    const toY = missile.y - planet.y;
    const radiusSquared = planet.radius * planet.radius;
    if (toX * toX + toY * toY > radiusSquared) {
      continue;
    }
    const fromX = from.x - planet.x;
    const fromY = from.y - planet.y;
    const dx = missile.x - from.x;
    const dy = missile.y - from.y;
    const a = dx * dx + dy * dy;
    const b = 2 * (fromX * dx + fromY * dy);
    const c = fromX * fromX + fromY * fromY - radiusSquared;
    const entryFraction = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    missile.x = from.x + entryFraction * dx;
    missile.y = from.y + entryFraction * dy;
    return true;
  }
  return false;
}
