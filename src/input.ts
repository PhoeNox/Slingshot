import type { AimDelta } from "./core/match";

interface KeyRepeat {
  heldCode: string | undefined;
  shiftHeld: boolean;
  timer: number | undefined;
}

const ANGLE_STEP = 2;
const POWER_STEP = 10;
const COARSE_ANGLE_STEP = 5;
const COARSE_POWER_STEP = 25;
const REPEAT_DELAY_MS = 250;
const REPEAT_INTERVAL_MS = 30;

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

const SCROLL_KEYS = new Set(["Space"]);

export function bindAimKeys(target: Window, adjustAim: (delta: AimDelta) => void): void {
  const repeat: KeyRepeat = { heldCode: undefined, shiftHeld: false, timer: undefined };

  const applyHeldKey = () => {
    const delta = aimDeltaFor(repeat.heldCode!, repeat.shiftHeld);
    adjustAim(delta);
  };
  const repeatHeldKey = () => {
    applyHeldKey();
    repeat.timer = target.setTimeout(repeatHeldKey, REPEAT_INTERVAL_MS);
  };
  const releaseHeldKey = () => {
    target.clearTimeout(repeat.timer);
    repeat.heldCode = undefined;
  };

  target.addEventListener("keydown", (event) => {
    repeat.shiftHeld = event.shiftKey;
    if (!isHandledKey(event.code)) {
      return;
    }
    event.preventDefault();
    if (event.repeat || !(event.code in AIM_DIRECTIONS)) {
      return;
    }
    releaseHeldKey();
    repeat.heldCode = event.code;
    applyHeldKey();
    repeat.timer = target.setTimeout(repeatHeldKey, REPEAT_DELAY_MS);
  });
  target.addEventListener("keyup", (event) => {
    repeat.shiftHeld = event.shiftKey;
    if (event.code === repeat.heldCode) {
      releaseHeldKey();
    }
  });
  target.addEventListener("blur", releaseHeldKey);
}

function isHandledKey(code: string): boolean {
  return code in AIM_DIRECTIONS || SCROLL_KEYS.has(code);
}

function aimDeltaFor(code: string, coarse: boolean): AimDelta {
  const direction = AIM_DIRECTIONS[code];
  const angleStep = coarse ? COARSE_ANGLE_STEP : ANGLE_STEP;
  const powerStep = coarse ? COARSE_POWER_STEP : POWER_STEP;
  return { angle: direction.angle * angleStep, power: direction.power * powerStep };
}
