// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import {
  activePlayer,
  adjustAim,
  attempts,
  BARREL_DISTANCE,
  createMatch,
  fire,
  isTimedOut,
  isZoomViewShown,
  lastRoundResult,
  missile,
  phase,
  planets,
  powerPenalty,
  roundNumber,
  roundStepCount,
  scores,
  ships,
  step,
  stepsSinceRoundOver,
  timeoutCountdown,
  trails,
  type Match,
  type Planet,
  type Side,
} from "./match";

const SEEDS = Array.from({ length: 1000 }, (_, i) => i * 7919 + 1);

function activeAim(match: Match) {
  return { ...ships(match)[activePlayer(match)].aim };
}

function inactivePlayer(match: Match): Side {
  return activePlayer(match) === "left" ? "right" : "left";
}

function observableState(match: Match) {
  return {
    phase: phase(match),
    activePlayer: activePlayer(match),
    ships: ships(match),
    planets: planets(match),
    roundNumber: roundNumber(match),
    roundStepCount: roundStepCount(match),
    scores: scores(match),
    missile: missile(match),
    trails: trails(match),
    attempts: attempts(match),
    lastRoundResult: lastRoundResult(match),
    stepsSinceRoundOver: stepsSinceRoundOver(match),
  };
}

function activeShip(match: Match) {
  return ships(match)[activePlayer(match)];
}

function withPlanets(match: Match, roundPlanets: Planet[]): Match {
  match.planets = roundPlanets;
  return match;
}

function withShipsAt(match: Match, leftY: number, rightY: number): Match {
  match.ships.left.y = leftY;
  match.ships.right.y = rightY;
  return match;
}

function facingShips(match: Match): Match {
  return withShipsAt(withPlanets(match, []), 300, 300);
}

function planetAt(x: number, y: number, mass: number, radius: number): Planet {
  return { sprite: 1, mass, radius, x, y };
}

function aimAt(match: Match, angle: number, power: number): void {
  const aim = activeAim(match);
  adjustAim(match, { angle: angle - aim.angle, power: power - aim.power });
}

function isInsidePlayingArea(point: { x: number; y: number }): boolean {
  return point.x >= 0 && point.x < 800 && point.y >= 0 && point.y < 600;
}

function stepUntilShotEnds(match: Match, maxSteps: number): number {
  for (let i = 1; i <= maxSteps; i++) {
    step(match);
    if (phase(match) !== "inFlight") {
      return i;
    }
  }
  throw new Error(`shot still in flight after ${maxSteps} steps`);
}

function opponentAngle(match: Match): number {
  return activePlayer(match) === "left" ? 90 : 270;
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
  const ship = activeShip(match);
  withPlanets(match, [planetAt(ship.x, ship.y + 150, 100, 10)]);
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

    expect(roundNumber(match)).toBe(1);
    expect(phase(match)).toBe("aiming");
    expect(scores(match)).toEqual({ left: 0, right: 0 });
    expect(roundStepCount(match)).toBe(0);
  });

  test("first shooter is chosen at random across seeds", () => {
    const firstShooters = new Set(SEEDS.map((seed) => activePlayer(createMatch(seed))));

    expect(firstShooters).toEqual(new Set(["left", "right"]));
  });

  test("same seed yields identical match state", () => {
    const first = createMatch(123456);
    const second = createMatch(123456);
    for (let i = 0; i < 50; i++) {
      step(first);
      step(second);
    }

    expect(observableState(first)).toEqual(observableState(second));
  });

  test("different seeds yield different layouts", () => {
    const layouts = new Set(SEEDS.map((seed) => JSON.stringify(planets(createMatch(seed)))));

    expect(layouts.size).toBeGreaterThan(SEEDS.length * 0.99);
  });
});

describe("round generation", () => {
  test("two to four planets with distinct sprites across seeds", () => {
    for (const seed of SEEDS) {
      const roundPlanets = planets(createMatch(seed));
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
      for (const planet of planets(createMatch(seed))) {
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
      for (const planet of planets(createMatch(seed))) {
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
      const roundPlanets = planets(createMatch(seed));
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
      const { left, right } = ships(createMatch(seed));

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
    const { left, right } = ships(createMatch(7));

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
    const inactiveBefore = { ...ships(match)[inactive].aim };

    adjustAim(match, { angle: 5, power: 25 });

    expect(ships(match)[inactive].aim).toEqual(inactiveBefore);
  });
});

describe("fire", () => {
  test("launches the missile from the barrel tip with velocity from the aim", () => {
    const match = createMatch(21);
    const side = activePlayer(match);
    adjustAim(match, { angle: 30, power: 50 });
    const ship = activeShip(match);
    const radians = (ship.aim.angle * Math.PI) / 180;

    fire(match);

    const launched = missile(match)!;
    expect(phase(match)).toBe("inFlight");
    expect(launched.x).toBeCloseTo(ship.x + BARREL_DISTANCE[side] * Math.sin(radians), 10);
    expect(launched.y).toBeCloseTo(ship.y - BARREL_DISTANCE[side] * Math.cos(radians), 10);
    expect(launched.vx).toBeCloseTo(0.1 * ship.aim.power * Math.sin(radians), 10);
    expect(launched.vy).toBeCloseTo(-0.1 * ship.aim.power * Math.cos(radians), 10);
  });

  test("shows a power penalty of five times the shot power", () => {
    const match = createMatch(22);
    adjustAim(match, { angle: 0, power: 30 });

    fire(match);

    expect(powerPenalty(match)).toBe(650);
  });

  test("aim and fire have no effect while the missile is in flight", () => {
    const match = withPlanets(createMatch(23), []);
    fire(match);
    step(match);
    const aimBefore = activeAim(match);
    const missileBefore = { ...missile(match)! };
    const trailLengthBefore = trails(match).length;

    adjustAim(match, { angle: 5, power: 25 });
    fire(match);

    expect(activeAim(match)).toEqual(aimBefore);
    expect(missile(match)).toEqual(missileBefore);
    expect(trails(match)).toHaveLength(trailLengthBefore);
    expect(phase(match)).toBe("inFlight");
  });
});

describe("flight", () => {
  test("a missile with no planets flies in a straight line and leaves a trail in the shooter's name", () => {
    const match = withPlanets(createMatch(31), []);
    const shooter = activePlayer(match);
    adjustAim(match, { angle: 20, power: 0 });
    fire(match);
    const launched = { ...missile(match)! };

    for (let i = 0; i < 10; i++) {
      step(match);
    }

    const flying = missile(match)!;
    expect(flying.x).toBeCloseTo(launched.x + 10 * launched.vx, 9);
    expect(flying.y).toBeCloseTo(launched.y + 10 * launched.vy, 9);
    expect(flying.vx).toBe(launched.vx);
    expect(flying.vy).toBe(launched.vy);
    expect(trails(match)).toHaveLength(10);
    expect(trails(match).every((segment) => segment.shooter === shooter)).toBe(true);
    expect(trails(match)[0].from).toEqual({ x: launched.x, y: launched.y });
    expect(trails(match)[9].to).toEqual({ x: flying.x, y: flying.y });
  });

  test("gravity pulls the missile toward a planet", () => {
    const match = createMatch(32);
    const ship = activeShip(match);
    withPlanets(match, [planetAt(400, ship.y - 200, 100, 10)]);
    fire(match);

    for (let i = 0; i < 20; i++) {
      step(match);
    }

    const flying = missile(match)!;
    expect(flying.vy).toBeLessThan(0);
    expect(flying.y).toBeLessThan(ship.y);
  });

  test("a missile touching a planet stops at its surface and hands the turn over", () => {
    const match = createMatch(33);
    const shooter = activePlayer(match);
    const ship = activeShip(match);
    const planet = planetAt(400, ship.y, 8, 25);
    withPlanets(match, [planet]);
    const shooterAim = activeAim(match);
    fire(match);

    stepUntilShotEnds(match, 200);

    const stopped = missile(match)!;
    const distanceToCentre = Math.sqrt((stopped.x - planet.x) ** 2 + (stopped.y - planet.y) ** 2);
    expect(distanceToCentre).toBeCloseTo(planet.radius, 9);
    expect(trails(match).at(-1)!.to).toEqual({ x: stopped.x, y: stopped.y });
    expect(phase(match)).toBe("aiming");
    expect(activePlayer(match)).not.toBe(shooter);
    expect(ships(match)[shooter].aim).toEqual(shooterAim);
  });

  test("each player keeps their own aim between their shots", () => {
    const match = withShipsAt(withPlanets(createMatch(34), []), 100, 500);
    const first = activePlayer(match);
    adjustAim(match, { angle: 10, power: 50 });
    const firstAim = activeAim(match);
    fire(match);
    stepUntilShotEnds(match, 500);
    adjustAim(match, { angle: -6, power: 20 });
    const secondAim = activeAim(match);
    fire(match);
    stepUntilShotEnds(match, 500);

    expect(activePlayer(match)).toBe(first);
    expect(activeAim(match)).toEqual(firstAim);
    expect(ships(match)[inactivePlayer(match)].aim).toEqual(secondAim);
  });

  test("leaving the tracking area ends the shot and hands the turn over", () => {
    const match = withPlanets(createMatch(35), []);
    const shooter = activePlayer(match);
    adjustAim(match, { angle: 0, power: 250 });
    fire(match);

    stepUntilShotEnds(match, 200);

    const lost = missile(match)!;
    const outside = lost.x < -800 || lost.x >= 1600 || lost.y < -600 || lost.y >= 1200;
    expect(outside).toBe(true);
    expect(phase(match)).toBe("aiming");
    expect(activePlayer(match)).not.toBe(shooter);
  });

  test("same seed and same fire commands yield identical match state", () => {
    const play = () => {
      const match = createMatch(98765);
      adjustAim(match, { angle: -14, power: 75 });
      fire(match);
      for (let i = 0; i < 300; i++) {
        step(match);
        if (phase(match) === "aiming") {
          adjustAim(match, { angle: 7, power: -20 });
          fire(match);
        }
      }
      return observableState(match);
    };

    expect(play()).toEqual(play());
  });
});

describe("leaving the playing area", () => {
  test("zoom-view flag is set exactly while the missile is outside the playing area", () => {
    const match = withPlanets(createMatch(51), []);
    aimAt(match, 0, 100);
    expect(isZoomViewShown(match)).toBe(false);
    fire(match);
    const flagHistory: boolean[] = [];

    while (phase(match) === "inFlight") {
      expect(isZoomViewShown(match)).toBe(!isInsidePlayingArea(missile(match)!));
      flagHistory.push(isZoomViewShown(match));
      step(match);
    }

    expect(flagHistory).toContain(false);
    expect(flagHistory).toContain(true);
    expect(isZoomViewShown(match)).toBe(false);
  });

  test("an off-screen missile keeps flying before timeout until it leaves the tracking area", () => {
    const match = withPlanets(createMatch(52), []);
    aimAt(match, 0, 100);
    fire(match);
    let stepsOffScreenInFlight = 0;

    while (phase(match) === "inFlight") {
      step(match);
      if (phase(match) === "inFlight" && isZoomViewShown(match)) {
        stepsOffScreenInFlight++;
        expect(isTimedOut(match)).toBe(false);
      }
    }

    expect(stepsOffScreenInFlight).toBeGreaterThan(0);
    expect(missile(match)!.y).toBeLessThan(-600);
  });

  test("the timeout counts down once per step and is reached after 750 steps", () => {
    const match = withPlanets(createMatch(53), []);
    aimAt(match, 0, 0);
    fire(match);

    expect(timeoutCountdown(match)).toBe(750);
    step(match);
    expect(timeoutCountdown(match)).toBe(749);
    for (let i = 0; i < 749; i++) {
      step(match);
    }
    expect(timeoutCountdown(match)).toBe(0);
    expect(isTimedOut(match)).toBe(false);
    step(match);
    expect(timeoutCountdown(match)).toBe(-1);
    expect(isTimedOut(match)).toBe(true);
  });

  test("a timed-out missile inside the playing area keeps flying", () => {
    const match = withPlanets(createMatch(54), []);
    aimAt(match, 0, 0);
    fire(match);

    for (let i = 0; i < 1000; i++) {
      step(match);
    }

    expect(isTimedOut(match)).toBe(true);
    expect(phase(match)).toBe("inFlight");
    expect(isInsidePlayingArea(missile(match)!)).toBe(true);
  });

  test("after timeout the shot ends as soon as the missile leaves the playing area", () => {
    const match = withPlanets(createMatch(55), []);
    const shooter = activePlayer(match);
    aimAt(match, 0, 1);
    fire(match);

    stepUntilShotEnds(match, 6000);

    const lost = missile(match)!;
    expect(isTimedOut(match)).toBe(true);
    expect(lost.y).toBeLessThan(0);
    expect(lost.y).toBeGreaterThanOrEqual(-0.1 - 1e-9);
    expect(phase(match)).toBe("aiming");
    expect(activePlayer(match)).not.toBe(shooter);
  });
});

describe("ship hits", () => {
  test("a missile reaching the opposing ship is a hit that ends the round", () => {
    const match = facingShips(createMatch(61));
    const shooter = activePlayer(match);
    const target = inactivePlayer(match);

    hitOpponent(match, 100);

    const stopped = missile(match)!;
    expect(phase(match)).toBe("roundOver");
    expect(lastRoundResult(match)).toMatchObject({ outcome: "hit", shooter, hitShip: target });
    expect(distanceBetween(stopped, ships(match)[target])).toBeLessThanOrEqual(14);
    expect(trails(match).at(-1)!.to).toEqual({ x: stopped.x, y: stopped.y });
  });

  test("a fast missile cannot pass through a ship between two steps", () => {
    const match = facingShips(createMatch(62));
    const target = inactivePlayer(match);

    hitOpponent(match, 350);

    const distance = distanceBetween(missile(match)!, ships(match)[target]);
    expect(phase(match)).toBe("roundOver");
    expect(lastRoundResult(match)!.hitShip).toBe(target);
    expect(distance).toBeLessThanOrEqual(14);
    expect(distance).toBeGreaterThan(14 - 3.5);
  });

  test("a missile curving back into the shooter's own ship is a self-hit", () => {
    const match = createMatch(63);
    const shooter = activePlayer(match);

    hitOwnShip(match);

    expect(phase(match)).toBe("roundOver");
    expect(lastRoundResult(match)).toMatchObject({ outcome: "selfHit", shooter, hitShip: shooter });
    expect(distanceBetween(missile(match)!, ships(match)[shooter])).toBeLessThanOrEqual(14);
  });

  test("attempts are counted per player within the round", () => {
    const match = facingShips(createMatch(64));
    const first = activePlayer(match);
    const second = inactivePlayer(match);

    missShot(match);
    missShot(match);
    missShot(match);

    expect(attempts(match)[first]).toBe(2);
    expect(attempts(match)[second]).toBe(1);
  });

  test("steps since the round ended are counted while the round is over", () => {
    const match = facingShips(createMatch(65));
    hitOpponent(match, 100);

    expect(stepsSinceRoundOver(match)).toBe(0);
    step(match);
    step(match);
    step(match);
    expect(stepsSinceRoundOver(match)).toBe(3);
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
    const match = facingShips(createMatch(71));
    const shooter = activePlayer(match);
    const target = inactivePlayer(match);

    hitOpponentOnAttempt(match, attempt, 100);

    const expectedChange = 1500 + bonus - 500;
    expect(attempts(match)[shooter]).toBe(attempt);
    expect(lastRoundResult(match)).toMatchObject({
      outcome: "hit",
      baseScore: 1500,
      quickHitBonus: bonus,
      powerPenalty: 500,
      scoreChange: expectedChange,
    });
    expect(scores(match)[shooter]).toBe(expectedChange);
    expect(scores(match)[target]).toBe(0);
  });

  test("five times the power of the hitting shot is deducted from a hit", () => {
    const match = facingShips(createMatch(72));
    const shooter = activePlayer(match);

    hitOpponent(match, 200);

    expect(lastRoundResult(match)!.powerPenalty).toBe(1000);
    expect(scores(match)[shooter]).toBe(1500 + 500 - 1000);
  });

  test("a self-hit deducts 2000 from the shooter only", () => {
    const match = createMatch(73);
    const shooter = activePlayer(match);
    const other = inactivePlayer(match);

    hitOwnShip(match);

    expect(lastRoundResult(match)!.scoreChange).toBe(-2000);
    expect(scores(match)[shooter]).toBe(-2000);
    expect(scores(match)[other]).toBe(0);
  });
});

describe("round end and next round", () => {
  test("adjustAim has no effect while the round is over", () => {
    const match = facingShips(createMatch(81));
    hitOpponent(match, 100);
    const aimsBefore = { left: { ...ships(match).left.aim }, right: { ...ships(match).right.aim } };

    adjustAim(match, { angle: 5, power: 25 });

    expect(ships(match).left.aim).toEqual(aimsBefore.left);
    expect(ships(match).right.aim).toEqual(aimsBefore.right);
    expect(phase(match)).toBe("roundOver");
  });

  test("fire during round over starts the next round with a new layout, default aims and cleared trails", () => {
    const match = facingShips(createMatch(82));
    hitOpponent(match, 100);
    const scoresBefore = { ...scores(match) };
    for (let i = 0; i < 10; i++) {
      step(match);
    }

    fire(match);

    expect(phase(match)).toBe("aiming");
    expect(roundNumber(match)).toBe(2);
    expect(roundStepCount(match)).toBe(0);
    expect(trails(match)).toEqual([]);
    expect(missile(match)).toBeUndefined();
    expect(attempts(match)).toEqual({ left: 0, right: 0 });
    expect(ships(match).left.aim).toEqual({ angle: 90, power: 100 });
    expect(ships(match).right.aim).toEqual({ angle: 270, power: 100 });
    expect(planets(match).length).toBeGreaterThanOrEqual(2);
    expect(scores(match)).toEqual(scoresBefore);
  });

  test("the hit player has the lower score and shoots first in the next round", () => {
    const match = facingShips(createMatch(83));
    const target = inactivePlayer(match);
    hitOpponent(match, 100);

    fire(match);

    expect(activePlayer(match)).toBe(target);
  });

  test("a player who hit their own ship has the lower score and shoots first in the next round", () => {
    const match = createMatch(84);
    const shooter = activePlayer(match);
    hitOwnShip(match);

    fire(match);

    expect(activePlayer(match)).toBe(shooter);
  });

  test("on tied scores the player next in alternation shoots first in the next round", () => {
    const match = facingShips(createMatch(85));
    const shooter = activePlayer(match);
    hitOpponentOnAttempt(match, 3, 320);
    expect(scores(match)).toEqual({ left: 0, right: 0 });

    fire(match);

    expect(activePlayer(match)).not.toBe(shooter);
  });

  test("rounds continue without limit and replay identically from the same seed", () => {
    const play = () => {
      const match = createMatch(4242);
      for (let round = 0; round < 6; round++) {
        facingShips(match);
        hitOpponent(match, 100 + 10 * round);
        fire(match);
      }
      return observableState(match);
    };

    const first = play();

    expect(first.roundNumber).toBe(7);
    expect(first.phase).toBe("aiming");
    expect(play()).toEqual(first);
  });
});
