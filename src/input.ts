// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Point } from "./core/flight";
import { createPlayerInput, type InputClock, type KeyPress, type KeyRelease, type PlayedMatchSource } from "./playerInput";

const TOUCH_POINTER_TYPES = new Set(["touch", "pen"]);

export function bindPlayerInput(target: Window, source: PlayedMatchSource): void {
  const clock: InputClock = {
    now: () => target.performance.now(),
    startTimer: (callback, delayMs) => target.setTimeout(callback, delayMs),
    cancelTimer: (timer) => target.clearTimeout(timer),
  };
  const input = createPlayerInput(source, clock);

  target.addEventListener("keydown", (event) => {
    const key: KeyPress = { code: event.code, shiftKey: event.shiftKey, repeat: event.repeat };
    if (input.keyDown(key)) {
      event.preventDefault();
    }
  });
  target.addEventListener("keyup", (event) => {
    const key: KeyRelease = { code: event.code, shiftKey: event.shiftKey };
    input.keyUp(key);
  });
  target.addEventListener("pointerdown", (event) => {
    if (isTouchPointer(event) && !startsOnButton(event)) {
      input.pointerDown(event.pointerId, positionOf(event));
    }
  });
  target.addEventListener("pointermove", (event) => {
    input.pointerMove(event.pointerId, positionOf(event));
  });
  target.addEventListener("pointerup", (event) => {
    input.pointerUp(event.pointerId);
  });
  target.addEventListener("pointercancel", (event) => {
    input.pointerCancel(event.pointerId);
  });
  target.addEventListener("blur", () => {
    input.blur();
  });
}

function isTouchPointer(event: PointerEvent): boolean {
  return TOUCH_POINTER_TYPES.has(event.pointerType);
}

function startsOnButton(event: PointerEvent): boolean {
  return event.target instanceof Element && event.target.closest("button") !== null;
}

function positionOf(event: PointerEvent): Point {
  return { x: event.clientX, y: event.clientY };
}

export function bindEscape(target: Window, onEscape: () => void): void {
  target.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      onEscape();
    }
  });
}
