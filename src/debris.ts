// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  applyGravity,
  isInsideTrackingArea,
  planetEntryPoint,
  reflectOffEdges,
  type Body,
  type Point,
} from "./core/flight";
import type { Planet } from "./core/round";

export type ParticleSize = "large" | "small";

export interface Particle extends Body {
  size: ParticleSize;
  stepsLeft: number;
}

interface SpeedRange {
  min: number;
  max: number;
}

export const NO_DEBRIS: readonly Particle[] = [];

export const BURST_COUNT: Record<ParticleSize, number> = { large: 30, small: 20 };
export const PARTICLE_LIFETIME: Record<ParticleSize, number> = { large: 60, small: 30 };
const PARTICLE_SPEED: Record<ParticleSize, SpeedRange> = { large: { min: 1, max: 5 }, small: { min: 0.5, max: 2.5 } };
const BOUNCE_BURST_DIVISOR = 2;

export function burstDebris(
  centre: Readonly<Point>,
  size: ParticleSize,
  bounce: boolean,
  random: () => number,
): Particle[] {
  const count = burstCount(size, bounce);
  return Array.from({ length: count }, () => launchParticle(centre, size, random));
}

function burstCount(size: ParticleSize, bounce: boolean): number {
  return bounce ? BURST_COUNT[size] / BOUNCE_BURST_DIVISOR : BURST_COUNT[size];
}

function launchParticle(centre: Readonly<Point>, size: ParticleSize, random: () => number): Particle {
  const direction = 2 * Math.PI * random();
  const range = PARTICLE_SPEED[size];
  const speed = range.min + (range.max - range.min) * random();
  return {
    x: centre.x,
    y: centre.y,
    vx: speed * Math.cos(direction),
    vy: speed * Math.sin(direction),
    size,
    stepsLeft: PARTICLE_LIFETIME[size],
  };
}

export function stepDebris(
  particles: readonly Particle[],
  planets: readonly Readonly<Planet>[],
  bounce: boolean,
  random: () => number,
): Particle[] {
  const next: Particle[] = [];
  for (const particle of particles) {
    const contact = moveParticle(particle, planets, bounce);
    if (contact === undefined) {
      next.push(...survivors(particle, bounce));
    } else if (particle.size === "large") {
      next.push(...burstDebris(contact, "small", bounce, random));
    }
  }
  return next;
}

function moveParticle(particle: Particle, planets: readonly Readonly<Planet>[], bounce: boolean): Point | undefined {
  const from = { x: particle.x, y: particle.y };
  applyGravity(particle, planets);
  particle.x += particle.vx;
  particle.y += particle.vy;
  particle.stepsLeft--;
  const contact = planetEntryPoint(from, particle, planets);
  if (contact === undefined && bounce) {
    reflectOffEdges(particle, from);
  }
  return contact;
}

function survivors(particle: Particle, bounce: boolean): Particle[] {
  const tracked = bounce || isInsideTrackingArea(particle);
  return tracked && particle.stepsLeft > 0 ? [particle] : [];
}

export function particleAlpha(particle: Readonly<Particle>): number {
  return particle.stepsLeft / PARTICLE_LIFETIME[particle.size];
}
