// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  RELEASED_AIM_KEY_REPEAT,
  stepAimKeyRepeat,
  type AimKeyInput,
  type AimKeyRepeat,
  type AimKeyRepeatStep,
} from "./aimKeyRepeat";
import type { Point } from "./core/flight";
import type { PlayedMatch } from "./playedMatch";
import { RELEASED_TOUCH_AIM, stepTouchAim, type TouchAim, type TouchAimInput, type TouchAimStep } from "./touchAim";

export interface InputClock {
  now: () => number;
  startTimer: (callback: () => void, delayMs: number) => number;
  cancelTimer: (timer: number) => void;
}

export interface PlayedMatchSource {
  readonly played: PlayedMatch;
}

export interface KeyPress {
  code: string;
  shiftKey: boolean;
  repeat: boolean;
}

export interface KeyRelease {
  code: string;
  shiftKey: boolean;
}

export interface PlayerInput {
  keyDown: (key: Readonly<KeyPress>) => boolean;
  keyUp: (key: Readonly<KeyRelease>) => void;
  pointerDown: (pointerId: number, position: Readonly<Point>) => void;
  pointerMove: (pointerId: number, position: Readonly<Point>) => void;
  pointerUp: (pointerId: number) => void;
  pointerCancel: (pointerId: number) => void;
  blur: () => void;
}

interface PlayerInputState {
  repeat: AimKeyRepeat;
  timer: number | undefined;
  touch: TouchAim;
  touchedMatch: PlayedMatch | undefined;
}

export function createPlayerInput(source: PlayedMatchSource, clock: InputClock): PlayerInput {
  const state: PlayerInputState = {
    repeat: RELEASED_AIM_KEY_REPEAT,
    timer: undefined,
    touch: RELEASED_TOUCH_AIM,
    touchedMatch: undefined,
  };
  const applyKey = (input: AimKeyInput): AimKeyRepeatStep => {
    const step = stepAimKeyRepeat(state.repeat, input, clock.now());
    state.repeat = step.repeat;
    rescheduleRepeat(state, clock, step.nextTickInMs, tick);
    playStep(source.played, step);
    return step;
  };
  const tick = () => {
    state.timer = undefined;
    const input: AimKeyInput = { kind: "tick", matchActive: source.played.takesInput };
    applyKey(input);
  };
  const applyTouch = (input: TouchAimInput) => {
    const step = stepTouchAim(state.touch, input);
    state.touch = step.touch;
    playStep(source.played, step);
  };
  return {
    keyDown: (key) => {
      const input: AimKeyInput = { kind: "keyDown", ...key, matchActive: source.played.takesInput };
      return applyKey(input).consumesKey;
    },
    keyUp: (key) => {
      const input: AimKeyInput = { kind: "keyUp", ...key };
      applyKey(input);
    },
    pointerDown: (pointerId, position) => {
      const played = source.played;
      if (state.touch.pointerId === undefined) {
        state.touchedMatch = played;
      }
      const input: TouchAimInput = {
        kind: "pointerDown",
        pointerId,
        position,
        side: played.aimingSide(),
        matchActive: played.takesInput,
      };
      applyTouch(input);
    },
    pointerMove: (pointerId, position) => {
      const input: TouchAimInput = {
        kind: "pointerMove",
        pointerId,
        position,
        side: source.played.aimingSide(),
        matchActive: isTouchedMatchPlayed(state, source),
      };
      applyTouch(input);
    },
    pointerUp: (pointerId) => {
      const input: TouchAimInput = { kind: "pointerUp", pointerId, matchActive: isTouchedMatchPlayed(state, source) };
      applyTouch(input);
    },
    pointerCancel: (pointerId) => {
      const input: TouchAimInput = { kind: "pointerCancel", pointerId };
      applyTouch(input);
    },
    blur: () => {
      const keyInput: AimKeyInput = { kind: "blur" };
      applyKey(keyInput);
      const touchInput: TouchAimInput = { kind: "blur" };
      applyTouch(touchInput);
    },
  };
}

function rescheduleRepeat(
  state: PlayerInputState,
  clock: InputClock,
  nextTickInMs: number | undefined,
  tick: () => void,
): void {
  if (state.timer !== undefined) {
    clock.cancelTimer(state.timer);
  }
  state.timer = nextTickInMs === undefined ? undefined : clock.startTimer(tick, nextTickInMs);
}

function isTouchedMatchPlayed(state: Readonly<PlayerInputState>, source: PlayedMatchSource): boolean {
  return source.played === state.touchedMatch && source.played.takesInput;
}

function playStep(played: PlayedMatch, step: Readonly<AimKeyRepeatStep | TouchAimStep>): void {
  if (step.aimDelta) {
    played.aim(step.aimDelta);
  }
  if (step.fire) {
    played.fire();
  }
}
