// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { AimDelta } from "./core/match";

export interface AimKeyRepeat {
  heldCode: string | undefined;
  shiftHeld: boolean;
  nextTickAt: number | undefined;
}

interface KeyDownInput {
  kind: "keyDown";
  code: string;
  shiftKey: boolean;
  repeat: boolean;
  matchActive: boolean;
}

interface KeyUpInput {
  kind: "keyUp";
  code: string;
  shiftKey: boolean;
}

export type AimKeyInput =
  | KeyDownInput
  | KeyUpInput
  | { kind: "blur" }
  | { kind: "tick"; matchActive: boolean };

export interface AimKeyRepeatStep {
  repeat: AimKeyRepeat;
  aimDelta: AimDelta | undefined;
  fire: boolean;
  consumesKey: boolean;
  nextTickInMs: number | undefined;
}

export const ANGLE_STEP = 2;
export const POWER_STEP = 10;
export const COARSE_ANGLE_STEP = 5;
export const COARSE_POWER_STEP = 25;
export const REPEAT_DELAY_MS = 250;
export const REPEAT_INTERVAL_MS = 30;

const AIM_DIRECTIONS: Record<string, AimDelta> = {
  ArrowLeft: { angle: -1, power: 0 },
  KeyA: { angle: -1, power: 0 },
  ArrowRight: { angle: 1, power: 0 },
  KeyD: { angle: 1, power: 0 },
  ArrowUp: { angle: 0, power: 1 },
  KeyW: { angle: 0, power: 1 },
  ArrowDown: { angle: 0, power: -1 },
  KeyS: { angle: 0, power: -1 },
};

const FIRE_KEYS = new Set(["Space", "Enter"]);

export const RELEASED_AIM_KEY_REPEAT: AimKeyRepeat = { heldCode: undefined, shiftHeld: false, nextTickAt: undefined };

export function stepAimKeyRepeat(repeat: AimKeyRepeat, input: AimKeyInput, now: number): AimKeyRepeatStep {
  switch (input.kind) {
    case "keyDown":
      return pressKey(repeat, input, now);
    case "keyUp":
      return releaseKey(repeat, input, now);
    case "blur":
      return releaseHeldKey(repeat, now);
    case "tick":
      return repeatHeldKey(repeat, input.matchActive, now);
  }
}

function pressKey(repeat: AimKeyRepeat, input: KeyDownInput, now: number): AimKeyRepeatStep {
  const updated = { ...repeat, shiftHeld: input.shiftKey };
  const handled = input.code in AIM_DIRECTIONS || FIRE_KEYS.has(input.code);
  if (!input.matchActive || !handled) {
    return withoutAction(updated, now, false);
  }
  if (input.repeat) {
    return withoutAction(updated, now, true);
  }
  if (FIRE_KEYS.has(input.code)) {
    const consumed = withoutAction(updated, now, true);
    return { ...consumed, fire: true };
  }
  const held = { heldCode: input.code, shiftHeld: input.shiftKey, nextTickAt: now + REPEAT_DELAY_MS };
  return {
    repeat: held,
    aimDelta: aimDeltaFor(input.code, input.shiftKey),
    fire: false,
    consumesKey: true,
    nextTickInMs: REPEAT_DELAY_MS,
  };
}

function releaseKey(repeat: AimKeyRepeat, input: KeyUpInput, now: number): AimKeyRepeatStep {
  const updated = { ...repeat, shiftHeld: input.shiftKey };
  if (input.code !== repeat.heldCode) {
    return withoutAction(updated, now, false);
  }
  return releaseHeldKey(updated, now);
}

function releaseHeldKey(repeat: AimKeyRepeat, now: number): AimKeyRepeatStep {
  const released = { ...repeat, heldCode: undefined, nextTickAt: undefined };
  return withoutAction(released, now, false);
}

function repeatHeldKey(repeat: AimKeyRepeat, matchActive: boolean, now: number): AimKeyRepeatStep {
  if (!matchActive) {
    return releaseHeldKey(repeat, now);
  }
  const ticked = { ...repeat, nextTickAt: now + REPEAT_INTERVAL_MS };
  return {
    repeat: ticked,
    aimDelta: aimDeltaFor(repeat.heldCode!, repeat.shiftHeld),
    fire: false,
    consumesKey: false,
    nextTickInMs: REPEAT_INTERVAL_MS,
  };
}

function withoutAction(repeat: AimKeyRepeat, now: number, consumesKey: boolean): AimKeyRepeatStep {
  const nextTickInMs = repeat.nextTickAt === undefined ? undefined : repeat.nextTickAt - now;
  return { repeat, aimDelta: undefined, fire: false, consumesKey, nextTickInMs };
}

function aimDeltaFor(code: string, coarse: boolean): AimDelta {
  const direction = AIM_DIRECTIONS[code];
  const angleStep = coarse ? COARSE_ANGLE_STEP : ANGLE_STEP;
  const powerStep = coarse ? COARSE_POWER_STEP : POWER_STEP;
  return { angle: direction.angle * angleStep, power: direction.power * powerStep };
}
