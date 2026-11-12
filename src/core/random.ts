// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

export function randomInt(rng: Rng, min: number, max: number): number {
  rng.state = (rng.state + 0x6d2b79f5) | 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const unitInterval = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return min + Math.floor(unitInterval * (max - min + 1));
}
