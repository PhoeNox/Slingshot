// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAttractMode } from "./core/attract";
import type { Point } from "./core/flight";
import { createMatch, type MatchRules, type MatchView } from "./core/match";
import { advanceDebris, type Particle } from "./debris";
import { describeFrame, describeRemoteNotice, type DisplaySettings } from "./frame";
import type { FrameItem } from "./frameItems";
import type { RemoteNotice } from "./lockstep";
import type { RouteScreen, Screen } from "./navigation";
import type { PeerLink } from "./peerConnection";
import { playAttractMode, playHotSeat, type PlayedMatch } from "./playedMatch";
import { playRemoteMatch, startRemoteMatch, type RemoteMatch, type RemoteRole } from "./remoteMatch";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";

export interface ScreenSession {
  screen: Screen;
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
  return { screen: "mainMenu", played, debris: [], random };
}

export function enterScreen(
  session: ScreenSession,
  screen: RouteScreen,
  seed: number,
  matchRules: Readonly<MatchRules>,
): void {
  const kept = keptPlayedMatch(session.played, screen);
  if (kept === undefined) {
    leavePlayedMatch(session);
  }
  session.screen = screen;
  session.played = kept ?? newPlayedMatch(screen, seed, matchRules);
}

function keptPlayedMatch(played: PlayedMatch, screen: RouteScreen): PlayedMatch | undefined {
  return screen === "match" ? undefined : played.keptBehind(screen);
}

function newPlayedMatch(screen: RouteScreen, seed: number, matchRules: Readonly<MatchRules>): PlayedMatch {
  if (screen === "match") {
    const match = createMatch(seed, undefined, matchRules);
    return playHotSeat(match);
  }
  const attract = createAttractMode(seed);
  return playAttractMode(attract, screen);
}

export function enterRemoteMatch(
  session: ScreenSession,
  role: RemoteRole,
  link: PeerLink,
  seed: number,
  matchRules: Readonly<MatchRules>,
): RemoteMatch {
  leavePlayedMatch(session);
  const remote = startRemoteMatch(role, link, seed, matchRules);
  session.screen = "remoteMatch";
  session.played = playRemoteMatch(remote);
  return remote;
}

function leavePlayedMatch(session: ScreenSession): void {
  session.played.leave();
  session.debris = [];
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
