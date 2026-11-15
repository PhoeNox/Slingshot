// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAttractMode } from "./core/attract";
import type { Point } from "./core/flight";
import { createMatch, type MatchRules, type MatchView } from "./core/match";
import { advanceDebris, type Particle } from "./debris";
import { describeBackdropFrame, describeFrame, describeRemoteNotice, type DisplaySettings } from "./frame";
import type { FrameItem, FrameLayer, GroupItem, ItemsLayer, StarsLayer } from "./frameItems";
import type { RemoteNotice } from "./lockstep";
import type { Route, RouteScreen, Screen } from "./navigation";
import type { PeerLink } from "./peerConnection";
import { playAttractMode, playHotSeat, type PlayedMatch } from "./playedMatch";
import { playRemoteMatch, startRemoteMatch, type RemoteMatch, type RemoteRole } from "./remoteMatch";
import {
  startGuestVisit,
  startHostVisit,
  type HostVisit,
  type PeerConnectors,
  type RemoteVisit,
  type ShowVisitState,
  type StartRemoteMatch,
} from "./remoteVisit";
import type { ReplyRelay } from "./replyRelay";
import { NO_SHAKE, screenShakeOffset } from "./screenShake";
import type { Star } from "./stars";
import type { Invitation } from "./visitTransition";

export type ScreenVisit = { role: "host"; visit: HostVisit } | { role: "guest"; visit: RemoteVisit };

export interface ScreenSession {
  screen: Screen;
  played: PlayedMatch;
  visit: ScreenVisit | undefined;
  debris: Particle[];
  random: () => number;
}

export interface RouteEntry {
  route: Route;
  seed: number;
  matchRules: Readonly<MatchRules>;
}

export interface VisitScreens {
  showHostState: ShowVisitState;
  showGuestState: ShowVisitState;
}

export interface VisitPorts {
  peers: PeerConnectors;
  relay: ReplyRelay;
  screens: VisitScreens;
  showRemoteMatch: () => void;
}

export type ScreenSessionStep = "stay" | "mainMenu";

const STATIC_STAR_TIME_MS = 0;
const BACKDROP_LAYER: ItemsLayer = { kind: "items", items: describeBackdropFrame() };

export function createScreenSession(seed: number, random: () => number): ScreenSession {
  const attract = createAttractMode(seed);
  const played = playAttractMode(attract, "mainMenu");
  return { screen: "mainMenu", played, visit: undefined, debris: [], random };
}

export function enterRoute(session: ScreenSession, entry: Readonly<RouteEntry>, ports: VisitPorts): void {
  const screen = entry.route.screen;
  const kept = keptPlayedMatch(session.played, screen);
  if (kept === undefined) {
    leavePlayedMatch(session);
  }
  leaveVisit(session);
  session.screen = screen;
  session.played = kept ?? newPlayedMatch(screen, entry.seed, entry.matchRules);
  session.visit = startVisit(session, entry, ports);
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

function startVisit(session: ScreenSession, entry: Readonly<RouteEntry>, ports: VisitPorts): ScreenVisit | undefined {
  const route = entry.route;
  const handOver: StartRemoteMatch = (role, link) => handOverVisit(session, role, link, entry, ports);
  if (route.screen === "host") {
    const visit = startHostVisit(ports.peers.host, ports.relay, ports.screens.showHostState, handOver);
    return { role: "host", visit };
  }
  if (route.screen === "guest") {
    const invitation: Invitation = { offerCode: route.offerCode, roomSecret: route.roomSecret };
    const visit = startGuestVisit(ports.peers.join, ports.relay, invitation, ports.screens.showGuestState, handOver);
    return { role: "guest", visit };
  }
  return undefined;
}

function handOverVisit(
  session: ScreenSession,
  role: RemoteRole,
  link: PeerLink,
  entry: Readonly<RouteEntry>,
  ports: VisitPorts,
): void {
  session.visit = undefined;
  enterRemoteMatch(session, role, link, entry.seed, entry.matchRules);
  ports.showRemoteMatch();
}

export function submitReplyCode(session: ScreenSession, replyCode: string): Promise<void> {
  const visit = session.visit;
  if (visit?.role !== "host") {
    return Promise.resolve();
  }
  return visit.visit.submitReply(replyCode);
}

export function enterRemoteMatch(
  session: ScreenSession,
  role: RemoteRole,
  link: PeerLink,
  seed: number,
  matchRules: Readonly<MatchRules>,
): RemoteMatch {
  leavePlayedMatch(session);
  leaveVisit(session);
  const remote = startRemoteMatch(role, link, seed, matchRules);
  session.screen = "remoteMatch";
  session.played = playRemoteMatch(remote);
  return remote;
}

function leavePlayedMatch(session: ScreenSession): void {
  session.played.leave();
  session.debris = [];
}

function leaveVisit(session: ScreenSession): void {
  session.visit?.visit.leave();
  session.visit = undefined;
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

export function keepsScreenAwake(session: ScreenSession): boolean {
  return session.played.takesInput;
}

export function awaitsFirstShot(session: ScreenSession): boolean {
  const view = session.played.view();
  return view !== undefined && isBeforeFirstShot(view);
}

function isBeforeFirstShot(view: MatchView): boolean {
  return view.roundNumber === 1 && view.attempts.left + view.attempts.right === 0;
}

export function describeScreenSessionFrame(
  session: ScreenSession,
  stars: readonly Star[],
  display: Readonly<DisplaySettings>,
  hudScale: number,
  reducedMotion: boolean,
  timeMs: number,
): FrameLayer[] {
  const starsLayer = starsLayerOf(stars, reducedMotion, timeMs);
  const playedLayer = shakenPlayedLayer(session, display, hudScale, reducedMotion);
  return [BACKDROP_LAYER, starsLayer, playedLayer];
}

function starsLayerOf(stars: readonly Star[], reducedMotion: boolean, timeMs: number): StarsLayer {
  const starTimeMs = reducedMotion ? STATIC_STAR_TIME_MS : timeMs;
  return { kind: "stars", stars, timeMs: starTimeMs };
}

function shakenPlayedLayer(
  session: ScreenSession,
  display: Readonly<DisplaySettings>,
  hudScale: number,
  reducedMotion: boolean,
): ItemsLayer {
  const played = session.played;
  const view = played.view();
  const matchItems = view === undefined ? [] : describeFrame(view, display, session.debris, played.viewer, hudScale);
  const noticeItems = noticeItemsOf(played.notice(), hudScale);
  const shakes = played.shakes && !reducedMotion;
  const shake = shakes && view !== undefined ? screenShakeOffset(view, session.random) : NO_SHAKE;
  const items = [...matchItems, ...noticeItems];
  const shaken = shakenGroup(items, shake);
  return { kind: "items", items: [shaken] };
}

function shakenGroup(items: FrameItem[], shake: Readonly<Point>): GroupItem {
  const transform = { x: shake.x, y: shake.y, rotation: 0, scale: 1 };
  return { kind: "group", transform, items };
}

function noticeItemsOf(notice: RemoteNotice | undefined, hudScale: number): FrameItem[] {
  return notice === undefined ? [] : describeRemoteNotice(notice, hudScale);
}
