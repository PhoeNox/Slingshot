// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { RELEASED_AIM_KEY_REPEAT, stepAimKeyRepeat, type AimKeyInput, type AimKeyRepeatStep } from "./aimKeyRepeat";
import type { AimDelta } from "./core/match";

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

export function bindEscape(target: Window, onEscape: () => void): void {
  target.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      onEscape();
    }
  });
}
