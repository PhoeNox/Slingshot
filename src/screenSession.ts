// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAttractMode, stepAttractMode, type AttractMode } from "./core/attract";
import type { Point } from "./core/flight";
import { createMatch, matchView, step, type Match } from "./core/match";
import { describeAttractFrame, describeFrame, type DisplaySettings, type FrameItem } from "./frame";
import type { Screen } from "./navigation";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";

export interface ScreenSession {
  screen: Screen;
  match: Match | undefined;
  attract: AttractMode | undefined;
}

const ATTRACT_PLAYING_SCREENS: ReadonlySet<Screen> = new Set(["mainMenu", "settings"]);

export function createScreenSession(): ScreenSession {
  return { screen: "mainMenu", match: undefined, attract: undefined };
}

export function enterScreen(session: ScreenSession, screen: Screen, seed: number): void {
  session.screen = screen;
  if (screen === "match") {
    session.match = createMatch(seed);
    session.attract = undefined;
  } else {
    session.match = undefined;
    session.attract ??= createAttractMode(seed);
  }
}

export function stepScreenSession(session: ScreenSession, reducedMotion: boolean): void {
  if (session.match !== undefined) {
    step(session.match);
  } else if (ATTRACT_PLAYING_SCREENS.has(session.screen) && !reducedMotion) {
    stepAttractMode(session.attract!);
  }
}

export function describeScreenSessionFrame(session: ScreenSession, display: Readonly<DisplaySettings>): FrameItem[] {
  if (session.match !== undefined) {
    const view = matchView(session.match);
    return describeFrame(view, display);
  }
  const attractView = matchView(session.attract!.match);
  return describeAttractFrame(attractView, display);
}

export function screenSessionShake(session: ScreenSession, reducedMotion: boolean, random: () => number): Readonly<Point> {
  if (reducedMotion || session.match === undefined) {
    return NO_SHAKE;
  }
  const view = matchView(session.match);
  return screenShakeOffset(view, random);
}
