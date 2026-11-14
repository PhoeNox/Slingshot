// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { ANGLE_STEP, POWER_STEP } from "./aimKeyRepeat";
import type { Point } from "./core/flight";
import type { AimDelta } from "./core/match";
import type { Side } from "./core/round";

type AimAxis = "angle" | "power";

export interface TouchAim {
  pointerId: number | undefined;
  origin: Point;
  side: Side | undefined;
  axis: AimAxis | undefined;
  appliedSteps: number;
}

interface PointerDownInput {
  kind: "pointerDown";
  pointerId: number;
  position: Point;
  side: Side | undefined;
  matchActive: boolean;
}

interface PointerMoveInput {
  kind: "pointerMove";
  pointerId: number;
  position: Point;
  side: Side | undefined;
  matchActive: boolean;
}

interface PointerUpInput {
  kind: "pointerUp";
  pointerId: number;
  matchActive: boolean;
}

export type TouchAimInput =
  | PointerDownInput
  | PointerMoveInput
  | PointerUpInput
  | { kind: "pointerCancel"; pointerId: number }
  | { kind: "blur" };

export interface TouchAimStep {
  touch: TouchAim;
  aimDelta: AimDelta | undefined;
  fire: boolean;
}

export const DRAG_THRESHOLD_PX = 10;
export const ANGLE_STEP_PX = 8;
export const POWER_STEP_PX = 10;

export const RELEASED_TOUCH_AIM: TouchAim = {
  pointerId: undefined,
  origin: { x: 0, y: 0 },
  side: undefined,
  axis: undefined,
  appliedSteps: 0,
};

export function stepTouchAim(touch: TouchAim, input: TouchAimInput): TouchAimStep {
  switch (input.kind) {
    case "pointerDown":
      return pressPointer(touch, input);
    case "pointerMove":
      return movePointer(touch, input);
    case "pointerUp":
      return liftPointer(touch, input);
    case "pointerCancel":
      return input.pointerId === touch.pointerId ? released() : withoutAction(touch);
    case "blur":
      return released();
  }
}

function pressPointer(touch: TouchAim, input: PointerDownInput): TouchAimStep {
  if (!input.matchActive || touch.pointerId !== undefined) {
    return withoutAction(touch);
  }
  const pressed = { pointerId: input.pointerId, origin: input.position, side: input.side, axis: undefined, appliedSteps: 0 };
  return withoutAction(pressed);
}

function movePointer(touch: TouchAim, input: PointerMoveInput): TouchAimStep {
  if (input.pointerId !== touch.pointerId) {
    return withoutAction(touch);
  }
  if (!input.matchActive) {
    return released();
  }
  const offset = { x: input.position.x - touch.origin.x, y: input.position.y - touch.origin.y };
  const axis = touch.axis ?? lockedAxis(offset);
  if (axis === undefined) {
    return withoutAction(touch);
  }
  const locked = { ...touch, axis };
  if (touch.side === undefined || input.side !== touch.side) {
    return withoutAction(locked);
  }
  const steps = stepsAlong(axis, offset, touch.side);
  if (steps === touch.appliedSteps) {
    return withoutAction(locked);
  }
  const aimDelta = aimDeltaFor(axis, steps - touch.appliedSteps);
  const applied = { ...locked, appliedSteps: steps };
  return { touch: applied, aimDelta, fire: false };
}

function liftPointer(touch: TouchAim, input: PointerUpInput): TouchAimStep {
  if (input.pointerId !== touch.pointerId) {
    return withoutAction(touch);
  }
  const fire = input.matchActive && touch.axis === undefined;
  return { ...released(), fire };
}

function lockedAxis(offset: Readonly<Point>): AimAxis | undefined {
  if (Math.hypot(offset.x, offset.y) < DRAG_THRESHOLD_PX) {
    return undefined;
  }
  return Math.abs(offset.y) >= Math.abs(offset.x) ? "angle" : "power";
}

function stepsAlong(axis: AimAxis, offset: Readonly<Point>, side: Side): number {
  if (axis === "angle") {
    const raised = -offset.y;
    const raisingTurn = side === "left" ? -1 : 1;
    return raisingTurn * Math.trunc(raised / ANGLE_STEP_PX);
  }
  const towardOpponent = side === "left" ? offset.x : -offset.x;
  return Math.trunc(towardOpponent / POWER_STEP_PX);
}

function aimDeltaFor(axis: AimAxis, steps: number): AimDelta {
  return axis === "angle" ? { angle: steps * ANGLE_STEP, power: 0 } : { angle: 0, power: steps * POWER_STEP };
}

function released(): TouchAimStep {
  return withoutAction(RELEASED_TOUCH_AIM);
}

function withoutAction(touch: TouchAim): TouchAimStep {
  return { touch, aimDelta: undefined, fire: false };
}
