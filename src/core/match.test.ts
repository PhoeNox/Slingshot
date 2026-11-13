// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import {
  adjustAim,
  createMatch,
  fire,
  matchView,
  step,
  type InFlightView,
  type Match,
  type RoundLayout,
  type RoundOverView,
} from "./match";
import { BARREL_DISTANCE, type Planet, type Side } from "./round";
import { isInsidePlayingArea } from "./flight";

const SEEDS = Array.from({ length: 1000 }, (_, i) => i * 7919 + 1);

const SHIP_X: Record<Side, number> = { left: 40, right: 760 };

function activeAim(match: Match) {
  return { ...matchView(match).ships[matchView(match).activePlayer].aim };
}

function inactivePlayer(match: Match): Side {
  return matchView(match).activePlayer === "left" ? "right" : "left";
}

function inFlight(match: Match): InFlightView {
  const current = matchView(match).phase;
  if (current.kind !== "inFlight") {
    throw new Error(`expected a shot in flight, phase is ${current.kind}`);
  }
  return current;
}

function roundOver(match: Match): RoundOverView {
  const current = matchView(match).phase;
  if (current.kind !== "roundOver") {
    throw new Error(`expected the round to be over, phase is ${current.kind}`);
  }
  return current;
}

function shotEndPoint(match: Match) {
  return matchView(match).trails.at(-1)!.to;
}

function activeShip(match: Match) {
  return matchView(match).ships[matchView(match).activePlayer];
}

function fixedLayout(roundPlanets: Planet[], leftY = 300, rightY = 300): RoundLayout {
  return {
    ships: {
      left: { x: SHIP_X.left, y: leftY, aim: { angle: 90, power: 100 } },
      right: { x: SHIP_X.right, y: rightY, aim: { angle: 270, power: 100 } },
    },
    planets: roundPlanets,
  };
}

function selfHitMatch(seed: number): Match {
  const shooter = matchView(createMatch(seed)).activePlayer;
  return createMatch(seed, fixedLayout([planetAt(SHIP_X[shooter], 450, 100, 10)]));
}

function planetAt(x: number, y: number, mass: number, radius: number): Planet {
  return { sprite: 1, mass, radius, x, y };
}

function aimAt(match: Match, angle: number, power: number): void {
  const aim = activeAim(match);
  adjustAim(match, { angle: angle - aim.angle, power: power - aim.power });
}

function stepUntilShotEnds(match: Match, maxSteps: number): number {
  for (let i = 1; i <= maxSteps; i++) {
    step(match);
    if (matchView(match).phase.kind !== "inFlight") {
      return i;
    }
  }
  throw new Error(`shot still in flight after ${maxSteps} steps`);
}

function opponentAngle(match: Match): number {
  return matchView(match).activePlayer === "left" ? 90 : 270;
}

function missShot(match: Match): void {
  aimAt(match, 0, 250);
  fire(match);
  stepUntilShotEnds(match, 200);
}

function hitOpponent(match: Match, power: number): void {
  aimAt(match, opponentAngle(match), power);
  fire(match);
  stepUntilShotEnds(match, 1000);
}

function hitOpponentOnAttempt(match: Match, attempt: number, power: number): void {
  for (let i = 1; i < attempt; i++) {
    missShot(match);
    missShot(match);
  }
  hitOpponent(match, power);
}

function hitOwnShip(match: Match): void {
  aimAt(match, 0, 20);
  fire(match);
  stepUntilShotEnds(match, 1000);
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

describe("createMatch", () => {
  test("starts round 1 in the aiming phase with scores at zero", () => {
    const match = createMatch(42);

    expect(matchView(match).roundNumber).toBe(1);
    expect(matchView(match).phase.kind).toBe("aiming");
    expect(matchView(match).scores).toEqual({ left: 0, right: 0 });
    expect(matchView(match).roundStepCount).toBe(0);
  });

  test("first shooter is chosen at random across seeds", () => {
    const firstShooters = new Set(SEEDS.map((seed) => matchView(createMatch(seed)).activePlayer));

    expect(firstShooters).toEqual(new Set(["left", "right"]));
  });

  test("same seed yields identical match state", () => {
    const first = createMatch(123456);
    const second = createMatch(123456);
    for (let i = 0; i < 50; i++) {
      step(first);
      step(second);
    }

    expect(matchView(first)).toEqual(matchView(second));
  });

  test("different seeds yield different layouts", () => {
    const layouts = new Set(SEEDS.map((seed) => JSON.stringify(matchView(createMatch(seed)).planets)));

    expect(layouts.size).toBeGreaterThan(SEEDS.length * 0.99);
  });

  test("a fixed first-round layout replaces the generated ships and planets", () => {
    const match = createMatch(42, fixedLayout([planetAt(400, 300, 100, 10)], 150, 450));

    expect(matchView(match).ships).toEqual(fixedLayout([], 150, 450).ships);
    expect(matchView(match).planets).toEqual([planetAt(400, 300, 100, 10)]);
  });

  test("a fixed first-round layout leaves the first shooter seed-determined", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(matchView(createMatch(seed, fixedLayout([]))).activePlayer).toBe(matchView(createMatch(seed)).activePlayer);
    }
  });
});

describe("round generation", () => {
  test("two to four planets with distinct sprites across seeds", () => {
    for (const seed of SEEDS) {
      const roundPlanets = matchView(createMatch(seed)).planets;
      const sprites = roundPlanets.map((planet) => planet.sprite);

      expect(roundPlanets.length).toBeGreaterThanOrEqual(2);
      expect(roundPlanets.length).toBeLessThanOrEqual(4);
      expect(new Set(sprites).size).toBe(sprites.length);
      for (const sprite of sprites) {
        expect(Number.isInteger(sprite)).toBe(true);
        expect(sprite).toBeGreaterThanOrEqual(1);
        expect(sprite).toBeLessThanOrEqual(8);
      }
    }
  });

  test("planet masses are integers from 8 to 512 with quantized radii across seeds", () => {
    for (const seed of SEEDS) {
      for (const planet of matchView(createMatch(seed)).planets) {
        expect(Number.isInteger(planet.mass)).toBe(true);
        expect(planet.mass).toBeGreaterThanOrEqual(8);
        expect(planet.mass).toBeLessThanOrEqual(512);
        expect(Number.isInteger(planet.radius * 1024)).toBe(true);
        expect(Math.abs(planet.radius - Math.cbrt(planet.mass) * 12.5)).toBeLessThanOrEqual(1 / 2048);
      }
    }
  });

  test("planets keep clear of the ship edges and the top and bottom across seeds", () => {
    for (const seed of SEEDS) {
      for (const planet of matchView(createMatch(seed)).planets) {
        const margin = Math.round(planet.radius);
        expect(Number.isInteger(planet.x)).toBe(true);
        expect(Number.isInteger(planet.y)).toBe(true);
        expect(planet.x).toBeGreaterThanOrEqual(75 + margin);
        expect(planet.x).toBeLessThanOrEqual(725 - margin);
        expect(planet.y).toBeGreaterThanOrEqual(50 + margin);
        expect(planet.y).toBeLessThanOrEqual(550 - margin);
      }
    }
  });

  test("planets are separated by radius and mass across seeds", () => {
    for (const seed of SEEDS) {
      const roundPlanets = matchView(createMatch(seed)).planets;
      for (let i = 0; i < roundPlanets.length; i++) {
        for (let j = i + 1; j < roundPlanets.length; j++) {
          const a = roundPlanets[i];
          const b = roundPlanets[j];
          const distance = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
          const required = (a.radius + b.radius) * 1.5 + 0.1 * (a.mass + b.mass);
          expect(distance).toBeGreaterThanOrEqual(required);
        }
      }
    }
  });

  test("ships sit at the edges within their vertical band across seeds", () => {
    for (const seed of SEEDS) {
      const { left, right } = matchView(createMatch(seed)).ships;

      expect(left.x).toBe(40);
      expect(right.x).toBe(760);
      for (const ship of [left, right]) {
        expect(Number.isInteger(ship.y)).toBe(true);
        expect(ship.y).toBeGreaterThanOrEqual(100);
        expect(ship.y).toBeLessThanOrEqual(500);
      }
    }
  });

  test("ships start with the default aim", () => {
    const { left, right } = matchView(createMatch(7)).ships;

    expect(left.aim).toEqual({ angle: 90, power: 100 });
    expect(right.aim).toEqual({ angle: 270, power: 100 });
  });
});

describe("adjustAim", () => {
  test("applies angle and power steps to the active ship", () => {
    const match = createMatch(11);
    const before = activeAim(match);

    adjustAim(match, { angle: 2, power: 0 });
    adjustAim(match, { angle: 5, power: 0 });
    adjustAim(match, { angle: 0, power: -10 });
    adjustAim(match, { angle: 0, power: 25 });

    expect(activeAim(match)).toEqual({ angle: before.angle + 7, power: before.power + 15 });
  });

  test("clamps power at the maximum of 350", () => {
    const match = createMatch(12);

    for (let i = 0; i < 20; i++) {
      adjustAim(match, { angle: 0, power: 25 });
    }

    expect(activeAim(match).power).toBe(350);
  });

  test("clamps power at zero", () => {
    const match = createMatch(13);

    for (let i = 0; i < 20; i++) {
      adjustAim(match, { angle: 0, power: -10 });
    }

    expect(activeAim(match).power).toBe(0);
  });

  test("wraps the angle below zero to just under 360", () => {
    const match = createMatch(14);
    adjustAim(match, { angle: -activeAim(match).angle, power: 0 });

    adjustAim(match, { angle: -2, power: 0 });

    expect(activeAim(match).angle).toBe(358);
  });

  test("wraps the angle at 360 back to the start of the turn", () => {
    const match = createMatch(15);
    adjustAim(match, { angle: 358 - activeAim(match).angle, power: 0 });

    adjustAim(match, { angle: 5, power: 0 });

    expect(activeAim(match).angle).toBe(3);
  });

  test("leaves the inactive ship's aim unchanged", () => {
    const match = createMatch(16);
    const inactive = inactivePlayer(match);
    const inactiveBefore = { ...matchView(match).ships[inactive].aim };

    adjustAim(match, { angle: 5, power: 25 });

    expect(matchView(match).ships[inactive].aim).toEqual(inactiveBefore);
  });
});

describe("fire", () => {
  test("launches the missile from the barrel tip with velocity from the aim", () => {
    const match = createMatch(21);
    const side = matchView(match).activePlayer;
    adjustAim(match, { angle: 30, power: 50 });
    const ship = activeShip(match);
    const radians = (ship.aim.angle * Math.PI) / 180;

    fire(match);

    const launched = inFlight(match).missile;
    expect(matchView(match).phase.kind).toBe("inFlight");
    expect(launched.x).toBeCloseTo(ship.x + BARREL_DISTANCE[side] * Math.sin(radians), 10);
    expect(launched.y).toBeCloseTo(ship.y - BARREL_DISTANCE[side] * Math.cos(radians), 10);
    expect(launched.vx).toBeCloseTo(0.1 * ship.aim.power * Math.sin(radians), 10);
    expect(launched.vy).toBeCloseTo(-0.1 * ship.aim.power * Math.cos(radians), 10);
  });

  test("launches the missile from the start of the aim line", () => {
    const match = createMatch(24);
    adjustAim(match, { angle: 47, power: -20 });
    const lineStart = matchView(match).aimLine.from;

    fire(match);

    const launched = inFlight(match).missile;
    expect(launched.x).toBe(lineStart.x);
    expect(launched.y).toBe(lineStart.y);
  });

  test("shows a power penalty of five times the shot power", () => {
    const match = createMatch(22);
    adjustAim(match, { angle: 0, power: 30 });

    fire(match);

    expect(matchView(match).powerPenalty).toBe(650);
  });

  test("aim and fire have no effect while the missile is in flight", () => {
    const match = createMatch(23, fixedLayout([]));
    fire(match);
    step(match);
    const aimBefore = activeAim(match);
    const missileBefore = { ...inFlight(match).missile };
    const trailLengthBefore = matchView(match).trails.length;

    adjustAim(match, { angle: 5, power: 25 });
    fire(match);

    expect(activeAim(match)).toEqual(aimBefore);
    expect(inFlight(match).missile).toEqual(missileBefore);
    expect(matchView(match).trails).toHaveLength(trailLengthBefore);
    expect(matchView(match).phase.kind).toBe("inFlight");
  });
});

describe("flight", () => {
  test("a missile with no planets flies in a straight line and leaves a trail in the shooter's name", () => {
    const match = createMatch(31, fixedLayout([]));
    const shooter = matchView(match).activePlayer;
    adjustAim(match, { angle: 20, power: 0 });
    fire(match);
    const launched = { ...inFlight(match).missile };

    for (let i = 0; i < 10; i++) {
      step(match);
    }

    const flying = inFlight(match).missile;
    expect(flying.x).toBeCloseTo(launched.x + 10 * launched.vx, 9);
    expect(flying.y).toBeCloseTo(launched.y + 10 * launched.vy, 9);
    expect(flying.vx).toBe(launched.vx);
    expect(flying.vy).toBe(launched.vy);
    expect(matchView(match).trails).toHaveLength(10);
    expect(matchView(match).trails.every((segment) => segment.shooter === shooter)).toBe(true);
    expect(matchView(match).trails[0].from).toEqual({ x: launched.x, y: launched.y });
    expect(matchView(match).trails[9].to).toEqual({ x: flying.x, y: flying.y });
  });

  test("gravity pulls the missile toward a planet", () => {
    const match = createMatch(32, fixedLayout([planetAt(400, 100, 100, 10)]));
    const ship = activeShip(match);
    fire(match);

    for (let i = 0; i < 20; i++) {
      step(match);
    }

    const flying = inFlight(match).missile;
    expect(flying.vy).toBeLessThan(0);
    expect(flying.y).toBeLessThan(ship.y);
  });

  test("a missile touching a planet stops at its surface and hands the turn over", () => {
    const planet = planetAt(400, 300, 8, 25);
    const match = createMatch(33, fixedLayout([planet]));
    const shooter = matchView(match).activePlayer;
    const shooterAim = activeAim(match);
    fire(match);

    stepUntilShotEnds(match, 200);

    const stopped = shotEndPoint(match);
    const distanceToCentre = Math.sqrt((stopped.x - planet.x) ** 2 + (stopped.y - planet.y) ** 2);
    expect(distanceToCentre).toBeCloseTo(planet.radius, 9);
    expect(matchView(match).phase.kind).toBe("aiming");
    expect(matchView(match).activePlayer).not.toBe(shooter);
    expect(matchView(match).ships[shooter].aim).toEqual(shooterAim);
  });

  test("each player keeps their own aim between their shots", () => {
    const match = createMatch(34, fixedLayout([], 100, 500));
    const first = matchView(match).activePlayer;
    adjustAim(match, { angle: 10, power: 50 });
    const firstAim = activeAim(match);
    fire(match);
    stepUntilShotEnds(match, 500);
    adjustAim(match, { angle: -6, power: 20 });
    const secondAim = activeAim(match);
    fire(match);
    stepUntilShotEnds(match, 500);

    expect(matchView(match).activePlayer).toBe(first);
    expect(activeAim(match)).toEqual(firstAim);
    expect(matchView(match).ships[inactivePlayer(match)].aim).toEqual(secondAim);
  });

  test("leaving the tracking area ends the shot and hands the turn over", () => {
    const match = createMatch(35, fixedLayout([], 100, 500));
    const shooter = matchView(match).activePlayer;
    adjustAim(match, { angle: 0, power: 250 });
    fire(match);

    stepUntilShotEnds(match, 200);

    const lost = shotEndPoint(match);
    const outside = lost.x < -800 || lost.x >= 1600 || lost.y < -600 || lost.y >= 1200;
    expect(outside).toBe(true);
    expect(matchView(match).phase.kind).toBe("aiming");
    expect(matchView(match).activePlayer).not.toBe(shooter);
  });

  test("same seed and same fire commands yield identical match state", () => {
    const play = () => {
      const match = createMatch(98765);
      adjustAim(match, { angle: -14, power: 75 });
      fire(match);
      for (let i = 0; i < 300; i++) {
        step(match);
        if (matchView(match).phase.kind === "aiming") {
          adjustAim(match, { angle: 7, power: -20 });
          fire(match);
        }
      }
      return matchView(match);
    };

    expect(play()).toEqual(play());
  });
});

describe("leaving the playing area", () => {
  test("zoom-view flag is set exactly while the missile is outside the playing area", () => {
    const match = createMatch(51, fixedLayout([]));
    aimAt(match, 0, 100);
    expect(matchView(match).zoomViewShown).toBe(false);
    fire(match);
    const flagHistory: boolean[] = [];

    while (matchView(match).phase.kind === "inFlight") {
      expect(matchView(match).zoomViewShown).toBe(!isInsidePlayingArea(inFlight(match).missile));
      flagHistory.push(matchView(match).zoomViewShown);
      step(match);
    }

    expect(flagHistory).toContain(false);
    expect(flagHistory).toContain(true);
    expect(matchView(match).zoomViewShown).toBe(false);
  });

  test("an off-screen missile keeps flying before timeout until it leaves the tracking area", () => {
    const match = createMatch(52, fixedLayout([]));
    aimAt(match, 0, 100);
    fire(match);
    let stepsOffScreenInFlight = 0;

    while (matchView(match).phase.kind === "inFlight") {
      step(match);
      if (matchView(match).phase.kind === "inFlight" && matchView(match).zoomViewShown) {
        stepsOffScreenInFlight++;
        expect(inFlight(match).timedOut).toBe(false);
      }
    }

    expect(stepsOffScreenInFlight).toBeGreaterThan(0);
    expect(shotEndPoint(match).y).toBeLessThan(-600);
  });

  test("the timeout counts down once per step and is reached after 750 steps", () => {
    const match = createMatch(53, fixedLayout([]));
    aimAt(match, 0, 0);
    fire(match);

    expect(inFlight(match).missile.flightStepsLeft).toBe(750);
    step(match);
    expect(inFlight(match).missile.flightStepsLeft).toBe(749);
    for (let i = 0; i < 749; i++) {
      step(match);
    }
    expect(inFlight(match).missile.flightStepsLeft).toBe(0);
    expect(inFlight(match).timedOut).toBe(false);
    step(match);
    expect(inFlight(match).missile.flightStepsLeft).toBe(-1);
    expect(inFlight(match).timedOut).toBe(true);
  });

  test("a timed-out missile inside the playing area keeps flying", () => {
    const match = createMatch(54, fixedLayout([]));
    aimAt(match, 0, 0);
    fire(match);

    for (let i = 0; i < 1000; i++) {
      step(match);
    }

    expect(inFlight(match).timedOut).toBe(true);
    expect(matchView(match).phase.kind).toBe("inFlight");
    expect(isInsidePlayingArea(inFlight(match).missile)).toBe(true);
  });

  test("after timeout the shot ends as soon as the missile leaves the playing area", () => {
    const match = createMatch(55, fixedLayout([]));
    const shooter = matchView(match).activePlayer;
    aimAt(match, 0, 1);
    fire(match);

    const shotSteps = stepUntilShotEnds(match, 6000);

    const lost = shotEndPoint(match);
    expect(shotSteps).toBeGreaterThan(750);
    expect(lost.y).toBeLessThan(0);
    expect(lost.y).toBeGreaterThanOrEqual(-0.1 - 1e-9);
    expect(matchView(match).phase.kind).toBe("aiming");
    expect(matchView(match).activePlayer).not.toBe(shooter);
  });
});

describe("ship hits", () => {
  test("a missile reaching the opposing ship is a hit that ends the round", () => {
    const match = createMatch(61, fixedLayout([]));
    const shooter = matchView(match).activePlayer;
    const target = inactivePlayer(match);

    hitOpponent(match, 100);

    const stopped = shotEndPoint(match);
    expect(matchView(match).phase.kind).toBe("roundOver");
    expect(roundOver(match).result).toMatchObject({ outcome: "hit", shooter, hitShip: target });
    expect(distanceBetween(stopped, matchView(match).ships[target])).toBeLessThanOrEqual(14);
  });

  test("a fast missile cannot pass through a ship between two steps", () => {
    const match = createMatch(62, fixedLayout([]));
    const target = inactivePlayer(match);

    hitOpponent(match, 350);

    const distance = distanceBetween(shotEndPoint(match), matchView(match).ships[target]);
    expect(matchView(match).phase.kind).toBe("roundOver");
    expect(roundOver(match).result.hitShip).toBe(target);
    expect(distance).toBeLessThanOrEqual(14);
    expect(distance).toBeGreaterThan(14 - 3.5);
  });

  test("a missile curving back into the shooter's own ship is a self-hit", () => {
    const match = selfHitMatch(63);
    const shooter = matchView(match).activePlayer;

    hitOwnShip(match);

    expect(matchView(match).phase.kind).toBe("roundOver");
    expect(roundOver(match).result).toMatchObject({ outcome: "selfHit", shooter, hitShip: shooter });
    expect(distanceBetween(shotEndPoint(match), matchView(match).ships[shooter])).toBeLessThanOrEqual(14);
  });

  test("attempts are counted per player within the round", () => {
    const match = createMatch(64, fixedLayout([]));
    const first = matchView(match).activePlayer;
    const second = inactivePlayer(match);

    missShot(match);
    missShot(match);
    missShot(match);

    expect(matchView(match).attempts[first]).toBe(2);
    expect(matchView(match).attempts[second]).toBe(1);
  });

  test("steps since the round ended are counted while the round is over", () => {
    const match = createMatch(65, fixedLayout([]));
    hitOpponent(match, 100);

    expect(roundOver(match).stepsSinceRoundOver).toBe(0);
    step(match);
    step(match);
    step(match);
    expect(roundOver(match).stepsSinceRoundOver).toBe(3);
  });
});

describe("scoring", () => {
  test.each([
    [1, 500],
    [2, 200],
    [3, 100],
    [4, 0],
    [5, 0],
  ])("a hit on attempt %i earns a quick-hit bonus of %i", (attempt, bonus) => {
    const match = createMatch(71, fixedLayout([]));
    const shooter = matchView(match).activePlayer;
    const target = inactivePlayer(match);

    hitOpponentOnAttempt(match, attempt, 100);

    const expectedChange = 1500 + bonus - 500;
    expect(matchView(match).attempts[shooter]).toBe(attempt);
    expect(roundOver(match).result).toMatchObject({
      outcome: "hit",
      baseScore: 1500,
      quickHitBonus: bonus,
      powerPenalty: 500,
      scoreChange: expectedChange,
    });
    expect(matchView(match).scores[shooter]).toBe(expectedChange);
    expect(matchView(match).scores[target]).toBe(0);
  });

  test("five times the power of the hitting shot is deducted from a hit", () => {
    const match = createMatch(72, fixedLayout([]));
    const shooter = matchView(match).activePlayer;

    hitOpponent(match, 200);

    expect(roundOver(match).result.powerPenalty).toBe(1000);
    expect(matchView(match).scores[shooter]).toBe(1500 + 500 - 1000);
  });

  test("a self-hit deducts 2000 from the shooter only", () => {
    const match = selfHitMatch(73);
    const shooter = matchView(match).activePlayer;
    const other = inactivePlayer(match);

    hitOwnShip(match);

    expect(roundOver(match).result.scoreChange).toBe(-2000);
    expect(matchView(match).scores[shooter]).toBe(-2000);
    expect(matchView(match).scores[other]).toBe(0);
  });
});

describe("round end and next round", () => {
  test("adjustAim has no effect while the round is over", () => {
    const match = createMatch(81, fixedLayout([]));
    hitOpponent(match, 100);
    const aimsBefore = { left: { ...matchView(match).ships.left.aim }, right: { ...matchView(match).ships.right.aim } };

    adjustAim(match, { angle: 5, power: 25 });

    expect(matchView(match).ships.left.aim).toEqual(aimsBefore.left);
    expect(matchView(match).ships.right.aim).toEqual(aimsBefore.right);
    expect(matchView(match).phase.kind).toBe("roundOver");
  });

  test("fire during round over starts the next round with a new layout, default aims and cleared trails", () => {
    const match = createMatch(82, fixedLayout([]));
    hitOpponent(match, 100);
    const scoresBefore = { ...matchView(match).scores };
    for (let i = 0; i < 10; i++) {
      step(match);
    }

    fire(match);

    expect(matchView(match).phase).toEqual({ kind: "aiming" });
    expect(matchView(match).roundNumber).toBe(2);
    expect(matchView(match).roundStepCount).toBe(0);
    expect(matchView(match).trails).toEqual([]);
    expect(matchView(match).attempts).toEqual({ left: 0, right: 0 });
    expect(matchView(match).ships.left.aim).toEqual({ angle: 90, power: 100 });
    expect(matchView(match).ships.right.aim).toEqual({ angle: 270, power: 100 });
    expect(matchView(match).planets.length).toBeGreaterThanOrEqual(2);
    expect(matchView(match).scores).toEqual(scoresBefore);
  });

  test("the hit player has the lower score and shoots first in the next round", () => {
    const match = createMatch(83, fixedLayout([]));
    const target = inactivePlayer(match);
    hitOpponent(match, 100);

    fire(match);

    expect(matchView(match).activePlayer).toBe(target);
  });

  test("a player who hit their own ship has the lower score and shoots first in the next round", () => {
    const match = selfHitMatch(84);
    const shooter = matchView(match).activePlayer;
    hitOwnShip(match);

    fire(match);

    expect(matchView(match).activePlayer).toBe(shooter);
  });

  test("on tied scores the player next in alternation shoots first in the next round", () => {
    const match = createMatch(85, fixedLayout([]));
    const shooter = matchView(match).activePlayer;
    hitOpponentOnAttempt(match, 3, 320);
    expect(matchView(match).scores).toEqual({ left: 0, right: 0 });

    fire(match);

    expect(matchView(match).activePlayer).not.toBe(shooter);
  });

  test("the next round's layout comes from the seed regardless of the fixed first-round layout", () => {
    const first = createMatch(86, fixedLayout([]));
    const second = createMatch(86, fixedLayout([], 250, 250));
    hitOpponent(first, 100);
    hitOpponent(second, 100);

    fire(first);
    fire(second);

    expect(matchView(second).ships).toEqual(matchView(first).ships);
    expect(matchView(second).planets).toEqual(matchView(first).planets);
  });

  test("later rounds replay identically from the same seed", () => {
    const play = () => {
      const match = createMatch(4242, fixedLayout([]));
      hitOpponent(match, 100);
      fire(match);
      for (let i = 0; i < 300; i++) {
        step(match);
        if (matchView(match).phase.kind === "aiming") {
          adjustAim(match, { angle: 7, power: -20 });
          fire(match);
        }
      }
      return matchView(match);
    };

    const first = play();

    expect(first.roundNumber).toBe(2);
    expect(play()).toEqual(first);
  });
});

describe("matchView", () => {
  test("while aiming, the aim line runs from the barrel tip along the aim for the power's length", () => {
    const match = createMatch(61, fixedLayout([]));
    const side = matchView(match).activePlayer;
    const ship = activeShip(match);
    aimAt(match, 180, 120);

    const line = matchView(match).aimLine;

    expect(line.from.x).toBeCloseTo(ship.x, 10);
    expect(line.from.y).toBeCloseTo(ship.y + BARREL_DISTANCE[side], 10);
    expect(line.to.x).toBeCloseTo(ship.x, 10);
    expect(line.to.y).toBeCloseTo(ship.y + BARREL_DISTANCE[side] + 120, 10);
  });

  test("while aiming, shows the power penalty of the current aim and no zoom view", () => {
    const match = createMatch(62, fixedLayout([]));
    aimAt(match, 45, 80);

    const view = matchView(match);

    expect(view.powerPenalty).toBe(400);
    expect(view.zoomViewShown).toBe(false);
    expect(view.phase).toEqual({ kind: "aiming" });
  });

  test("inside the playing area, counts the steps flown and times out after 750 steps", () => {
    const match = createMatch(63, fixedLayout([]));
    aimAt(match, 0, 0);
    fire(match);

    expect(inFlight(match).stepsFlown).toBe(0);
    for (let i = 0; i < 3; i++) {
      step(match);
    }
    expect(inFlight(match).stepsFlown).toBe(3);
    expect(inFlight(match).timedOut).toBe(false);
    expect(matchView(match).zoomViewShown).toBe(false);

    for (let i = 3; i < 751; i++) {
      step(match);
    }
    expect(inFlight(match).stepsFlown).toBe(751);
    expect(inFlight(match).timedOut).toBe(true);
    expect(matchView(match).zoomViewShown).toBe(false);
  });

  test("outside the playing area before timeout, shows the zoom view and keeps the shot's power penalty", () => {
    const match = createMatch(64, fixedLayout([]));
    aimAt(match, 0, 100);
    fire(match);
    let steps = 0;
    while (!matchView(match).zoomViewShown) {
      step(match);
      steps++;
    }

    expect(inFlight(match).stepsFlown).toBe(steps);
    expect(inFlight(match).timedOut).toBe(false);
    expect(matchView(match).powerPenalty).toBe(500);
  });

  test("after a hit, shows no zoom view and keeps the shooter's aim line and power penalty", () => {
    const match = createMatch(65, fixedLayout([]));
    aimAt(match, opponentAngle(match), 120);
    const aimedLine = matchView(match).aimLine;

    fire(match);
    stepUntilShotEnds(match, 1000);

    const view = matchView(match);
    expect(view.phase.kind).toBe("roundOver");
    expect(view.zoomViewShown).toBe(false);
    expect(view.aimLine).toEqual(aimedLine);
    expect(view.powerPenalty).toBe(600);
  });

  test("building a view leaves the match unchanged in every phase", () => {
    const match = createMatch(66, fixedLayout([]));
    const expectUnchangedByView = () => {
      const before = structuredClone(match);
      matchView(match);
      expect(match).toEqual(before);
    };

    expectUnchangedByView();
    aimAt(match, opponentAngle(match), 100);
    fire(match);
    step(match);
    expectUnchangedByView();
    stepUntilShotEnds(match, 1000);
    expectUnchangedByView();
  });
});
