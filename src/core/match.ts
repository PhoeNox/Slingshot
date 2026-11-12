import { flyMissile, isInsidePlayingArea, launchMissile, shotRecordFor, type Missile, type Point } from "./flight";
import { createRng, randomInt, type Rng } from "./random";
import { BARREL_DISTANCE, createRoundLayout, type Planet, type Ship, type Side } from "./round";

export type { Missile, Point } from "./flight";
export type { Aim, Planet, Ship, Side } from "./round";
export { BARREL_DISTANCE } from "./round";

export type Phase = "aiming" | "inFlight";

export interface AimDelta {
  angle: number;
  power: number;
}

export interface TrailSegment {
  shooter: Side;
  from: Point;
  to: Point;
}

const MAX_POWER = 350;
const FULL_TURN = 360;
const POWER_PENALTY_FACTOR = 5;

export interface Match {
  rng: Rng;
  phase: Phase;
  activePlayer: Side;
  roundNumber: number;
  roundStepCount: number;
  scores: Record<Side, number>;
  ships: Record<Side, Ship>;
  planets: Planet[];
  missile: Missile | undefined;
  trails: TrailSegment[];
}

export function createMatch(seed: number): Match {
  const rng = createRng(seed);
  const activePlayer = drawFirstShooter(rng);
  const layout = createRoundLayout(rng);
  return {
    rng,
    phase: "aiming",
    activePlayer,
    roundNumber: 1,
    roundStepCount: 0,
    scores: { left: 0, right: 0 },
    ships: layout.ships,
    planets: layout.planets,
    missile: undefined,
    trails: [],
  };
}

function drawFirstShooter(rng: Rng): Side {
  return randomInt(rng, 0, 1) === 0 ? "left" : "right";
}

export function step(match: Match): void {
  match.roundStepCount++;
  if (match.phase === "inFlight") {
    advanceShot(match);
  }
}

function advanceShot(match: Match): void {
  const flightStep = flyMissile(match.missile!, match.planets);
  const trailSegment = { shooter: match.activePlayer, ...flightStep.segment };
  match.trails.push(trailSegment);
  if (flightStep.shotEnded) {
    endShot(match);
  }
}

function endShot(match: Match): void {
  match.phase = "aiming";
  match.activePlayer = match.activePlayer === "left" ? "right" : "left";
}

export function adjustAim(match: Match, delta: AimDelta): void {
  if (match.phase !== "aiming") {
    return;
  }
  const aim = match.ships[match.activePlayer].aim;
  aim.angle = (((aim.angle + delta.angle) % FULL_TURN) + FULL_TURN) % FULL_TURN;
  aim.power = Math.min(Math.max(aim.power + delta.power, 0), MAX_POWER);
}

export function fire(match: Match): void {
  if (match.phase !== "aiming") {
    return;
  }
  const side = match.activePlayer;
  const shot = shotRecordFor(match.ships[side], BARREL_DISTANCE[side]);
  match.missile = launchMissile(shot);
  match.phase = "inFlight";
}

export function phase(match: Match): Phase {
  return match.phase;
}

export function activePlayer(match: Match): Side {
  return match.activePlayer;
}

export function ships(match: Match): Readonly<Record<Side, Readonly<Ship>>> {
  return match.ships;
}

export function planets(match: Match): readonly Readonly<Planet>[] {
  return match.planets;
}

export function missile(match: Match): Readonly<Missile> | undefined {
  return match.missile;
}

export function isMissileInPlayingArea(match: Match): boolean {
  return match.missile !== undefined && isInsidePlayingArea(match.missile);
}

export function trails(match: Match): readonly Readonly<TrailSegment>[] {
  return match.trails;
}

export function powerPenalty(match: Match): number {
  return POWER_PENALTY_FACTOR * match.ships[match.activePlayer].aim.power;
}

export function roundNumber(match: Match): number {
  return match.roundNumber;
}

export function roundStepCount(match: Match): number {
  return match.roundStepCount;
}

export function scores(match: Match): Readonly<Record<Side, number>> {
  return match.scores;
}
