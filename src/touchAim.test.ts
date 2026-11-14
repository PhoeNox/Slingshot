// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { ANGLE_STEP, POWER_STEP } from "./aimKeyRepeat";
import type { Side } from "./core/round";
import {
  ANGLE_STEP_PX,
  DRAG_THRESHOLD_PX,
  POWER_STEP_PX,
  RELEASED_TOUCH_AIM,
  stepTouchAim,
  type TouchAim,
  type TouchAimInput,
  type TouchAimStep,
} from "./touchAim";

const ORIGIN = { x: 100, y: 100 };

function pointerDown(options: { pointerId?: number; side?: Side | undefined; matchActive?: boolean } = {}): TouchAimInput {
  return { kind: "pointerDown", pointerId: 1, position: ORIGIN, side: "left", matchActive: true, ...options };
}

function pointerMove(dx: number, dy: number, options: { pointerId?: number; side?: Side | undefined } = {}): TouchAimInput {
  const position = { x: ORIGIN.x + dx, y: ORIGIN.y + dy };
  return { kind: "pointerMove", pointerId: 1, position, side: "left", matchActive: true, ...options };
}

function pointerUp(options: { pointerId?: number } = {}): TouchAimInput {
  return { kind: "pointerUp", pointerId: 1, matchActive: true, ...options };
}

function run(inputs: TouchAimInput[]): TouchAimStep[] {
  let touch: TouchAim = RELEASED_TOUCH_AIM;
  return inputs.map((input) => {
    const step = stepTouchAim(touch, input);
    touch = step.touch;
    return step;
  });
}

function last(steps: TouchAimStep[]): TouchAimStep {
  return steps[steps.length - 1];
}

function totalDelta(steps: TouchAimStep[]): { angle: number; power: number } {
  const total = { angle: 0, power: 0 };
  for (const step of steps) {
    total.angle += step.aimDelta?.angle ?? 0;
    total.power += step.aimDelta?.power ?? 0;
  }
  return total;
}

describe("tap", () => {
  test("a touch released below the drag threshold fires", () => {
    const steps = run([pointerDown(), pointerMove(3, 4), pointerUp()]);

    expect(last(steps).fire).toBe(true);
    expect(totalDelta(steps)).toEqual({ angle: 0, power: 0 });
  });

  test("fires even without an aiming side, so a tap starts the next round", () => {
    const steps = run([pointerDown({ side: undefined }), pointerUp()]);

    expect(last(steps).fire).toBe(true);
  });

  test("a drag past the threshold does not fire on release", () => {
    const steps = run([pointerDown(), pointerMove(0, DRAG_THRESHOLD_PX), pointerMove(0, 0), pointerUp()]);

    expect(last(steps).fire).toBe(false);
  });

  test("a touch started outside a match is ignored", () => {
    const steps = run([pointerDown({ matchActive: false }), pointerUp()]);

    expect(last(steps).fire).toBe(false);
  });
});

describe("angle drag", () => {
  test("dragging up raises the left ship's barrel by turning it counter-clockwise", () => {
    const steps = run([pointerDown(), pointerMove(0, -ANGLE_STEP_PX * 3)]);

    expect(totalDelta(steps)).toEqual({ angle: -3 * ANGLE_STEP, power: 0 });
  });

  test("dragging up raises the right ship's barrel by turning it clockwise", () => {
    const steps = run([pointerDown({ side: "right" }), pointerMove(0, -ANGLE_STEP_PX * 3, { side: "right" })]);

    expect(totalDelta(steps)).toEqual({ angle: 3 * ANGLE_STEP, power: 0 });
  });

  test("dragging down lowers the barrel", () => {
    const steps = run([pointerDown(), pointerMove(0, ANGLE_STEP_PX * 2)]);

    expect(totalDelta(steps)).toEqual({ angle: 2 * ANGLE_STEP, power: 0 });
  });
});

describe("power drag", () => {
  test("dragging toward the opponent adds power for the left ship", () => {
    const steps = run([pointerDown(), pointerMove(POWER_STEP_PX * 2, 0)]);

    expect(totalDelta(steps)).toEqual({ angle: 0, power: 2 * POWER_STEP });
  });

  test("dragging toward the opponent adds power for the right ship", () => {
    const steps = run([pointerDown({ side: "right" }), pointerMove(-POWER_STEP_PX * 2, 0, { side: "right" })]);

    expect(totalDelta(steps)).toEqual({ angle: 0, power: 2 * POWER_STEP });
  });

  test("dragging away from the opponent removes power", () => {
    const steps = run([pointerDown(), pointerMove(-POWER_STEP_PX * 2, 0)]);

    expect(totalDelta(steps)).toEqual({ angle: 0, power: -2 * POWER_STEP });
  });
});

describe("quantisation", () => {
  test("emits one keyboard step per full step of pixels, carrying the remainder within the drag", () => {
    const halfStep = POWER_STEP_PX / 2;
    const steps = run([
      pointerDown(),
      pointerMove(POWER_STEP_PX + halfStep, 0),
      pointerMove(POWER_STEP_PX * 2, 0),
    ]);

    expect(steps[1].aimDelta).toEqual({ angle: 0, power: POWER_STEP });
    expect(steps[2].aimDelta).toEqual({ angle: 0, power: POWER_STEP });
  });

  test("moving back undoes steps already applied", () => {
    const steps = run([pointerDown(), pointerMove(POWER_STEP_PX * 3, 0), pointerMove(POWER_STEP_PX, 0)]);

    expect(steps[2].aimDelta).toEqual({ angle: 0, power: -2 * POWER_STEP });
  });

  test("a new drag starts without the previous drag's remainder", () => {
    const partial = POWER_STEP_PX - 1;
    const steps = run([
      pointerDown(),
      pointerMove(partial, 0),
      pointerUp(),
      pointerDown(),
      pointerMove(partial, 0),
    ]);

    expect(totalDelta(steps)).toEqual({ angle: 0, power: 0 });
  });
});

describe("axis lock", () => {
  test("a mostly vertical drag never changes power", () => {
    const steps = run([pointerDown(), pointerMove(2, -DRAG_THRESHOLD_PX), pointerMove(POWER_STEP_PX * 5, -ANGLE_STEP_PX * 2)]);

    expect(totalDelta(steps)).toEqual({ angle: -2 * ANGLE_STEP, power: 0 });
  });

  test("a mostly horizontal drag never changes the angle", () => {
    const steps = run([pointerDown(), pointerMove(DRAG_THRESHOLD_PX, 2), pointerMove(POWER_STEP_PX, ANGLE_STEP_PX * 5)]);

    expect(totalDelta(steps)).toEqual({ angle: 0, power: POWER_STEP });
  });

  test("a new drag picks its axis again", () => {
    const steps = run([
      pointerDown(),
      pointerMove(0, ANGLE_STEP_PX * 2),
      pointerUp(),
      pointerDown(),
      pointerMove(POWER_STEP_PX * 2, 0),
    ]);

    expect(totalDelta(steps)).toEqual({ angle: 2 * ANGLE_STEP, power: 2 * POWER_STEP });
  });
});

describe("pointers", () => {
  test("a second simultaneous touch is ignored", () => {
    const steps = run([
      pointerDown(),
      pointerDown({ pointerId: 2 }),
      pointerMove(POWER_STEP_PX * 2, 0, { pointerId: 2 }),
      pointerUp({ pointerId: 2 }),
    ]);

    expect(totalDelta(steps)).toEqual({ angle: 0, power: 0 });
    expect(last(steps).fire).toBe(false);
  });

  test("the first touch still fires after a second one came and went", () => {
    const steps = run([pointerDown(), pointerDown({ pointerId: 2 }), pointerUp({ pointerId: 2 }), pointerUp()]);

    expect(last(steps).fire).toBe(true);
  });
});

describe("aiming side", () => {
  test("a drag without an aiming side changes nothing", () => {
    const steps = run([pointerDown({ side: undefined }), pointerMove(POWER_STEP_PX * 2, 0, { side: undefined })]);

    expect(totalDelta(steps)).toEqual({ angle: 0, power: 0 });
  });
});

describe("cancel", () => {
  test("a cancelled touch does not fire and keeps the aim already applied", () => {
    const steps = run([
      pointerDown(),
      pointerMove(POWER_STEP_PX, 0),
      { kind: "pointerCancel", pointerId: 1 },
      pointerUp(),
    ]);

    expect(totalDelta(steps)).toEqual({ angle: 0, power: POWER_STEP });
    expect(steps.some((step) => step.fire)).toBe(false);
  });

  test("a cancel of another pointer leaves the touch in place", () => {
    const steps = run([pointerDown(), { kind: "pointerCancel", pointerId: 2 }, pointerUp()]);

    expect(last(steps).fire).toBe(true);
  });

  test("blur ends the touch without firing", () => {
    const steps = run([pointerDown(), { kind: "blur" }, pointerUp()]);

    expect(last(steps).fire).toBe(false);
  });
});
