// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import type { Planet } from "./core/round";
import { createMatch, DEFAULT_MATCH_RULES, matchView, type MatchView } from "./core/match";
import {
  advanceDebris,
  burstDebris,
  BURST_COUNT,
  PARTICLE_LIFETIME,
  particleAlpha,
  stepDebris,
  type Particle,
  type ParticleSize,
} from "./debris";

const PLANET: Planet = { sprite: 1, mass: 8, radius: 30, x: 400, y: 300 };
const IMPACT = { x: 200, y: 150 };

const centredRandom = () => 0.5;
const zeroRandom = () => 0;

function particleAt(size: ParticleSize, x: number, y: number, vx: number, vy: number): Particle {
  return { x, y, vx, vy, size, stepsLeft: PARTICLE_LIFETIME[size] };
}

function stepTimes(particles: Particle[], steps: number, bounce = false): Particle[] {
  let current = particles;
  for (let i = 0; i < steps; i++) {
    current = stepDebris(current, [], bounce, centredRandom);
  }
  return current;
}

function viewWith(impact: MatchView["impact"], bounce = false): MatchView {
  const view = matchView(createMatch(1));
  const rules = { ...DEFAULT_MATCH_RULES, bounce };
  return { ...view, planets: [], impact, rules };
}

describe("advanceDebris", () => {
  test("throws a large burst from the view's impact", () => {
    const debris = advanceDebris([], viewWith(IMPACT), centredRandom);

    expect(debris).toHaveLength(BURST_COUNT.large);
    expect(debris.every((particle) => particle.size === "large")).toBe(true);
    expect(debris.every((particle) => particle.x === IMPACT.x && particle.y === IMPACT.y)).toBe(true);
  });

  test("throws a halved burst under bounce", () => {
    const debris = advanceDebris([], viewWith(IMPACT, true), centredRandom);

    expect(debris).toHaveLength(BURST_COUNT.large / 2);
  });

  test("only moves the particles in flight without an impact", () => {
    const particle = particleAt("large", 100, 100, 1, 0);

    const debris = advanceDebris([particle], viewWith(undefined), centredRandom);

    expect(debris).toHaveLength(1);
    expect(debris[0].x).toBeGreaterThan(100);
  });

  test("keeps the particles in flight alongside a new burst", () => {
    const particle = particleAt("small", 100, 100, 1, 0);

    const debris = advanceDebris([particle], viewWith(IMPACT), centredRandom);

    expect(debris).toHaveLength(1 + BURST_COUNT.large);
    expect(debris[0]).toBe(particle);
  });
});

describe("burstDebris", () => {
  test("throws about thirty large particles from the impact point", () => {
    const burst = burstDebris(IMPACT, "large", false, centredRandom);

    expect(burst).toHaveLength(BURST_COUNT.large);
    expect(burst.every((particle) => particle.x === IMPACT.x && particle.y === IMPACT.y)).toBe(true);
    expect(burst.every((particle) => particle.size === "large")).toBe(true);
  });

  test("throws half as many particles under bounce", () => {
    expect(burstDebris(IMPACT, "large", true, centredRandom)).toHaveLength(BURST_COUNT.large / 2);
    expect(burstDebris(IMPACT, "small", true, centredRandom)).toHaveLength(BURST_COUNT.small / 2);
  });

  test("sends particles off in a random direction at a random speed", () => {
    const [particle] = burstDebris(IMPACT, "large", false, zeroRandom);

    expect(particle.vx).toBeGreaterThan(0);
    expect(particle.vy).toBe(0);
  });

  test("starts particles fully visible", () => {
    const burst = burstDebris(IMPACT, "small", false, centredRandom);

    expect(burst.every((particle) => particleAlpha(particle) === 1)).toBe(true);
  });
});

describe("stepDebris", () => {
  test("moves particles along their velocity in empty space", () => {
    const [moved] = stepDebris([particleAt("large", 100, 100, 3, -2)], [], false, centredRandom);

    expect(moved).toMatchObject({ x: 103, y: 98, vx: 3, vy: -2 });
  });

  test("bends particles towards a planet", () => {
    const [bent] = stepDebris([particleAt("large", 300, 300, 0, 2)], [PLANET], false, centredRandom);

    expect(bent.vx).toBeGreaterThan(0);
  });

  test("splits a large particle hitting a planet into small ones at the contact point", () => {
    const next = stepDebris([particleAt("large", 365, 300, 10, 0)], [PLANET], false, centredRandom);

    expect(next).toHaveLength(BURST_COUNT.small);
    for (const particle of next) {
      expect(particle.size).toBe("small");
      expect(particle.x).toBeCloseTo(PLANET.x - PLANET.radius, 9);
      expect(particle.y).toBeCloseTo(PLANET.y, 9);
    }
  });

  test("splits into half as many small particles under bounce", () => {
    const next = stepDebris([particleAt("large", 365, 300, 10, 0)], [PLANET], true, centredRandom);

    expect(next).toHaveLength(BURST_COUNT.small / 2);
  });

  test("removes a small particle hitting a planet", () => {
    expect(stepDebris([particleAt("small", 365, 300, 10, 0)], [PLANET], false, centredRandom)).toEqual([]);
  });

  test("removes a particle leaving the tracking area", () => {
    expect(stepDebris([particleAt("large", 1599, 300, 5, 0)], [], false, centredRandom)).toEqual([]);
  });

  test("reflects a particle off a playing-area edge under bounce", () => {
    const [reflected] = stepDebris([particleAt("large", 798, 300, 5, 0)], [], true, centredRandom);

    expect(reflected).toMatchObject({ x: 800, y: 300, vx: -5, vy: 0 });
  });

  test("lets a particle cross the playing-area edges without bounce", () => {
    const [crossed] = stepDebris([particleAt("large", 798, 300, 5, 0)], [], false, centredRandom);

    expect(crossed).toMatchObject({ x: 803, vx: 5 });
  });

  test("fades particles out over their lifetime", () => {
    const [faded] = stepTimes([particleAt("large", 100, 100, 0.1, 0)], 1);

    expect(particleAlpha(faded)).toBeLessThan(1);
    expect(particleAlpha(faded)).toBeGreaterThan(0);
  });

  test.each(["large", "small"] as const)("removes %s particles at the end of their lifetime", (size) => {
    const lastStep = stepTimes([particleAt(size, 100, 100, 0.1, 0)], PARTICLE_LIFETIME[size] - 1);
    const expired = stepTimes([particleAt(size, 100, 100, 0.1, 0)], PARTICLE_LIFETIME[size]);

    expect(lastStep).toHaveLength(1);
    expect(expired).toEqual([]);
  });
});
