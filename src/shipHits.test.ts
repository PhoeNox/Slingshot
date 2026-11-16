// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import type { Point } from "./core/flight";
import { DEFAULT_MATCH_RULES, type MatchView } from "./core/match";
import type { Side } from "./core/round";
import { createScreenSession, type ScreenSession, type ScreenSessionAdapters } from "./screenSession";

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
const ANGLES = Array.from({ length: 36 }, (_, i) => i * 10);
const POWERS = [150, 300];
const SIDES: readonly Side[] = ["left", "right"];
const CERTAIN_HIT_DISTANCE = 7;
const MAX_FLIGHT_STEPS = 5000;
const SEED_RANGE = 2 ** 32;

interface ShotOutcome {
  passedThrough: Side | undefined;
  hitShip: Side | undefined;
}

function noVisit(): never {
  throw new Error("expected no host or guest visit");
}

function seededSession(seed: number): ScreenSession {
  const adapters: ScreenSessionAdapters = {
    random: () => seed / SEED_RANGE,
    settings: { matchRules: () => DEFAULT_MATCH_RULES },
    showScreen: () => {},
    navigateTo: () => {},
    peers: { host: noVisit, join: noVisit },
    relay: { awaitReplies: noVisit, deliverReply: noVisit },
    visitScreens: { showHostState: noVisit, showGuestState: noVisit },
    playSoundEffect: () => {},
  };
  return createScreenSession(adapters);
}

function fireThroughScreenSession(seed: number, angle: number, power: number): ShotOutcome {
  const session = seededSession(seed);
  session.enterRoute({ screen: "match", replace: false });
  const ships = structuredClone(shownView(session).ships);
  aimAt(session, angle, power);
  session.played().fire();
  for (let i = 0; i < MAX_FLIGHT_STEPS && shownView(session).phase.kind === "inFlight"; i++) {
    session.step(false);
  }
  const view = shownView(session);
  const passedThrough = SIDES.find((side) =>
    view.trails.some((trail) => distanceToSegment(ships[side], trail.from, trail.to) < CERTAIN_HIT_DISTANCE));
  const hitShip = view.phase.kind === "roundOver" ? view.phase.result.hitShip : undefined;
  return { passedThrough, hitShip };
}

function shownView(session: ScreenSession): MatchView {
  const view = session.played().view();
  if (view === undefined) {
    throw new Error("expected a shown match");
  }
  return view;
}

function aimAt(session: ScreenSession, angle: number, power: number): void {
  const view = shownView(session);
  const aim = view.ships[view.activePlayer].aim;
  session.played().aim({ angle: angle - aim.angle, power: power - aim.power });
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
