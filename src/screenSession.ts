// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAttractMode, stepAttractMode, type AttractMode } from "./core/attract";
import type { Point } from "./core/flight";
import { createMatch, matchView, step, type Match, type MatchRules } from "./core/match";
import { burstDebris, stepDebris, type Particle } from "./debris";
import { describeAttractFrame, describeFrame, type DisplaySettings, type FrameItem } from "./frame";
import type { Screen } from "./navigation";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";

export interface ScreenSession {
  screen: Screen;
  match: Match | undefined;
  attract: AttractMode | undefined;
  debris: Particle[];
  random: () => number;
}

const ATTRACT_PLAYING_SCREENS: ReadonlySet<Screen> = new Set(["mainMenu", "settings"]);

export function createScreenSession(random: () => number): ScreenSession {
  return { screen: "mainMenu", match: undefined, attract: undefined, debris: [], random };
}

export function enterScreen(
  session: ScreenSession,
  screen: Screen,
  seed: number,
  matchRules: Readonly<MatchRules>,
): void {
  session.screen = screen;
  if (screen === "match") {
    session.match = createMatch(seed, undefined, matchRules);
    session.attract = undefined;
    session.debris = [];
  } else {
    if (session.match !== undefined) {
      session.debris = [];
    }
    session.match = undefined;
    session.attract ??= createAttractMode(seed);
  }
}

export function stepScreenSession(session: ScreenSession, reducedMotion: boolean): void {
  const steppedMatch = stepShownMatch(session, reducedMotion);
  if (reducedMotion) {
    session.debris = [];
  } else if (steppedMatch !== undefined) {
    advanceDebris(session, steppedMatch);
  }
}

function stepShownMatch(session: ScreenSession, reducedMotion: boolean): Match | undefined {
  if (session.match !== undefined) {
    step(session.match);
    return session.match;
  }
  if (ATTRACT_PLAYING_SCREENS.has(session.screen) && !reducedMotion) {
    stepAttractMode(session.attract!);
    return session.attract!.match;
  }
  return undefined;
}

function advanceDebris(session: ScreenSession, match: Match): void {
  const view = matchView(match);
  const stepped = stepDebris(session.debris, view.planets, view.rules.bounce, session.random);
  const burst = view.impact === undefined ? [] : burstDebris(view.impact, "large", view.rules.bounce, session.random);
  session.debris = [...stepped, ...burst];
}

export function describeScreenSessionFrame(session: ScreenSession, display: Readonly<DisplaySettings>): FrameItem[] {
  if (session.match !== undefined) {
    const view = matchView(session.match);
    return describeFrame(view, display, session.debris);
  }
  const attractView = matchView(session.attract!.match);
  return describeAttractFrame(attractView, display, session.debris);
}

export function screenSessionShake(session: ScreenSession, reducedMotion: boolean, random: () => number): Readonly<Point> {
  if (reducedMotion || session.match === undefined) {
    return NO_SHAKE;
  }
  const view = matchView(session.match);
  return screenShakeOffset(view, random);
}
