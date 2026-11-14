// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAttractMode, stepAttractMode, type AttractMode } from "./core/attract";
import type { Point } from "./core/flight";
import { adjustAim, createMatch, fire, matchView, step, type AimDelta, type Match, type MatchRules } from "./core/match";
import { advanceDebris, type Particle } from "./debris";
import { describeFrame, describeRemoteNotice, type DisplaySettings, type FrameItem } from "./frame";
import { playsAttractMode, type RouteScreen } from "./navigation";
import type { PeerLink } from "./peerConnection";
import {
  aimRemoteMatch,
  fireRemoteMatch,
  leaveRemoteMatch,
  remoteNotice,
  startRemoteMatch,
  stepRemoteMatch,
  type RemoteMatch,
  type RemoteRole,
} from "./remoteMatch";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";
import type { Settings } from "./settings";

export type MenuScreen = Exclude<RouteScreen, "match">;

export type ScreenState =
  | { screen: "match"; match: Match }
  | { screen: "remoteMatch"; remote: RemoteMatch }
  | { screen: MenuScreen; attract: AttractMode };

export interface ScreenSession {
  state: ScreenState;
  debris: Particle[];
  random: () => number;
}

export type ScreenSessionStep = "stay" | "mainMenu";

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
  screen: RouteScreen,
  seed: number,
  matchRules: Readonly<MatchRules>,
): void {
  leaveShownRemoteMatch(session);
  if (screen === "match" || !("attract" in session.state)) {
    session.debris = [];
  }
  session.state = nextScreenState(session.state, screen, seed, matchRules);
}

function nextScreenState(state: ScreenState, screen: RouteScreen, seed: number, matchRules: Readonly<MatchRules>): ScreenState {
  if (screen === "match") {
    const match = createMatch(seed, undefined, matchRules);
    return { screen, match };
  }
  const attract = "attract" in state ? state.attract : createAttractMode(seed);
  return { screen, attract };
}

export function enterRemoteMatch(
  session: ScreenSession,
  role: RemoteRole,
  link: PeerLink,
  settings: Readonly<Settings>,
): void {
  leaveShownRemoteMatch(session);
  const remote = startRemoteMatch(role, link, settings, session.random);
  session.debris = [];
  session.state = { screen: "remoteMatch", remote };
}

function leaveShownRemoteMatch(session: ScreenSession): void {
  if (session.state.screen === "remoteMatch") {
    leaveRemoteMatch(session.state.remote);
  }
}

export function isMatchActive(session: ScreenSession): boolean {
  return session.state.screen === "match" || session.state.screen === "remoteMatch";
}

export function aimMatch(session: ScreenSession, delta: AimDelta): void {
  if (session.state.screen === "match") {
    adjustAim(session.state.match, delta);
  } else if (session.state.screen === "remoteMatch") {
    aimRemoteMatch(session.state.remote, delta);
  }
}

export function fireMatch(session: ScreenSession): void {
  if (session.state.screen === "match") {
    fire(session.state.match);
  } else if (session.state.screen === "remoteMatch") {
    fireRemoteMatch(session.state.remote);
  }
}

export function stepScreenSession(session: ScreenSession, reducedMotion: boolean): ScreenSessionStep {
  const state = session.state;
  if (state.screen === "remoteMatch") {
    const remoteStep = stepRemoteMatch(state.remote);
    advanceSessionDebris(session, remoteStep.match, reducedMotion);
    return remoteStep.returnsToMainMenu ? "mainMenu" : "stay";
  }
  const steppedMatch = stepShownMatch(state, reducedMotion);
  advanceSessionDebris(session, steppedMatch, reducedMotion);
  return "stay";
}

function advanceSessionDebris(session: ScreenSession, steppedMatch: Readonly<Match> | undefined, reducedMotion: boolean): void {
  if (reducedMotion) {
    session.debris = [];
  } else if (steppedMatch !== undefined) {
    const view = matchView(steppedMatch);
    session.debris = advanceDebris(session.debris, view, session.random);
  }
}

function stepShownMatch(state: Exclude<ScreenState, { screen: "remoteMatch" }>, reducedMotion: boolean): Match | undefined {
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
  if (state.screen === "remoteMatch") {
    return describeRemoteMatchFrame(session, state.remote, display, reducedMotion);
  }
  const attractView = matchView(state.attract.match);
  const items = describeFrame(attractView, display, session.debris, "attract");
  return { items, shake: NO_SHAKE };
}

function describeRemoteMatchFrame(
  session: ScreenSession,
  remote: Readonly<RemoteMatch>,
  display: Readonly<DisplaySettings>,
  reducedMotion: boolean,
): ScreenSessionFrame {
  const notice = remoteNotice(remote);
  const noticeItems = notice === undefined ? [] : describeRemoteNotice(notice);
  if (remote.match === undefined) {
    return { items: noticeItems, shake: NO_SHAKE };
  }
  const view = matchView(remote.match);
  const matchItems = describeFrame(view, display, session.debris, "match", remote.localSide);
  const shake = reducedMotion ? NO_SHAKE : screenShakeOffset(view, session.random);
  return { items: [...matchItems, ...noticeItems], shake };
}
