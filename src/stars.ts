// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./core/playingArea";

export interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleDepth: number;
  twinklePeriodMs: number;
  twinklePhase: number;
  glows: boolean;
}

const PLAIN_STAR_COUNT = 220;
const GLOWING_STAR_COUNT = 6;
const MIN_SIZE = 1;
const MAX_SIZE = 3;
const GLOW_SIZE = 22;
const MIN_BRIGHTNESS = 0.35;
const MAX_BRIGHTNESS = 0.9;
const MIN_TWINKLE_DEPTH = 0.2;
const MAX_TWINKLE_DEPTH = 0.7;
const MIN_TWINKLE_PERIOD_MS = 1800;
const MAX_TWINKLE_PERIOD_MS = 6000;

export function generateStars(random: () => number): Star[] {
  const between = (min: number, max: number) => min + random() * (max - min);
  const createStar = (glows: boolean): Star => ({
    x: random() * PLAYING_AREA_WIDTH,
    y: random() * PLAYING_AREA_HEIGHT,
    size: glows ? GLOW_SIZE : between(MIN_SIZE, MAX_SIZE),
    brightness: glows ? MAX_BRIGHTNESS : between(MIN_BRIGHTNESS, MAX_BRIGHTNESS),
    twinkleDepth: between(MIN_TWINKLE_DEPTH, MAX_TWINKLE_DEPTH),
    twinklePeriodMs: between(MIN_TWINKLE_PERIOD_MS, MAX_TWINKLE_PERIOD_MS),
    twinklePhase: random() * 2 * Math.PI,
    glows,
  });
  const plainStars = Array.from({ length: PLAIN_STAR_COUNT }, () => createStar(false));
  const glowingStars = Array.from({ length: GLOWING_STAR_COUNT }, () => createStar(true));
  return [...plainStars, ...glowingStars];
}

export function starAlpha(star: Star, timeMs: number): number {
  const cycle = (2 * Math.PI * timeMs) / star.twinklePeriodMs + star.twinklePhase;
  const dimming = star.twinkleDepth * (0.5 + 0.5 * Math.sin(cycle));
  return star.brightness * (1 - dimming);
}
