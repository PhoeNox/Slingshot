// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Segment } from "./core/flight";

interface RoundBanner {
  text: string;
  fontSize: number;
  alpha: number;
}

interface FadingSegment {
  segment: Readonly<Segment>;
  alpha: number;
}

interface Bloom {
  radius: number;
  alpha: number;
}

const AFTERGLOW_STEPS = 45;

const LATEST_TRAIL_ALPHA = 0.6;
const OLDEST_TRAIL_ALPHA = 0.15;
const TRAIL_FADE_PER_SHOT = 0.75;

const EXPLOSION_STEPS = 6;
const EXPLOSION_SIZE_FACTOR = 100 / 9;
const BLOOM_STEPS = 8;
const BLOOM_START_RADIUS = 60;
const BLOOM_GROWTH_PER_STEP = 15;

const BANNER_START_INTENSITY = 100;
const BANNER_END_INTENSITY = 30;
const BANNER_DECAY_PER_STEP = 1.04;
const BANNER_FONT_SIZE = 100;
const BANNER_GROWTH_DIVISOR = 25;

export function afterglowSegments(trail: readonly Readonly<Segment>[], stepsFlown: number): FadingSegment[] {
  const count = Math.min(stepsFlown, AFTERGLOW_STEPS);
  const recent = trail.slice(trail.length - count);
  return recent.map((segment, index) => ({
    segment,
    alpha: (AFTERGLOW_STEPS - count + index + 1) / AFTERGLOW_STEPS,
  }));
}

export function trailAlpha(shotsSince: number): number {
  return Math.max(LATEST_TRAIL_ALPHA * TRAIL_FADE_PER_SHOT ** shotsSince, OLDEST_TRAIL_ALPHA);
}

export function explosionSize(stepsSinceHit: number): number | null {
  const explosionStep = stepsSinceHit + 1;
  if (explosionStep >= EXPLOSION_STEPS) {
    return null;
  }
  return Math.floor(explosionStep * (EXPLOSION_STEPS - explosionStep) * EXPLOSION_SIZE_FACTOR);
}

export function explosionBloom(stepsSinceHit: number): Bloom | null {
  if (stepsSinceHit >= BLOOM_STEPS) {
    return null;
  }
  return {
    radius: BLOOM_START_RADIUS + stepsSinceHit * BLOOM_GROWTH_PER_STEP,
    alpha: 1 - stepsSinceHit / BLOOM_STEPS,
  };
}

export function roundBanner(round: number, stepsIntoRound: number): RoundBanner | null {
  const intensity = BANNER_START_INTENSITY / BANNER_DECAY_PER_STEP ** stepsIntoRound;
  if (intensity <= BANNER_END_INTENSITY) {
    return null;
  }
  return {
    text: `Round ${round}`,
    fontSize: (BANNER_FONT_SIZE * (BANNER_START_INTENSITY - intensity)) / BANNER_GROWTH_DIVISOR,
    alpha: (2 * intensity - 60) / 255,
  };
}
