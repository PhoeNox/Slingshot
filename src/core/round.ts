import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./playingArea";
import { randomInt, type Rng } from "./random";

export type Side = "left" | "right";

export interface Aim {
  angle: number;
  power: number;
}

export interface Ship {
  x: number;
  y: number;
  aim: Aim;
}

export interface Planet {
  sprite: number;
  mass: number;
  radius: number;
  x: number;
  y: number;
}

export interface RoundLayout {
  ships: Record<Side, Ship>;
  planets: Planet[];
}

const MIN_PLANETS = 2;
const MAX_PLANETS = 4;
const PLANET_SPRITE_COUNT = 8;
const MIN_PLANET_MASS = 8;
const MAX_PLANET_MASS = 512;
const RADIUS_PER_CUBE_ROOT_OF_MASS = 12.5;
const RADIUS_STEPS_PER_PIXEL = 1024;
const PLANET_SHIP_CLEARANCE = 75;
const PLANET_EDGE_CLEARANCE = 50;
const PLANET_SEPARATION_PER_RADIUS = 1.5;
const PLANET_SEPARATION_PER_MASS = 0.1;

const SHIP_BOX_WIDTH = 40;
const SHIP_EDGE_MARGIN = 20;
const MIN_SHIP_Y = 100;
const MAX_SHIP_Y = 500;
const DEFAULT_POWER = 100;
const LEFT_DEFAULT_ANGLE = 90;
const RIGHT_DEFAULT_ANGLE = 270;

export const BARREL_DISTANCE: Record<Side, number> = { left: 22, right: 23 };

export function createRoundLayout(rng: Rng): RoundLayout {
  const ships = placeShips(rng);
  const planets = generatePlanets(rng);
  return { ships, planets };
}

function placeShips(rng: Rng): Record<Side, Ship> {
  const leftY = randomInt(rng, MIN_SHIP_Y, MAX_SHIP_Y);
  const rightY = randomInt(rng, MIN_SHIP_Y, MAX_SHIP_Y);
  return {
    left: {
      x: SHIP_EDGE_MARGIN + SHIP_BOX_WIDTH / 2,
      y: leftY,
      aim: { angle: LEFT_DEFAULT_ANGLE, power: DEFAULT_POWER },
    },
    right: {
      x: PLAYING_AREA_WIDTH - SHIP_EDGE_MARGIN - SHIP_BOX_WIDTH / 2,
      y: rightY,
      aim: { angle: RIGHT_DEFAULT_ANGLE, power: DEFAULT_POWER },
    },
  };
}

function generatePlanets(rng: Rng): Planet[] {
  const count = randomInt(rng, MIN_PLANETS, MAX_PLANETS);
  const planets: Planet[] = [];
  for (let i = 0; i < count; i++) {
    const planet = placePlanet(rng, planets);
    planets.push(planet);
  }
  return planets;
}

function placePlanet(rng: Rng, placed: Planet[]): Planet {
  const sprite = drawDistinctSprite(rng, placed);
  let candidate: Planet;
  do {
    candidate = drawPlanetCandidate(rng, sprite);
  } while (!isClearOfPlanets(candidate, placed));
  return candidate;
}

function drawDistinctSprite(rng: Rng, placed: Planet[]): number {
  let sprite: number;
  do {
    sprite = randomInt(rng, 1, PLANET_SPRITE_COUNT);
  } while (placed.some((planet) => planet.sprite === sprite));
  return sprite;
}

function drawPlanetCandidate(rng: Rng, sprite: number): Planet {
  const mass = randomInt(rng, MIN_PLANET_MASS, MAX_PLANET_MASS);
  const exactRadius = Math.cbrt(mass) * RADIUS_PER_CUBE_ROOT_OF_MASS;
  const radius = Math.round(exactRadius * RADIUS_STEPS_PER_PIXEL) / RADIUS_STEPS_PER_PIXEL;
  const margin = Math.round(radius);
  const x = randomInt(rng, PLANET_SHIP_CLEARANCE + margin, PLAYING_AREA_WIDTH - PLANET_SHIP_CLEARANCE - margin);
  const y = randomInt(rng, PLANET_EDGE_CLEARANCE + margin, PLAYING_AREA_HEIGHT - PLANET_EDGE_CLEARANCE - margin);
  return { sprite, mass, radius, x, y };
}

function isClearOfPlanets(candidate: Planet, placed: Planet[]): boolean {
  return placed.every((planet) => {
    const dx = candidate.x - planet.x;
    const dy = candidate.y - planet.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const requiredDistance =
      (candidate.radius + planet.radius) * PLANET_SEPARATION_PER_RADIUS
      + (candidate.mass + planet.mass) * PLANET_SEPARATION_PER_MASS;
    return distance >= requiredDistance;
  });
}
