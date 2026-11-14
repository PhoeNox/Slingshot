// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  aimLineFor,
  flyMissile,
  hasTimedOut,
  isInsidePlayingArea,
  launchMissile,
  shotRecordFor,
  STEPS_PER_SECOND,
  type FlightEnd,
  type FlightStep,
  type Missile,
  type Point,
  type Segment,
  type ShotRecord,
} from "./flight";
import { createRng, randomInt, type Rng } from "./random";
import {
  BARREL_DISTANCE,
  createRoundLayout,
  type Aim,
  type Planet,
  type PlanetCountRange,
  type RoundLayout,
  type Ship,
  type Side,
} from "./round";
import { nextRoundShooter, powerPenaltyFor, roundResultFor, type RoundResult } from "./scoring";
import { NO_ZOOM, nextZoom, type Zoom } from "./zoom";

export type { Point, ShotRecord } from "./flight";
export type { Aim, PlanetCountRange, RoundLayout, Side } from "./round";
export type { RoundOutcome, RoundResult } from "./scoring";
export type { Zoom } from "./zoom";

interface AimingPhase {
  kind: "aiming";
}

interface InFlightPhase {
  kind: "inFlight";
  missile: Missile;
}

interface RoundOverPhase {
  kind: "roundOver";
  result: RoundResult;
  nextShooter: Side;
  stepsSinceRoundOver: number;
}

type Phase = AimingPhase | InFlightPhase | RoundOverPhase;

export interface AimDelta {
  angle: number;
  power: number;
}

export interface ShotPreview {
  inAreaSteps: number;
  endedWithinLimit: boolean;
}

export type ShotEndReason = "hit" | "selfHit" | "planet" | "leftTrackingArea" | "timedOut";

export interface ShotOutcome {
  endReason: ShotEndReason;
  stepsFlown: number;
  finalPosition: Point;
}

interface TrailSegment {
  shooter: Side;
  shotNumber: number;
  from: Point;
  to: Point;
}

export type PlanetVisibility = "always" | "atRoundStart" | "hidden";

export interface MatchRules {
  planetCount: PlanetCountRange;
  timeoutSeconds: number | undefined;
  bounce: boolean;
  planetVisibility: PlanetVisibility;
}

export const DEFAULT_MATCH_RULES: DeepReadonly<MatchRules> = {
  planetCount: { min: 2, max: 4 },
  timeoutSeconds: 25,
  bounce: false,
  planetVisibility: "always",
};

const MAX_POWER = 350;
const FULL_TURN = 360;
const SHOT_RECORD_TOLERANCE = 1e-6;
const SHOT_RECORD_FIELDS = ["x", "y", "vx", "vy"] as const;

interface MatchState {
  phase: Phase;
  activePlayer: Side;
  roundNumber: number;
  roundStepCount: number;
  scores: Record<Side, number>;
  ships: Record<Side, Ship>;
  planets: Planet[];
  trails: TrailSegment[];
  attempts: Record<Side, number>;
  zoom: Zoom;
  impact: Point | undefined;
}

type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

export interface Match extends MatchState {
  rng: Rng;
  rules: DeepReadonly<MatchRules>;
}

interface InFlightPhaseView extends InFlightPhase {
  stepsFlown: number;
  timedOut: boolean;
}

type PhaseView = AimingPhase | InFlightPhaseView | RoundOverPhase;

interface MatchViewState extends Omit<MatchState, "phase"> {
  phase: PhaseView;
  aimLine: Segment;
  powerPenalty: number;
  rules: MatchRules;
}

export type MatchView = DeepReadonly<MatchViewState>;
export type InFlightView = DeepReadonly<InFlightPhaseView>;
export type RoundOverView = DeepReadonly<RoundOverPhase>;

export function createMatch(
  seed: number,
  firstRoundLayout?: RoundLayout,
  rules: DeepReadonly<MatchRules> = DEFAULT_MATCH_RULES,
): Match {
  const rng = createRng(seed);
  const activePlayer = drawFirstShooter(rng);
  const generatedLayout = createRoundLayout(rng, rules.planetCount);
  const layout = firstRoundLayout ?? generatedLayout;
  return {
    rng,
    rules,
    phase: { kind: "aiming" },
    activePlayer,
    roundNumber: 1,
    roundStepCount: 0,
    scores: { left: 0, right: 0 },
    ships: layout.ships,
    planets: layout.planets,
    trails: [],
    attempts: { left: 0, right: 0 },
    zoom: { ...NO_ZOOM },
    impact: undefined,
  };
}

function drawFirstShooter(rng: Rng): Side {
  return randomInt(rng, 0, 1) === 0 ? "left" : "right";
}

export function step(match: Match): ShotOutcome | undefined {
  match.roundStepCount++;
  match.impact = undefined;
  let outcome: ShotOutcome | undefined;
  if (match.phase.kind === "inFlight") {
    outcome = advanceShot(match, match.phase.missile);
  } else if (match.phase.kind === "roundOver") {
    match.phase.stepsSinceRoundOver++;
  }
  const missile = match.phase.kind === "inFlight" ? match.phase.missile : undefined;
  match.zoom = nextZoom(match.zoom, missile);
  return outcome;
}

function advanceShot(match: Match, missile: Missile): ShotOutcome | undefined {
  const flightStep = flyMissile(missile, match.planets, match.ships);
  const shotNumber = match.attempts.left + match.attempts.right;
  const trailSegment = { shooter: match.activePlayer, shotNumber, ...flightStep.segment };
  match.trails.push(trailSegment);
  if (flightStep.end === "planet" || flightStep.end === "ship") {
    match.impact = flightStep.segment.to;
  }
  if (flightStep.end === undefined) {
    return undefined;
  }
  const outcome = shotOutcomeFor(match.activePlayer, flightStep.end, flightStep, missile);
  if (flightStep.hitShip !== undefined) {
    endRound(match, flightStep.hitShip);
  } else {
    endShot(match);
  }
  return outcome;
}

function shotOutcomeFor(
  shooter: Side,
  end: FlightEnd,
  flightStep: Readonly<FlightStep>,
  missile: Readonly<Missile>,
): ShotOutcome {
  const endReason = shotEndReasonFor(shooter, end, flightStep.hitShip);
  const finalPosition = { ...flightStep.segment.to };
  return { endReason, stepsFlown: missile.stepsFlown, finalPosition };
}

function shotEndReasonFor(shooter: Side, end: FlightEnd, hitShip: Side | undefined): ShotEndReason {
  if (end !== "ship") {
    return end;
  }
  return hitShip === shooter ? "selfHit" : "hit";
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
  const nextRoundFirstShooter = nextRoundShooter(match.scores, shooter);
  match.phase = { kind: "roundOver", result, nextShooter: nextRoundFirstShooter, stepsSinceRoundOver: 0 };
}

function startNextRound(match: Match, shooter: Side): void {
  const layout = createRoundLayout(match.rng, match.rules.planetCount);
  match.activePlayer = shooter;
  match.phase = { kind: "aiming" };
  match.roundNumber++;
  match.roundStepCount = 0;
  match.ships = layout.ships;
  match.planets = layout.planets;
  match.trails = [];
  match.attempts = { left: 0, right: 0 };
}

export function adjustAim(match: Match, delta: AimDelta): void {
  if (match.phase.kind !== "aiming") {
    return;
  }
  const aim = match.ships[match.activePlayer].aim;
  aim.angle = (((aim.angle + delta.angle) % FULL_TURN) + FULL_TURN) % FULL_TURN;
  aim.power = Math.min(Math.max(aim.power + delta.power, 0), MAX_POWER);
}

export function showAim(match: Match, side: Side, aim: Readonly<Aim>): void {
  if (isAimingTurnOf(match, side)) {
    match.ships[side].aim = { angle: aim.angle, power: aim.power };
  }
}

export function isAimingTurnOf(match: Readonly<Match>, side: Side): boolean {
  return match.phase.kind === "aiming" && match.activePlayer === side;
}

export function isShotInFlight(match: Readonly<Match>): boolean {
  return match.phase.kind === "inFlight";
}

export function isRoundOver(match: Readonly<Match>): boolean {
  return match.phase.kind === "roundOver";
}

export function fire(match: Match): ShotRecord | undefined {
  if (match.phase.kind === "roundOver") {
    startNextRound(match, match.phase.nextShooter);
    return undefined;
  }
  if (match.phase.kind === "aiming") {
    return launchShot(match);
  }
  return undefined;
}

function launchShot(match: Match): ShotRecord {
  const side = match.activePlayer;
  const shot = shotRecordFor(match.ships[side], BARREL_DISTANCE[side]);
  launchShotRecord(match, shot);
  return shot;
}

function launchShotRecord(match: Match, shot: Readonly<ShotRecord>): void {
  const missile = launchMissileUnderRules(shot, match.rules);
  match.attempts[match.activePlayer]++;
  match.phase = { kind: "inFlight", missile };
}

export function fireReceivedShot(match: Match, aim: Readonly<Aim>, shot: Readonly<ShotRecord>): boolean {
  if (match.phase.kind !== "aiming" || !isValidShot(match, aim, shot)) {
    return false;
  }
  match.ships[match.activePlayer].aim = { angle: aim.angle, power: aim.power };
  launchShotRecord(match, shot);
  return true;
}

function isValidShot(match: Readonly<Match>, aim: Readonly<Aim>, shot: Readonly<ShotRecord>): boolean {
  return isAimInRange(aim) && isWithinTolerance(shot, expectedShotRecord(match, aim));
}

function isAimInRange(aim: Readonly<Aim>): boolean {
  return aim.angle >= 0 && aim.angle < FULL_TURN && aim.power >= 0 && aim.power <= MAX_POWER;
}

function isWithinTolerance(shot: Readonly<ShotRecord>, expected: Readonly<ShotRecord>): boolean {
  return SHOT_RECORD_FIELDS.every((field) => Math.abs(shot[field] - expected[field]) <= SHOT_RECORD_TOLERANCE);
}

function expectedShotRecord(match: Readonly<Match>, aim: Readonly<Aim>): ShotRecord {
  const side = match.activePlayer;
  return shotRecordFor({ ...match.ships[side], aim }, BARREL_DISTANCE[side]);
}

export function nextShooter(match: Readonly<Match>): Side {
  return match.phase.kind === "roundOver" ? match.phase.nextShooter : match.activePlayer;
}

export function previewShot(match: Readonly<Match>, aim: Readonly<Aim>, stepLimit: number): ShotPreview {
  const side = match.activePlayer;
  const ship = { ...match.ships[side], aim };
  const shot = shotRecordFor(ship, BARREL_DISTANCE[side]);
  const missile = launchMissileUnderRules(shot, match.rules);
  return previewFlight(missile, match, stepLimit);
}

function launchMissileUnderRules(shot: ShotRecord, rules: DeepReadonly<MatchRules>): Missile {
  const timeoutSteps = rules.timeoutSeconds === undefined ? undefined : rules.timeoutSeconds * STEPS_PER_SECOND;
  return launchMissile(shot, timeoutSteps, rules.bounce);
}

function previewFlight(missile: Missile, match: Readonly<Match>, stepLimit: number): ShotPreview {
  let inAreaSteps = 0;
  for (let flightStep = 0; flightStep < stepLimit; flightStep++) {
    const { end } = flyMissile(missile, match.planets, match.ships);
    if (end !== undefined) {
      return { inAreaSteps, endedWithinLimit: true };
    }
    if (isInsidePlayingArea(missile)) {
      inAreaSteps++;
    }
  }
  return { inAreaSteps, endedWithinLimit: false };
}

export function drawRandomInt(match: Match, min: number, max: number): number {
  return randomInt(match.rng, min, max);
}

export function matchView(match: Match): MatchView {
  const side = match.activePlayer;
  const ship = match.ships[side];
  const phase = phaseView(match.phase);
  const aimLine = aimLineFor(ship, BARREL_DISTANCE[side]);
  const powerPenalty = powerPenaltyFor(ship.aim.power);
  return {
    phase,
    activePlayer: side,
    roundNumber: match.roundNumber,
    roundStepCount: match.roundStepCount,
    scores: match.scores,
    ships: match.ships,
    planets: match.planets,
    trails: match.trails,
    attempts: match.attempts,
    aimLine,
    powerPenalty,
    zoom: match.zoom,
    impact: match.impact,
    rules: match.rules,
  };
}

function phaseView(phase: Phase): PhaseView {
  return phase.kind === "inFlight" ? inFlightView(phase) : phase;
}

function inFlightView(flight: InFlightPhase): InFlightPhaseView {
  const timedOut = hasTimedOut(flight.missile);
  return { ...flight, stepsFlown: flight.missile.stepsFlown, timedOut };
}
