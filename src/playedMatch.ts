// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { stepAttractMode, type AttractMode } from "./core/attract";
import {
  activeSide,
  adjustAim,
  fire,
  isAiming,
  matchView,
  startNextRound,
  step,
  type AimDelta,
  type Match,
  type MatchView,
} from "./core/match";
import type { Side } from "./core/round";
import { ATTRACT_VIEWER, HOT_SEAT_VIEWER, type Viewer } from "./frame";
import type { RemoteNotice } from "./lockstep";
import { playsAttractMode, type Screen } from "./navigation";

export interface PlayedMatchStep {
  readonly steppedView: MatchView | undefined;
  readonly returnsToMainMenu: boolean;
}

export interface PlayedMatch {
  readonly viewer: Readonly<Viewer>;
  readonly shakes: boolean;
  readonly takesInput: boolean;
  aimingSide: () => Side | undefined;
  aim: (delta: AimDelta) => void;
  fire: () => void;
  step: (reducedMotion: boolean) => PlayedMatchStep;
  view: () => MatchView | undefined;
  notice: () => RemoteNotice | undefined;
  leave: () => void;
}

const UNSTEPPED: PlayedMatchStep = { steppedView: undefined, returnsToMainMenu: false };

const ignore = () => {};
const noNotice = () => undefined;
const noSide = () => undefined;

export function playHotSeat(match: Match): PlayedMatch {
  return {
    viewer: HOT_SEAT_VIEWER,
    shakes: true,
    takesInput: true,
    aimingSide: () => hotSeatAimingSide(match),
    aim: (delta) => adjustAim(match, delta),
    fire: () => fireHotSeat(match),
    step: () => stepHotSeat(match),
    view: () => matchView(match),
    notice: noNotice,
    leave: ignore,
  };
}

function hotSeatAimingSide(match: Readonly<Match>): Side | undefined {
  return isAiming(match) ? activeSide(match) : undefined;
}

function fireHotSeat(match: Match): void {
  if (!startNextRound(match)) {
    fire(match);
  }
}

function stepHotSeat(match: Match): PlayedMatchStep {
  step(match);
  const steppedView = matchView(match);
  return { steppedView, returnsToMainMenu: false };
}

export function playAttractMode(attract: AttractMode, screen: Screen): PlayedMatch {
  return {
    viewer: ATTRACT_VIEWER,
    shakes: false,
    takesInput: false,
    aimingSide: noSide,
    aim: ignore,
    fire: ignore,
    step: (reducedMotion) => stepShownAttractMode(attract, screen, reducedMotion),
    view: () => matchView(attract.match),
    notice: noNotice,
    leave: ignore,
  };
}

function stepShownAttractMode(attract: AttractMode, screen: Screen, reducedMotion: boolean): PlayedMatchStep {
  if (!playsAttractMode(screen, reducedMotion)) {
    return UNSTEPPED;
  }
  stepAttractMode(attract);
  const steppedView = matchView(attract.match);
  return { steppedView, returnsToMainMenu: false };
}
