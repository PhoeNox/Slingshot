// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import type { Point } from "./core/flight";
import { adjustAim, fire, matchView, type Match } from "./core/match";
import type { Side } from "./core/round";
import { createScreenSession, enterScreen, stepScreenSession } from "./screenSession";

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
const ANGLES = Array.from({ length: 36 }, (_, i) => i * 10);
const POWERS = [150, 300];
const SIDES: readonly Side[] = ["left", "right"];
const CERTAIN_HIT_DISTANCE = 7;
const MAX_FLIGHT_STEPS = 5000;

interface ShotOutcome {
  passedThrough: Side | undefined;
  hitShip: Side | undefined;
}

function fireThroughScreenSession(seed: number, angle: number, power: number): ShotOutcome {
  const session = createScreenSession();
  enterScreen(session, "match", seed);
  const match = session.match!;
  const ships = structuredClone(matchView(match).ships);
  aimAt(match, angle, power);
  fire(match);
  for (let i = 0; i < MAX_FLIGHT_STEPS && matchView(match).phase.kind === "inFlight"; i++) {
    stepScreenSession(session, false);
  }
  const view = matchView(match);
  const passedThrough = SIDES.find((side) =>
    view.trails.some((trail) => distanceToSegment(ships[side], trail.from, trail.to) < CERTAIN_HIT_DISTANCE));
  const hitShip = view.phase.kind === "roundOver" ? view.phase.result.hitShip : undefined;
  return { passedThrough, hitShip };
}

function aimAt(match: Match, angle: number, power: number): void {
  const aim = matchView(match).ships[matchView(match).activePlayer].aim;
  adjustAim(match, { angle: angle - aim.angle, power: power - aim.power });
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
  const t = Math.min(Math.max(along, 0), 1);
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

describe("ship hits in seeded matches", () => {
  test("every shot whose trail crosses a ship's centre ends the round as a hit on that ship", () => {
    const missedHits: string[] = [];
    let hits = 0;
    for (const seed of SEEDS) {
      for (const angle of ANGLES) {
        for (const power of POWERS) {
          const { passedThrough, hitShip } = fireThroughScreenSession(seed, angle, power);
          if (hitShip !== undefined) {
            hits++;
          }
          if (passedThrough !== undefined && hitShip !== passedThrough) {
            missedHits.push(`seed ${seed}, angle ${angle}, power ${power}: crossed ${passedThrough}, hit ${hitShip}`);
          }
        }
      }
    }

    expect(hits).toBeGreaterThan(0);
    expect(missedHits).toEqual([]);
  });
});
