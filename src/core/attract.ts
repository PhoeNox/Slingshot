// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  activeSide,
  adjustAim,
  aimOf,
  createMatch,
  DEFAULT_MATCH_RULES,
  drawRandomInt,
  fire,
  hasRoundBeenOverFor,
  isAiming,
  previewShot,
  startNextRound,
  step,
  type Match,
} from "./match";
import type { Aim, Side } from "./round";

export interface AttractMode {
  match: Match;
  stepsAiming: number;
}

interface AngleRange {
  min: number;
  max: number;
}

const CANDIDATE_COUNT = 20;
const CANDIDATE_ANGLES: Record<Side, AngleRange> = { left: { min: 10, max: 170 }, right: { min: 190, max: 350 } };
const MIN_CANDIDATE_POWER = 80;
const MAX_CANDIDATE_POWER = 300;
export const MAX_CANDIDATE_FLIGHT_STEPS = 360;

export const SHOT_DELAY_STEPS = 30;
export const NEXT_ROUND_DELAY_STEPS = 45;

export function createAttractMode(seed: number): AttractMode {
  const match = createMatch(seed, undefined, DEFAULT_MATCH_RULES);
  return { match, stepsAiming: 0 };
}

export function stepAttractMode(attract: AttractMode): void {
  step(attract.match);
  if (hasRoundBeenOverFor(attract.match, NEXT_ROUND_DELAY_STEPS)) {
    startNextRound(attract.match);
  } else if (isAiming(attract.match)) {
    playAimingStep(attract);
  }
}

function playAimingStep(attract: AttractMode): void {
  if (attract.stepsAiming === 0) {
    aimLongestFlight(attract.match);
  }
  attract.stepsAiming++;
  if (attract.stepsAiming >= SHOT_DELAY_STEPS) {
    attract.stepsAiming = 0;
    fire(attract.match);
  }
}

function aimLongestFlight(match: Match): void {
  const side = activeSide(match);
  const candidates = Array.from({ length: CANDIDATE_COUNT }, () => drawCandidateAim(match, side));
  const flightLengths = candidates.map((aim) => candidateFlightLength(match, aim));
  const longest = Math.max(...flightLengths);
  const bestIndex = flightLengths.indexOf(longest);
  aimAt(match, candidates[bestIndex]);
}

function drawCandidateAim(match: Match, side: Side): Aim {
  const angles = CANDIDATE_ANGLES[side];
  const angle = drawRandomInt(match, angles.min, angles.max);
  const power = drawRandomInt(match, MIN_CANDIDATE_POWER, MAX_CANDIDATE_POWER);
  return { angle, power };
}

function candidateFlightLength(match: Match, aim: Readonly<Aim>): number {
  const preview = previewShot(match, aim, MAX_CANDIDATE_FLIGHT_STEPS);
  return preview.endedWithinLimit ? preview.inAreaSteps : 0;
}

function aimAt(match: Match, aim: Readonly<Aim>): void {
  const current = aimOf(match, activeSide(match));
  const delta = { angle: aim.angle - current.angle, power: aim.power - current.power };
  adjustAim(match, delta);
}
