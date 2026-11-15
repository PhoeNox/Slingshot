// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAttractMode } from "./core/attract";
import type { Point } from "./core/flight";
import { createMatch, type MatchRules, type MatchView } from "./core/match";
import { advanceDebris, type Particle } from "./debris";
import { describeBackdropFrame, describeFrame, describeRemoteNotice, type DisplaySettings } from "./frame";
import type { FrameItem, FrameLayer, GroupItem, ItemsLayer, StarsLayer } from "./frameItems";
import type { RemoteNotice } from "./lockstep";
import type { FixedRouteScreen, Route, RouteScreen, Screen } from "./navigation";
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
import type { SettingsStore } from "./settingsStore";
import type { Star } from "./stars";
import type { Invitation } from "./visitTransition";

export interface VisitScreens {
  showHostState: ShowVisitState;
  showGuestState: ShowVisitState;
}

export interface ScreenSessionAdapters {
  random: () => number;
  settings: Pick<SettingsStore, "matchRules">;
  showScreen: (screen: Screen) => void;
  navigateTo: (screen: FixedRouteScreen) => void;
  peers: PeerConnectors;
  relay: ReplyRelay;
  visitScreens: VisitScreens;
}

export interface ScreenSession {
  screen: () => Screen;
  played: () => PlayedMatch;
  debris: () => readonly Particle[];
  enterRoute: (route: Route) => void;
  enterRemoteMatch: (role: RemoteRole, link: PeerLink, seed: number, matchRules: Readonly<MatchRules>) => RemoteMatch;
  submitReplyCode: (replyCode: string) => Promise<void>;
  step: (reducedMotion: boolean) => void;
  keepsScreenAwake: () => boolean;
  awaitsFirstShot: () => boolean;
  describeFrame: (
    stars: readonly Star[],
    display: Readonly<DisplaySettings>,
    hudScale: number,
    reducedMotion: boolean,
    timeMs: number,
  ) => FrameLayer[];
}

type ScreenVisit = { role: "host"; visit: HostVisit } | { role: "guest"; visit: RemoteVisit };

interface SessionState {
  screen: Screen;
  played: PlayedMatch;
  visit: ScreenVisit | undefined;
  debris: Particle[];
}

interface RouteEntry {
  route: Route;
  seed: number;
  matchRules: Readonly<MatchRules>;
}

const SEED_RANGE = 2 ** 32;
const STATIC_STAR_TIME_MS = 0;
const BACKDROP_LAYER: ItemsLayer = { kind: "items", items: describeBackdropFrame() };

export function randomSeed(random: () => number): number {
  return Math.floor(random() * SEED_RANGE);
}

export function createScreenSession(adapters: Readonly<ScreenSessionAdapters>): ScreenSession {
  const state = initialState(adapters.random);
  return {
    screen: () => state.screen,
    played: () => state.played,
    debris: () => state.debris,
    enterRoute: (route) => enterRoute(state, route, adapters),
    enterRemoteMatch: (role, link, seed, matchRules) => enterRemoteMatch(state, role, link, seed, matchRules),
    submitReplyCode: (replyCode) => submitReplyCode(state, replyCode),
    step: (reducedMotion) => stepSession(state, reducedMotion, adapters),
    keepsScreenAwake: () => state.played.takesInput,
    awaitsFirstShot: () => awaitsFirstShot(state),
    describeFrame: (stars, display, hudScale, reducedMotion, timeMs) =>
      describeSessionFrame(state, adapters.random, stars, display, hudScale, reducedMotion, timeMs),
  };
}

function initialState(random: () => number): SessionState {
  const seed = randomSeed(random);
  const attract = createAttractMode(seed);
  const played = playAttractMode(attract, "mainMenu");
  return { screen: "mainMenu", played, visit: undefined, debris: [] };
}

function enterRoute(state: SessionState, route: Route, adapters: Readonly<ScreenSessionAdapters>): void {
  const seed = randomSeed(adapters.random);
  const matchRules = adapters.settings.matchRules();
  const entry: RouteEntry = { route, seed, matchRules };
  enterRouteEntry(state, entry, adapters);
  adapters.showScreen(route.screen);
}

function enterRouteEntry(state: SessionState, entry: Readonly<RouteEntry>, adapters: Readonly<ScreenSessionAdapters>): void {
  const screen = entry.route.screen;
  const kept = keptPlayedMatch(state.played, screen);
  if (kept === undefined) {
    leavePlayedMatch(state);
  }
  leaveVisit(state);
  state.screen = screen;
  state.played = kept ?? newPlayedMatch(screen, entry.seed, entry.matchRules);
  state.visit = startVisit(state, entry, adapters);
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

function startVisit(
  state: SessionState,
  entry: Readonly<RouteEntry>,
  adapters: Readonly<ScreenSessionAdapters>,
): ScreenVisit | undefined {
  const route = entry.route;
  const screens = adapters.visitScreens;
  const handOver: StartRemoteMatch = (role, link) => handOverVisit(state, role, link, entry, adapters);
  if (route.screen === "host") {
    const visit = startHostVisit(adapters.peers.host, adapters.relay, screens.showHostState, handOver);
    return { role: "host", visit };
  }
  if (route.screen === "guest") {
    const invitation: Invitation = { offerCode: route.offerCode, roomSecret: route.roomSecret };
    const visit = startGuestVisit(adapters.peers.join, adapters.relay, invitation, screens.showGuestState, handOver);
    return { role: "guest", visit };
  }
  return undefined;
}

function handOverVisit(
  state: SessionState,
  role: RemoteRole,
  link: PeerLink,
  entry: Readonly<RouteEntry>,
  adapters: Readonly<ScreenSessionAdapters>,
): void {
  state.visit = undefined;
  enterRemoteMatch(state, role, link, entry.seed, entry.matchRules);
  adapters.showScreen("remoteMatch");
}

function submitReplyCode(state: Readonly<SessionState>, replyCode: string): Promise<void> {
  const visit = state.visit;
  if (visit?.role !== "host") {
    return Promise.resolve();
  }
  return visit.visit.submitReply(replyCode);
}

function enterRemoteMatch(
  state: SessionState,
  role: RemoteRole,
  link: PeerLink,
  seed: number,
  matchRules: Readonly<MatchRules>,
): RemoteMatch {
  leavePlayedMatch(state);
  leaveVisit(state);
  const remote = startRemoteMatch(role, link, seed, matchRules);
  state.screen = "remoteMatch";
  state.played = playRemoteMatch(remote);
  return remote;
}

function leavePlayedMatch(state: SessionState): void {
  state.played.leave();
  state.debris = [];
}

function leaveVisit(state: SessionState): void {
  state.visit?.visit.leave();
  state.visit = undefined;
}

function stepSession(state: SessionState, reducedMotion: boolean, adapters: Readonly<ScreenSessionAdapters>): void {
  const played = state.played.step(reducedMotion);
  advanceSessionDebris(state, played.steppedView, reducedMotion, adapters.random);
  if (played.returnsToMainMenu) {
    adapters.navigateTo("mainMenu");
  }
}

function advanceSessionDebris(
  state: SessionState,
  steppedView: MatchView | undefined,
  reducedMotion: boolean,
  random: () => number,
): void {
  if (reducedMotion) {
    state.debris = [];
  } else if (steppedView !== undefined) {
    state.debris = advanceDebris(state.debris, steppedView, random);
  }
}

function awaitsFirstShot(state: Readonly<SessionState>): boolean {
  const view = state.played.view();
  return view !== undefined && isBeforeFirstShot(view);
}

function isBeforeFirstShot(view: MatchView): boolean {
  return view.roundNumber === 1 && view.attempts.left + view.attempts.right === 0;
}

function describeSessionFrame(
  state: Readonly<SessionState>,
  random: () => number,
  stars: readonly Star[],
  display: Readonly<DisplaySettings>,
  hudScale: number,
  reducedMotion: boolean,
  timeMs: number,
): FrameLayer[] {
  const starsLayer = starsLayerOf(stars, reducedMotion, timeMs);
  const playedLayer = shakenPlayedLayer(state, random, display, hudScale, reducedMotion);
  return [BACKDROP_LAYER, starsLayer, playedLayer];
}

function starsLayerOf(stars: readonly Star[], reducedMotion: boolean, timeMs: number): StarsLayer {
  const starTimeMs = reducedMotion ? STATIC_STAR_TIME_MS : timeMs;
  return { kind: "stars", stars, timeMs: starTimeMs };
}

function shakenPlayedLayer(
  state: Readonly<SessionState>,
  random: () => number,
  display: Readonly<DisplaySettings>,
  hudScale: number,
  reducedMotion: boolean,
): ItemsLayer {
  const played = state.played;
  const view = played.view();
  const matchItems = view === undefined ? [] : describeFrame(view, display, state.debris, played.viewer, hudScale);
  const noticeItems = noticeItemsOf(played.notice(), hudScale);
  const shakes = played.shakes && !reducedMotion;
  const shake = shakes && view !== undefined ? screenShakeOffset(view, random) : NO_SHAKE;
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
