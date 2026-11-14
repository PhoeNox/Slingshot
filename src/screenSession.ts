// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAttractMode, type AttractMode } from "./core/attract";
import type { Point } from "./core/flight";
import { createMatch, type AimDelta, type Match, type MatchRules, type MatchView } from "./core/match";
import { advanceDebris, type Particle } from "./debris";
import { describeFrame, describeRemoteNotice, type DisplaySettings } from "./frame";
import type { FrameItem } from "./frameItems";
import type { RemoteNotice } from "./lockstep";
import type { RouteScreen } from "./navigation";
import type { PeerLink } from "./peerConnection";
import { playAttractMode, playHotSeat, type PlayedMatch } from "./playedMatch";
import { playRemoteMatch, startRemoteMatch, type RemoteMatch, type RemoteRole } from "./remoteMatch";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";

export type MenuScreen = Exclude<RouteScreen, "match">;

export type ScreenState =
  | { screen: "match"; match: Match }
  | { screen: "remoteMatch"; remote: RemoteMatch }
  | { screen: MenuScreen; attract: AttractMode };

type RouteScreenState = Exclude<ScreenState, { screen: "remoteMatch" }>;

export interface ScreenSession {
  state: ScreenState;
  played: PlayedMatch;
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
  const played = playAttractMode(attract, "mainMenu");
  return { state: { screen: "mainMenu", attract }, played, debris: [], random };
}

export function enterScreen(
  session: ScreenSession,
  screen: RouteScreen,
  seed: number,
  matchRules: Readonly<MatchRules>,
): void {
  session.played.leave();
  if (screen === "match" || !("attract" in session.state)) {
    session.debris = [];
  }
  const state = nextScreenState(session.state, screen, seed, matchRules);
  session.state = state;
  session.played = playedMatchOf(state);
}

function nextScreenState(state: ScreenState, screen: RouteScreen, seed: number, matchRules: Readonly<MatchRules>): RouteScreenState {
  if (screen === "match") {
    const match = createMatch(seed, undefined, matchRules);
    return { screen, match };
  }
  const attract = "attract" in state ? state.attract : createAttractMode(seed);
  return { screen, attract };
}

function playedMatchOf(state: RouteScreenState): PlayedMatch {
  return state.screen === "match" ? playHotSeat(state.match) : playAttractMode(state.attract, state.screen);
}

export function enterRemoteMatch(
  session: ScreenSession,
  role: RemoteRole,
  link: PeerLink,
  seed: number,
  matchRules: Readonly<MatchRules>,
): void {
  session.played.leave();
  const remote = startRemoteMatch(role, link, seed, matchRules);
  session.debris = [];
  session.state = { screen: "remoteMatch", remote };
  session.played = playRemoteMatch(remote);
}

export function isMatchActive(session: ScreenSession): boolean {
  return session.state.screen === "match" || session.state.screen === "remoteMatch";
}

export function aimMatch(session: ScreenSession, delta: AimDelta): void {
  session.played.aim(delta);
}

export function fireMatch(session: ScreenSession): void {
  session.played.fire();
}

export function stepScreenSession(session: ScreenSession, reducedMotion: boolean): ScreenSessionStep {
  const played = session.played.step(reducedMotion);
  advanceSessionDebris(session, played.steppedView, reducedMotion);
  return played.returnsToMainMenu ? "mainMenu" : "stay";
}

function advanceSessionDebris(session: ScreenSession, steppedView: MatchView | undefined, reducedMotion: boolean): void {
  if (reducedMotion) {
    session.debris = [];
  } else if (steppedView !== undefined) {
    session.debris = advanceDebris(session.debris, steppedView, session.random);
  }
}

export function describeScreenSessionFrame(
  session: ScreenSession,
  display: Readonly<DisplaySettings>,
  reducedMotion: boolean,
): ScreenSessionFrame {
  const played = session.played;
  const view = played.view();
  const matchItems = view === undefined ? [] : describeFrame(view, display, session.debris, played.viewer);
  const noticeItems = noticeItemsOf(played.notice());
  const shakes = played.shakes && !reducedMotion;
  const shake = shakes && view !== undefined ? screenShakeOffset(view, session.random) : NO_SHAKE;
  return { items: [...matchItems, ...noticeItems], shake };
}

function noticeItemsOf(notice: RemoteNotice | undefined): FrameItem[] {
  return notice === undefined ? [] : describeRemoteNotice(notice);
}
