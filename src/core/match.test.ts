import { describe, expect, test } from "vitest";
import {
  activePlayer,
  adjustAim,
  createMatch,
  phase,
  planets,
  roundNumber,
  roundStepCount,
  scores,
  ships,
  step,
  type Match,
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
  };
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
