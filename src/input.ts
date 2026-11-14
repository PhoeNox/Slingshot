// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { RELEASED_AIM_KEY_REPEAT, stepAimKeyRepeat, type AimKeyInput, type AimKeyRepeatStep } from "./aimKeyRepeat";
import type { AimDelta } from "./core/match";
import type { Side } from "./core/round";
import { RELEASED_TOUCH_AIM, stepTouchAim, type TouchAimInput } from "./touchAim";

const TOUCH_POINTER_TYPES = new Set(["touch", "pen"]);

export function bindControls(
  target: Window,
  isMatchActive: () => boolean,
  adjustAim: (delta: AimDelta) => void,
  fire: () => void,
): void {
  let repeat = RELEASED_AIM_KEY_REPEAT;
  let timer: number | undefined;

  const apply = (input: AimKeyInput): AimKeyRepeatStep => {
    const now = target.performance.now();
    const step = stepAimKeyRepeat(repeat, input, now);
    repeat = step.repeat;
    target.clearTimeout(timer);
    timer = undefined;
    if (step.nextTickInMs !== undefined) {
      timer = target.setTimeout(tick, step.nextTickInMs);
    }
    if (step.aimDelta) {
      adjustAim(step.aimDelta);
    }
    if (step.fire) {
      fire();
    }
    return step;
  };
  const tick = () => {
    const input: AimKeyInput = { kind: "tick", matchActive: isMatchActive() };
    apply(input);
  };

  target.addEventListener("keydown", (event) => {
    const input: AimKeyInput = {
      kind: "keyDown",
      code: event.code,
      shiftKey: event.shiftKey,
      repeat: event.repeat,
      matchActive: isMatchActive(),
    };
    const step = apply(input);
    if (step.consumesKey) {
      event.preventDefault();
    }
  });
  target.addEventListener("keyup", (event) => {
    const input: AimKeyInput = { kind: "keyUp", code: event.code, shiftKey: event.shiftKey };
    apply(input);
  });
  target.addEventListener("blur", () => {
    const input: AimKeyInput = { kind: "blur" };
    apply(input);
  });
}

export function bindTouchControls(
  target: Window,
  isMatchActive: () => boolean,
  aimingSide: () => Side | undefined,
  adjustAim: (delta: AimDelta) => void,
  fire: () => void,
): void {
  let touch = RELEASED_TOUCH_AIM;

  const apply = (input: TouchAimInput) => {
    const step = stepTouchAim(touch, input);
    touch = step.touch;
    if (step.aimDelta) {
      adjustAim(step.aimDelta);
    }
    if (step.fire) {
      fire();
    }
  };

  target.addEventListener("pointerdown", (event) => {
    if (!isTouchPointer(event) || startsOnButton(event)) {
      return;
    }
    const input: TouchAimInput = {
      kind: "pointerDown",
      pointerId: event.pointerId,
      position: { x: event.clientX, y: event.clientY },
      side: aimingSide(),
      matchActive: isMatchActive(),
    };
    apply(input);
  });
  target.addEventListener("pointermove", (event) => {
    const input: TouchAimInput = {
      kind: "pointerMove",
      pointerId: event.pointerId,
      position: { x: event.clientX, y: event.clientY },
      side: aimingSide(),
      matchActive: isMatchActive(),
    };
    apply(input);
  });
  target.addEventListener("pointerup", (event) => {
    const input: TouchAimInput = { kind: "pointerUp", pointerId: event.pointerId, matchActive: isMatchActive() };
    apply(input);
  });
  target.addEventListener("pointercancel", (event) => {
    const input: TouchAimInput = { kind: "pointerCancel", pointerId: event.pointerId };
    apply(input);
  });
  target.addEventListener("blur", () => {
    const input: TouchAimInput = { kind: "blur" };
    apply(input);
  });
}

function isTouchPointer(event: PointerEvent): boolean {
  return TOUCH_POINTER_TYPES.has(event.pointerType);
}

function startsOnButton(event: PointerEvent): boolean {
  return event.target instanceof Element && event.target.closest("button") !== null;
}

export function bindEscape(target: Window, onEscape: () => void): void {
  target.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      onEscape();
    }
  });
}
