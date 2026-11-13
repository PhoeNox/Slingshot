// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { isInsidePlayingArea } from "./flight";
import { createMatch, fire, step, type Match } from "./match";
import { randomInt, type Rng } from "./random";
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
const MAX_CANDIDATE_FLIGHT_STEPS = 360;

export const SHOT_DELAY_STEPS = 30;
export const NEXT_ROUND_DELAY_STEPS = 45;

export function createAttractMode(seed: number): AttractMode {
  const match = createMatch(seed);
  return { match, stepsAiming: 0 };
}

export function stepAttractMode(attract: AttractMode): void {
  step(attract.match);
  const phase = attract.match.phase;
  if (phase.kind === "roundOver" && phase.stepsSinceRoundOver >= NEXT_ROUND_DELAY_STEPS) {
    fire(attract.match);
  } else if (phase.kind === "aiming") {
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
  const side = match.activePlayer;
  const candidates = Array.from({ length: CANDIDATE_COUNT }, () => drawCandidateAim(match.rng, side));
  const flightLengths = candidates.map((aim) => inAreaFlightSteps(match, aim));
  const longest = Math.max(...flightLengths);
  const bestIndex = flightLengths.indexOf(longest);
  match.ships[side].aim = candidates[bestIndex];
}

function drawCandidateAim(rng: Rng, side: Side): Aim {
  const angles = CANDIDATE_ANGLES[side];
  const angle = randomInt(rng, angles.min, angles.max);
  const power = randomInt(rng, MIN_CANDIDATE_POWER, MAX_CANDIDATE_POWER);
  return { angle, power };
}

export function inAreaFlightSteps(match: Match, aim: Readonly<Aim>): number {
  const trial = structuredClone({ ...match, trails: [] });
  trial.ships[trial.activePlayer].aim = { ...aim };
  fire(trial);
  let inAreaSteps = 0;
  for (let flightStep = 0; flightStep < MAX_CANDIDATE_FLIGHT_STEPS; flightStep++) {
    step(trial);
    const phase = trial.phase;
    if (phase.kind !== "inFlight") {
      return inAreaSteps;
    }
    if (isInsidePlayingArea(phase.missile)) {
      inAreaSteps++;
    }
  }
  return 0;
}
