// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Side } from "./round";

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

const POWER_PENALTY_FACTOR = 5;
const HIT_SCORE = 1500;
const SELF_HIT_SCORE = -2000;
const QUICK_HIT_BONUSES = [500, 200, 100];

export function roundResultFor(shooter: Side, hitShip: Side, attempt: number, power: number): RoundResult {
  if (hitShip === shooter) {
    return selfHitResult(shooter);
  }
  return hitResult(shooter, hitShip, attempt, power);
}

function selfHitResult(shooter: Side): RoundResult {
  return {
    outcome: "selfHit",
    shooter,
    hitShip: shooter,
    baseScore: SELF_HIT_SCORE,
    quickHitBonus: 0,
    powerPenalty: 0,
    scoreChange: SELF_HIT_SCORE,
  };
}

function hitResult(shooter: Side, hitShip: Side, attempt: number, power: number): RoundResult {
  const quickHitBonus = quickHitBonusFor(attempt);
  const powerPenalty = powerPenaltyFor(power);
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

function quickHitBonusFor(attempt: number): number {
  return QUICK_HIT_BONUSES[attempt - 1] ?? 0;
}

export function powerPenaltyFor(power: number): number {
  return POWER_PENALTY_FACTOR * power;
}

export function nextRoundShooter(scores: Readonly<Record<Side, number>>, lastShooter: Side): Side {
  if (scores.left < scores.right) {
    return "left";
  }
  if (scores.right < scores.left) {
    return "right";
  }
  return lastShooter === "left" ? "right" : "left";
}
