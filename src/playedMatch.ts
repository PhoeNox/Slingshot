// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { stepAttractMode, type AttractMode } from "./core/attract";
import { adjustAim, fire, matchView, step, type AimDelta, type Match, type MatchView } from "./core/match";
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

export function playHotSeat(match: Match): PlayedMatch {
  return {
    viewer: HOT_SEAT_VIEWER,
    shakes: true,
    aim: (delta) => adjustAim(match, delta),
    fire: () => fire(match),
    step: () => stepHotSeat(match),
    view: () => matchView(match),
    notice: noNotice,
    leave: ignore,
  };
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
