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
  type Missile,
  type Point,
  type Segment,
  type ShotRecord,
} from "./flight";
import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./playingArea";
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

export type { PlanetCountRange, RoundLayout } from "./round";
export type { RoundOutcome, RoundResult } from "./scoring";

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

interface TrailSegment {
  shooter: Side;
  shotNumber: number;
  from: Point;
  to: Point;
}

export interface MatchRules {
  planetCount: PlanetCountRange;
  timeoutSeconds: number | undefined;
  bounce: boolean;
}

export const DEFAULT_MATCH_RULES: DeepReadonly<MatchRules> = {
  planetCount: { min: 2, max: 4 },
  timeoutSeconds: 25,
  bounce: false,
};

const STEPS_PER_SECOND = 30;
const MAX_POWER = 350;
const FULL_TURN = 360;

const ZOOM_PADDING = 40;
const ZOOM_IN_PER_STEP = 2 / 3 / STEPS_PER_SECOND;
const ZOOM_PAN_PER_STEP = 10;

export interface Zoom {
  scale: number;
  left: number;
  top: number;
}

interface ZoomAxis {
  missile: number | undefined;
  extent: number;
}

interface Span {
  min: number;
  max: number;
}

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
  bounce: boolean;
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
    zoom: { scale: 1, left: 0, top: 0 },
    impact: undefined,
  };
}

function drawFirstShooter(rng: Rng): Side {
  return randomInt(rng, 0, 1) === 0 ? "left" : "right";
}

export function step(match: Match): void {
  match.roundStepCount++;
  match.impact = undefined;
  if (match.phase.kind === "inFlight") {
    advanceShot(match, match.phase.missile);
  } else if (match.phase.kind === "roundOver") {
    match.phase.stepsSinceRoundOver++;
  }
  match.zoom = nextZoom(match.zoom, match.phase);
}

function nextZoom(zoom: Readonly<Zoom>, phase: Phase): Zoom {
  const missile = phase.kind === "inFlight" ? phase.missile : undefined;
  const horizontal = { missile: missile?.x, extent: PLAYING_AREA_WIDTH };
  const vertical = { missile: missile?.y, extent: PLAYING_AREA_HEIGHT };
  const fittingScale = Math.min(fittingAxisScale(horizontal), fittingAxisScale(vertical));
  const scale = Math.min(fittingScale, zoom.scale + ZOOM_IN_PER_STEP);
  const keptHorizontal = keptSpan(horizontal, fittingScale);
  const keptVertical = keptSpan(vertical, fittingScale);
  const left = viewStart(zoom.left, keptHorizontal, horizontal.extent / scale, scale);
  const top = viewStart(zoom.top, keptVertical, vertical.extent / scale, scale);
  return { scale, left, top };
}

function missileSpan(axis: Readonly<ZoomAxis>): number {
  return axis.missile === undefined ? 0 : Math.max(axis.missile, axis.extent - axis.missile);
}

function fittingAxisScale(axis: Readonly<ZoomAxis>): number {
  const span = missileSpan(axis);
  return span <= axis.extent ? 1 : (axis.extent - ZOOM_PADDING) / (span - ZOOM_PADDING);
}

function keptSpan(axis: Readonly<ZoomAxis>, scale: number): Span {
  const missile = axis.missile;
  const span = missileSpan(axis);
  if (missile === undefined || span <= axis.extent) {
    return { min: 0, max: axis.extent };
  }
  const margin = (ZOOM_PADDING * (span - axis.extent)) / (span - ZOOM_PADDING) / scale;
  return { min: Math.min(0, missile - margin), max: Math.max(axis.extent, missile + margin) };
}

function viewStart(previous: number, kept: Readonly<Span>, viewLength: number, scale: number): number {
  const centred = (kept.min + kept.max - viewLength) / 2;
  const maxPan = ZOOM_PAN_PER_STEP / scale;
  const panned = clamp(centred, previous - maxPan, previous + maxPan);
  return clamp(panned, kept.max - viewLength, kept.min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function advanceShot(match: Match, missile: Missile): void {
  const flightStep = flyMissile(missile, match.planets, match.ships);
  const shotNumber = match.attempts.left + match.attempts.right;
  const trailSegment = { shooter: match.activePlayer, shotNumber, ...flightStep.segment };
  match.trails.push(trailSegment);
  if (flightStep.hitPlanet || flightStep.hitShip !== undefined) {
    match.impact = flightStep.segment.to;
  }
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

function startNextRound(match: Match): void {
  const layout = createRoundLayout(match.rng, match.rules.planetCount);
  match.activePlayer = nextRoundShooter(match.scores, match.activePlayer);
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
  const missile = launchMissileUnderRules(shot, match.rules);
  match.attempts[side]++;
  match.phase = { kind: "inFlight", missile };
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
    const { shotEnded } = flyMissile(missile, match.planets, match.ships);
    if (shotEnded) {
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
    bounce: match.rules.bounce,
  };
}

function phaseView(phase: Phase): PhaseView {
  return phase.kind === "inFlight" ? inFlightView(phase) : phase;
}

function inFlightView(flight: InFlightPhase): InFlightPhaseView {
  const timedOut = hasTimedOut(flight.missile);
  return { ...flight, stepsFlown: flight.missile.stepsFlown, timedOut };
}
