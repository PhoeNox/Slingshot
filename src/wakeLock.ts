// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

export interface ScreenWakeLock {
  keepAwake: (wanted: boolean) => void;
}

export interface WakeLockTarget {
  navigator: { wakeLock?: Pick<WakeLock, "request"> };
  document: Pick<Document, "visibilityState">;
}

interface WakeLockState {
  wanted: boolean;
  requesting: boolean;
  refused: boolean;
  sentinel: WakeLockSentinel | undefined;
}

export function screenWakeLock(target: WakeLockTarget): ScreenWakeLock {
  const state: WakeLockState = { wanted: false, requesting: false, refused: false, sentinel: undefined };
  const adopt = (sentinel: WakeLockSentinel) => {
    state.requesting = false;
    state.sentinel = sentinel;
    if (!state.wanted) {
      release(state);
    }
  };
  const refuse = () => {
    state.requesting = false;
    state.refused = true;
  };
  const keepAwake = (wanted: boolean) => {
    state.wanted = wanted;
    if (!wanted) {
      state.refused = false;
      release(state);
      return;
    }
    if (needsRequest(state, target)) {
      state.requesting = true;
      target.navigator.wakeLock!.request("screen").then(adopt, refuse);
    }
  };
  return { keepAwake };
}

function needsRequest(state: Readonly<WakeLockState>, target: WakeLockTarget): boolean {
  const held = state.sentinel !== undefined && !state.sentinel.released;
  return !held
    && !state.requesting
    && !state.refused
    && target.navigator.wakeLock !== undefined
    && target.document.visibilityState === "visible";
}

function release(state: WakeLockState): void {
  void state.sentinel?.release();
  state.sentinel = undefined;
}
