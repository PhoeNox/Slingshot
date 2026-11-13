// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAttractMode, stepAttractMode, type AttractMode } from "./core/attract";
import type { Point } from "./core/flight";
import { adjustAim, createMatch, fire, matchView, step, type AimDelta, type Match, type MatchRules } from "./core/match";
import { advanceDebris, type Particle } from "./debris";
import { describeFrame, type DisplaySettings, type FrameItem } from "./frame";
import { playsAttractMode, type Screen } from "./navigation";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";

export type MenuScreen = Exclude<Screen, "match">;

export type ScreenState =
  | { screen: "match"; match: Match }
  | { screen: MenuScreen; attract: AttractMode };

export interface ScreenSession {
  state: ScreenState;
  debris: Particle[];
  random: () => number;
}

export interface ScreenSessionFrame {
  items: FrameItem[];
  shake: Readonly<Point>;
}

export function createScreenSession(seed: number, random: () => number): ScreenSession {
  const attract = createAttractMode(seed);
  return { state: { screen: "mainMenu", attract }, debris: [], random };
}

export function enterScreen(
  session: ScreenSession,
  screen: Screen,
  seed: number,
  matchRules: Readonly<MatchRules>,
): void {
  if (screen === "match" || session.state.screen === "match") {
    session.debris = [];
  }
  session.state = nextScreenState(session.state, screen, seed, matchRules);
}

function nextScreenState(state: ScreenState, screen: Screen, seed: number, matchRules: Readonly<MatchRules>): ScreenState {
  if (screen === "match") {
    const match = createMatch(seed, undefined, matchRules);
    return { screen, match };
  }
  const attract = state.screen === "match" ? createAttractMode(seed) : state.attract;
  return { screen, attract };
}

export function isMatchActive(session: ScreenSession): boolean {
  return session.state.screen === "match";
}

export function aimMatch(session: ScreenSession, delta: AimDelta): void {
  if (session.state.screen === "match") {
    adjustAim(session.state.match, delta);
  }
}

export function fireMatch(session: ScreenSession): void {
  if (session.state.screen === "match") {
    fire(session.state.match);
  }
}

export function stepScreenSession(session: ScreenSession, reducedMotion: boolean): void {
  const steppedMatch = stepShownMatch(session.state, reducedMotion);
  if (reducedMotion) {
    session.debris = [];
  } else if (steppedMatch !== undefined) {
    const view = matchView(steppedMatch);
    session.debris = advanceDebris(session.debris, view, session.random);
  }
}

function stepShownMatch(state: ScreenState, reducedMotion: boolean): Match | undefined {
  if (state.screen === "match") {
    step(state.match);
    return state.match;
  }
  if (playsAttractMode(state.screen, reducedMotion)) {
    stepAttractMode(state.attract);
    return state.attract.match;
  }
  return undefined;
}

export function describeScreenSessionFrame(
  session: ScreenSession,
  display: Readonly<DisplaySettings>,
  reducedMotion: boolean,
): ScreenSessionFrame {
  const state = session.state;
  if (state.screen === "match") {
    const view = matchView(state.match);
    const items = describeFrame(view, display, session.debris, "match");
    const shake = reducedMotion ? NO_SHAKE : screenShakeOffset(view, session.random);
    return { items, shake };
  }
  const attractView = matchView(state.attract.match);
  const items = describeFrame(attractView, display, session.debris, "attract");
  return { items, shake: NO_SHAKE };
}
