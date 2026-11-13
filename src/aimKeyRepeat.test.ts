// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import {
  ANGLE_STEP,
  COARSE_ANGLE_STEP,
  COARSE_POWER_STEP,
  POWER_STEP,
  RELEASED_AIM_KEY_REPEAT,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  stepAimKeyRepeat,
  type AimKeyInput,
  type AimKeyRepeat,
} from "./aimKeyRepeat";

function keyDown(code: string, options: { shiftKey?: boolean; repeat?: boolean; matchActive?: boolean } = {}): AimKeyInput {
  return { kind: "keyDown", code, shiftKey: false, repeat: false, matchActive: true, ...options };
}

function keyUp(code: string, shiftKey = false): AimKeyInput {
  return { kind: "keyUp", code, shiftKey };
}

function tick(matchActive = true): AimKeyInput {
  return { kind: "tick", matchActive };
}

function heldAfterPress(code: string, now = 0): AimKeyRepeat {
  return stepAimKeyRepeat(RELEASED_AIM_KEY_REPEAT, keyDown(code), now).repeat;
}

describe("pressing an aim key", () => {
  test.each([
    ["ArrowLeft", { angle: -ANGLE_STEP, power: 0 }],
    ["KeyA", { angle: -ANGLE_STEP, power: 0 }],
    ["ArrowRight", { angle: ANGLE_STEP, power: 0 }],
    ["KeyD", { angle: ANGLE_STEP, power: 0 }],
    ["ArrowUp", { angle: 0, power: POWER_STEP }],
    ["KeyW", { angle: 0, power: POWER_STEP }],
    ["ArrowDown", { angle: 0, power: -POWER_STEP }],
    ["KeyS", { angle: 0, power: -POWER_STEP }],
  ])("%s applies one fine step", (code, delta) => {
    const step = stepAimKeyRepeat(RELEASED_AIM_KEY_REPEAT, keyDown(code), 0);
    expect(step.aimDelta).toEqual(delta);
    expect(step.consumesKey).toBe(true);
    expect(step.fire).toBe(false);
  });

  test.each([
    ["ArrowLeft", { angle: -COARSE_ANGLE_STEP, power: 0 }],
    ["ArrowUp", { angle: 0, power: COARSE_POWER_STEP }],
  ])("%s with Shift applies one coarse step", (code, delta) => {
    const step = stepAimKeyRepeat(RELEASED_AIM_KEY_REPEAT, keyDown(code, { shiftKey: true }), 0);
    expect(step.aimDelta).toEqual(delta);
  });

  test("schedules the first repeat after the repeat delay", () => {
    const step = stepAimKeyRepeat(RELEASED_AIM_KEY_REPEAT, keyDown("ArrowLeft"), 100);
    expect(step.nextTickInMs).toBe(REPEAT_DELAY_MS);
  });

  test("a second aim key takes over the held key and restarts the delay", () => {
    const held = heldAfterPress("ArrowLeft", 0);
    const step = stepAimKeyRepeat(held, keyDown("ArrowUp"), 100);
    expect(step.repeat.heldCode).toBe("ArrowUp");
    expect(step.aimDelta).toEqual({ angle: 0, power: POWER_STEP });
    expect(step.nextTickInMs).toBe(REPEAT_DELAY_MS);
  });
});

describe("holding an aim key", () => {
  test("repeats after the delay, then at the interval", () => {
    const held = heldAfterPress("ArrowRight", 0);
    const first = stepAimKeyRepeat(held, tick(), REPEAT_DELAY_MS);
    expect(first.aimDelta).toEqual({ angle: ANGLE_STEP, power: 0 });
    expect(first.nextTickInMs).toBe(REPEAT_INTERVAL_MS);
    const second = stepAimKeyRepeat(first.repeat, tick(), REPEAT_DELAY_MS + REPEAT_INTERVAL_MS);
    expect(second.aimDelta).toEqual({ angle: ANGLE_STEP, power: 0 });
    expect(second.nextTickInMs).toBe(REPEAT_INTERVAL_MS);
  });

  test("repeats use coarse steps once Shift is held", () => {
    const held = heldAfterPress("ArrowRight", 0);
    const shifted = stepAimKeyRepeat(held, keyDown("ShiftLeft", { shiftKey: true }), 10).repeat;
    const step = stepAimKeyRepeat(shifted, tick(), REPEAT_DELAY_MS);
    expect(step.aimDelta).toEqual({ angle: COARSE_ANGLE_STEP, power: 0 });
  });

  test("an unrelated key keeps the pending repeat on schedule", () => {
    const held = heldAfterPress("ArrowRight", 0);
    const step = stepAimKeyRepeat(held, keyUp("KeyQ"), 100);
    expect(step.repeat.heldCode).toBe("ArrowRight");
    expect(step.aimDelta).toBeUndefined();
    expect(step.nextTickInMs).toBe(REPEAT_DELAY_MS - 100);
  });
});

describe("stopping repeats", () => {
  test("releasing the held key stops repeats", () => {
    const held = heldAfterPress("ArrowDown", 0);
    const step = stepAimKeyRepeat(held, keyUp("ArrowDown"), 100);
    expect(step.repeat.heldCode).toBeUndefined();
    expect(step.aimDelta).toBeUndefined();
    expect(step.nextTickInMs).toBeUndefined();
  });

  test("blurring stops repeats", () => {
    const held = heldAfterPress("ArrowDown", 0);
    const step = stepAimKeyRepeat(held, { kind: "blur" }, 100);
    expect(step.repeat.heldCode).toBeUndefined();
    expect(step.nextTickInMs).toBeUndefined();
  });

  test("a tick without an active match stops repeats without applying", () => {
    const held = heldAfterPress("ArrowDown", 0);
    const step = stepAimKeyRepeat(held, tick(false), REPEAT_DELAY_MS);
    expect(step.repeat.heldCode).toBeUndefined();
    expect(step.aimDelta).toBeUndefined();
    expect(step.nextTickInMs).toBeUndefined();
  });
});

describe("fire keys", () => {
  test.each(["Space", "Enter"])("%s fires once without repeating", (code) => {
    const step = stepAimKeyRepeat(RELEASED_AIM_KEY_REPEAT, keyDown(code), 0);
    expect(step.fire).toBe(true);
    expect(step.consumesKey).toBe(true);
    expect(step.aimDelta).toBeUndefined();
    expect(step.repeat.heldCode).toBeUndefined();
    expect(step.nextTickInMs).toBeUndefined();
  });

  test("firing keeps a held aim key repeating on schedule", () => {
    const held = heldAfterPress("ArrowLeft", 0);
    const step = stepAimKeyRepeat(held, keyDown("Space"), 100);
    expect(step.fire).toBe(true);
    expect(step.repeat.heldCode).toBe("ArrowLeft");
    expect(step.nextTickInMs).toBe(REPEAT_DELAY_MS - 100);
  });
});

describe("ignored key events", () => {
  test.each(["ArrowLeft", "Space"])("auto-repeated %s is consumed but ignored", (code) => {
    const step = stepAimKeyRepeat(RELEASED_AIM_KEY_REPEAT, keyDown(code, { repeat: true }), 0);
    expect(step.consumesKey).toBe(true);
    expect(step.aimDelta).toBeUndefined();
    expect(step.fire).toBe(false);
    expect(step.repeat.heldCode).toBeUndefined();
  });

  test.each(["ArrowLeft", "Space"])("%s does nothing when no match is active", (code) => {
    const step = stepAimKeyRepeat(RELEASED_AIM_KEY_REPEAT, keyDown(code, { matchActive: false }), 0);
    expect(step.consumesKey).toBe(false);
    expect(step.aimDelta).toBeUndefined();
    expect(step.fire).toBe(false);
    expect(step.nextTickInMs).toBeUndefined();
  });

  test("an unhandled key is not consumed", () => {
    const step = stepAimKeyRepeat(RELEASED_AIM_KEY_REPEAT, keyDown("KeyQ"), 0);
    expect(step.consumesKey).toBe(false);
    expect(step.aimDelta).toBeUndefined();
  });
});
