// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Point } from "./core/flight";
import type { MatchView } from "./core/match";

export const NO_SHAKE: Readonly<Point> = { x: 0, y: 0 };

const SHAKE_STEPS = 10;
const SHAKE_AMPLITUDE = 6;

export function screenShakeOffset(view: MatchView, random: () => number): Readonly<Point> {
  if (view.phase.kind !== "roundOver" || view.phase.stepsSinceRoundOver >= SHAKE_STEPS) {
    return NO_SHAKE;
  }
  const amplitude = SHAKE_AMPLITUDE * (1 - view.phase.stepsSinceRoundOver / SHAKE_STEPS);
  return {
    x: (2 * random() - 1) * amplitude,
    y: (2 * random() - 1) * amplitude,
  };
}
