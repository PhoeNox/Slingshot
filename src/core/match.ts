// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { flyMissile, hasTimedOut, isInsidePlayingArea, launchMissile, shotRecordFor, type Missile, type Point } from "./flight";
import { createRng, randomInt, type Rng } from "./random";
import { BARREL_DISTANCE, createRoundLayout, type Planet, type RoundLayout, type Ship, type Side } from "./round";

export type { Missile, Point } from "./flight";
export type { Aim, Planet, RoundLayout, Ship, Side } from "./round";
export { BARREL_DISTANCE } from "./round";

export type RoundOutcome = "hit" | "selfHit";

export interface RoundResult {
  outcome: RoundOutcome;
  shooter: Side;
  hitShip: Side;
  baseScore: number;
  quickHitBonus: number;
  powerPenalty: number;
  scoreChange: number;
}

export interface AimingPhase {
  kind: "aiming";
}

export interface InFlightPhase {
  kind: "inFlight";
  missile: Missile;
}

export interface RoundOverPhase {
  kind: "roundOver";
  result: RoundResult;
  stepsSinceRoundOver: number;
}

export type Phase = AimingPhase | InFlightPhase | RoundOverPhase;

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
const HIT_SCORE = 1500;
const SELF_HIT_SCORE = -2000;
const QUICK_HIT_BONUSES = [500, 200, 100];

export interface Match {
  rng: Rng;
  phase: Phase;
  activePlayer: Side;
  roundNumber: number;
  roundStepCount: number;
  scores: Record<Side, number>;
  ships: Record<Side, Ship>;
  planets: Planet[];
  trails: TrailSegment[];
  attempts: Record<Side, number>;
}

export function createMatch(seed: number, firstRoundLayout?: RoundLayout): Match {
  const rng = createRng(seed);
  const activePlayer = drawFirstShooter(rng);
  const generatedLayout = createRoundLayout(rng);
  const layout = firstRoundLayout ?? generatedLayout;
  return {
    rng,
    phase: { kind: "aiming" },
    activePlayer,
    roundNumber: 1,
    roundStepCount: 0,
    scores: { left: 0, right: 0 },
    ships: layout.ships,
    planets: layout.planets,
    trails: [],
    attempts: { left: 0, right: 0 },
  };
}

function drawFirstShooter(rng: Rng): Side {
  return randomInt(rng, 0, 1) === 0 ? "left" : "right";
}

export function step(match: Match): void {
  match.roundStepCount++;
  if (match.phase.kind === "inFlight") {
    advanceShot(match, match.phase.missile);
  } else if (match.phase.kind === "roundOver") {
    match.phase.stepsSinceRoundOver++;
  }
}

function advanceShot(match: Match, missile: Missile): void {
  const flightStep = flyMissile(missile, match.planets, match.ships);
  const trailSegment = { shooter: match.activePlayer, ...flightStep.segment };
  match.trails.push(trailSegment);
  if (flightStep.hitShip !== undefined) {
    endRound(match, flightStep.hitShip);
  } else if (flightStep.shotEnded) {
    endShot(match);
  }
}

function endShot(match: Match): void {
  match.phase = { kind: "aiming" };
  match.activePlayer = opponentOf(match.activePlayer);
}

function opponentOf(side: Side): Side {
  return side === "left" ? "right" : "left";
}

function endRound(match: Match, hitShip: Side): void {
  const shooter = match.activePlayer;
  const result = roundResultFor(shooter, hitShip, match.attempts[shooter], match.ships[shooter].aim.power);
  match.scores[shooter] += result.scoreChange;
  match.phase = { kind: "roundOver", result, stepsSinceRoundOver: 0 };
}

function roundResultFor(shooter: Side, hitShip: Side, attempt: number, power: number): RoundResult {
  if (hitShip === shooter) {
    return {
      outcome: "selfHit",
      shooter,
      hitShip,
      baseScore: SELF_HIT_SCORE,
      quickHitBonus: 0,
      powerPenalty: 0,
      scoreChange: SELF_HIT_SCORE,
    };
  }
  const quickHitBonus = QUICK_HIT_BONUSES[attempt - 1] ?? 0;
  const powerPenalty = POWER_PENALTY_FACTOR * power;
  return {
    outcome: "hit",
    shooter,
    hitShip,
    baseScore: HIT_SCORE,
    quickHitBonus,
    powerPenalty,
    scoreChange: HIT_SCORE + quickHitBonus - powerPenalty,
  };
}

function startNextRound(match: Match): void {
  const layout = createRoundLayout(match.rng);
  match.activePlayer = nextRoundShooter(match.scores, match.activePlayer);
  match.phase = { kind: "aiming" };
  match.roundNumber++;
  match.roundStepCount = 0;
  match.ships = layout.ships;
  match.planets = layout.planets;
  match.trails = [];
  match.attempts = { left: 0, right: 0 };
}

function nextRoundShooter(scores: Readonly<Record<Side, number>>, lastShooter: Side): Side {
  if (scores.left < scores.right) {
    return "left";
  }
  if (scores.right < scores.left) {
    return "right";
  }
  return opponentOf(lastShooter);
}

export function adjustAim(match: Match, delta: AimDelta): void {
  if (match.phase.kind !== "aiming") {
    return;
  }
  const aim = match.ships[match.activePlayer].aim;
  aim.angle = (((aim.angle + delta.angle) % FULL_TURN) + FULL_TURN) % FULL_TURN;
  aim.power = Math.min(Math.max(aim.power + delta.power, 0), MAX_POWER);
}

export function fire(match: Match): void {
  if (match.phase.kind === "roundOver") {
    startNextRound(match);
  } else if (match.phase.kind === "aiming") {
    launchShot(match);
  }
}

function launchShot(match: Match): void {
  const side = match.activePlayer;
  const shot = shotRecordFor(match.ships[side], BARREL_DISTANCE[side]);
  const missile = launchMissile(shot);
  match.attempts[side]++;
  match.phase = { kind: "inFlight", missile };
}

export function phase(match: Match): Readonly<Phase> {
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

export function isZoomViewShown(match: Match): boolean {
  return match.phase.kind === "inFlight" && !isInsidePlayingArea(match.phase.missile);
}

export function timeoutCountdown(flight: Readonly<InFlightPhase>): number {
  return flight.missile.flightStepsLeft;
}

export function isTimedOut(flight: Readonly<InFlightPhase>): boolean {
  return hasTimedOut(flight.missile);
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

export function attempts(match: Match): Readonly<Record<Side, number>> {
  return match.attempts;
}
