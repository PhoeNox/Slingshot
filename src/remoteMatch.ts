// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  adjustAim,
  createMatch,
  fire,
  fireReceivedShot,
  isAimingTurnOf,
  isRoundOver,
  isShotInFlight,
  nextShooter,
  showAim,
  step,
  type Aim,
  type AimDelta,
  type Match,
  type MatchRules,
  type ShotOutcome,
  type Side,
} from "./core/match";
import type { PeerLink } from "./peerConnection";
import {
  decodeMessage,
  encodeMessage,
  PROTOCOL_VERSION,
  shotOutcomesAgree,
  type AimMessage,
  type NextRoundMessage,
  type RejectionReason,
  type RemoteMessage,
  type ShotMessage,
} from "./remoteProtocol";
import { matchRulesFor, type Settings } from "./settings";

export type RemoteRole = "host" | "guest";

export type RemoteMatchEnd = "left" | "opponentLeft" | "outOfSync" | "versionMismatch";

export type RemoteNotice = Exclude<RemoteMatchEnd, "left"> | "awaitingHost";

type OpponentMove = AimMessage | ShotMessage | NextRoundMessage;

export interface RemoteMatch {
  readonly link: PeerLink;
  readonly localSide: Side;
  match: Match | undefined;
  receivedMoves: OpponentMove[];
  localOutcomes: ShotOutcome[];
  remoteOutcomes: ShotOutcome[];
  sentAim: Aim | undefined;
  end: RemoteMatchEnd | undefined;
  stepsSinceEnd: number;
}

export interface RemoteMatchStep {
  readonly match: Match | undefined;
  readonly returnsToMainMenu: boolean;
}

const AIM_SEND_INTERVAL_STEPS = 3;
const END_NOTICE_STEPS = 90;
const SEED_RANGE = 2 ** 32;

const REJECTION_ENDS: Record<RejectionReason, RemoteMatchEnd> = {
  malformed: "outOfSync",
  protocolMismatch: "versionMismatch",
};

export function startRemoteMatch(
  role: RemoteRole,
  link: PeerLink,
  settings: Readonly<Settings>,
  random: () => number,
): RemoteMatch {
  if (role === "guest") {
    return listenedRemoteMatch(link, "right");
  }
  const seed = Math.floor(random() * SEED_RANGE);
  const rules = matchRulesFor(settings);
  return hostRemoteMatch(link, seed, rules);
}

function hostRemoteMatch(link: PeerLink, seed: number, rules: Readonly<MatchRules>): RemoteMatch {
  const remote = listenedRemoteMatch(link, "left");
  remote.match = createMatch(seed, undefined, rules);
  send(remote, { kind: "hello", protocolVersion: PROTOCOL_VERSION, rules, seed });
  return remote;
}

function listenedRemoteMatch(link: PeerLink, localSide: Side): RemoteMatch {
  const remote = newRemoteMatch(link, localSide);
  link.onMessage((text) => receiveText(remote, text));
  link.closed.then(() => endRemoteMatch(remote, "opponentLeft"));
  return remote;
}

function newRemoteMatch(link: PeerLink, localSide: Side): RemoteMatch {
  return {
    link,
    localSide,
    match: undefined,
    receivedMoves: [],
    localOutcomes: [],
    remoteOutcomes: [],
    sentAim: undefined,
    end: undefined,
    stepsSinceEnd: 0,
  };
}

export function leaveRemoteMatch(remote: RemoteMatch): void {
  endRemoteMatch(remote, "left");
}

function endRemoteMatch(remote: RemoteMatch, end: RemoteMatchEnd): void {
  if (remote.end !== undefined) {
    return;
  }
  remote.end = end;
  if (end !== "opponentLeft") {
    send(remote, { kind: "leave" });
  }
  remote.link.close();
}

function send(remote: RemoteMatch, message: Readonly<RemoteMessage>): void {
  const text = encodeMessage(message);
  remote.link.send(text);
}

function receiveText(remote: RemoteMatch, text: string): void {
  if (remote.end !== undefined) {
    return;
  }
  const decoded = decodeMessage(text);
  if (decoded.accepted) {
    receiveMessage(remote, decoded.message);
  } else {
    endRemoteMatch(remote, REJECTION_ENDS[decoded.reason]);
  }
}

function receiveMessage(remote: RemoteMatch, message: Readonly<RemoteMessage>): void {
  const match = remote.match;
  if (message.kind === "leave") {
    endRemoteMatch(remote, "opponentLeft");
  } else if (message.kind === "hello") {
    receiveHello(remote, message.seed, message.rules);
  } else if (match === undefined) {
    endRemoteMatch(remote, "outOfSync");
  } else if (message.kind === "outcome") {
    remote.remoteOutcomes.push(message.outcome);
    compareOutcomes(remote);
  } else {
    remote.receivedMoves.push(message);
    applyReceivedMoves(remote, match);
  }
}

function receiveHello(remote: RemoteMatch, seed: number, rules: Readonly<MatchRules>): void {
  if (remote.match !== undefined) {
    endRemoteMatch(remote, "outOfSync");
    return;
  }
  remote.match = createMatch(seed, undefined, rules);
}

function opponentSide(remote: Readonly<RemoteMatch>): Side {
  return remote.localSide === "left" ? "right" : "left";
}

// Opponent moves apply in the order sent, each only once the local flight has ended,
// so a move always meets the phase the opponent made it in.
function applyReceivedMoves(remote: RemoteMatch, match: Match): void {
  while (remote.end === undefined && !isShotInFlight(match)) {
    const move = remote.receivedMoves.shift();
    if (move === undefined) {
      return;
    }
    applyReceivedMove(remote, match, move);
  }
}

function applyReceivedMove(remote: RemoteMatch, match: Match, move: Readonly<OpponentMove>): void {
  if (move.kind === "aim") {
    showAim(match, opponentSide(remote), move.aim);
  } else if (move.kind === "nextRound") {
    startOpponentRound(remote, match);
  } else {
    fireOpponentShot(remote, match, move);
  }
}

function startOpponentRound(remote: RemoteMatch, match: Match): void {
  if (isRoundStartOf(match, opponentSide(remote))) {
    startRound(remote, match);
  } else {
    endRemoteMatch(remote, "outOfSync");
  }
}

function fireOpponentShot(remote: RemoteMatch, match: Match, received: Readonly<ShotMessage>): void {
  const fromOpponent = isAimingTurnOf(match, opponentSide(remote));
  if (!fromOpponent || !fireReceivedShot(match, received.aim, received.shot)) {
    endRemoteMatch(remote, "outOfSync");
  }
}

function isRoundStartOf(match: Readonly<Match>, side: Side): boolean {
  return isRoundOver(match) && nextShooter(match) === side;
}

function startRound(remote: RemoteMatch, match: Match): void {
  fire(match);
  remote.sentAim = undefined;
}

function compareOutcomes(remote: RemoteMatch): void {
  while (remote.end === undefined && remote.localOutcomes.length > 0 && remote.remoteOutcomes.length > 0) {
    const local = remote.localOutcomes.shift()!;
    const received = remote.remoteOutcomes.shift()!;
    if (!shotOutcomesAgree(local, received)) {
      endRemoteMatch(remote, "outOfSync");
    }
  }
}

export function aimRemoteMatch(remote: RemoteMatch, delta: AimDelta): void {
  if (isLocalTurn(remote)) {
    adjustAim(remote.match!, delta);
  }
}

export function fireRemoteMatch(remote: RemoteMatch): void {
  const match = remote.match;
  if (match === undefined || remote.end !== undefined) {
    return;
  }
  if (isRoundStartOf(match, remote.localSide)) {
    startRound(remote, match);
    send(remote, { kind: "nextRound" });
  } else if (isLocalTurn(remote)) {
    const aim = match.ships[remote.localSide].aim;
    const shot = fire(match)!;
    send(remote, { kind: "shot", aim, shot });
  }
}

function isLocalTurn(remote: Readonly<RemoteMatch>): boolean {
  return remote.end === undefined
    && remote.match !== undefined
    && isAimingTurnOf(remote.match, remote.localSide);
}

export function stepRemoteMatch(remote: RemoteMatch): RemoteMatchStep {
  if (remote.end !== undefined) {
    remote.stepsSinceEnd++;
  }
  const match = remote.match;
  if (match !== undefined) {
    stepStartedMatch(remote, match);
  }
  const returnsToMainMenu = isEndNoticeOver(remote);
  return { match, returnsToMainMenu };
}

function stepStartedMatch(remote: RemoteMatch, match: Match): void {
  const outcome = step(match);
  if (outcome !== undefined) {
    reportShotOutcome(remote, outcome);
  }
  applyReceivedMoves(remote, match);
  sendChangedAim(remote, match);
}

function isEndNoticeOver(remote: Readonly<RemoteMatch>): boolean {
  return remote.end !== undefined && remote.stepsSinceEnd >= END_NOTICE_STEPS;
}

function reportShotOutcome(remote: RemoteMatch, outcome: Readonly<ShotOutcome>): void {
  if (remote.end !== undefined) {
    return;
  }
  remote.localOutcomes.push(outcome);
  send(remote, { kind: "outcome", outcome });
  compareOutcomes(remote);
}

function sendChangedAim(remote: RemoteMatch, match: Readonly<Match>): void {
  if (!isLocalTurn(remote) || match.roundStepCount % AIM_SEND_INTERVAL_STEPS !== 0) {
    return;
  }
  const aim = match.ships[remote.localSide].aim;
  if (remote.sentAim?.angle === aim.angle && remote.sentAim.power === aim.power) {
    return;
  }
  remote.sentAim = { angle: aim.angle, power: aim.power };
  send(remote, { kind: "aim", aim });
}

export function remoteNotice(remote: Readonly<RemoteMatch>): RemoteNotice | undefined {
  if (remote.end !== undefined && remote.end !== "left") {
    return remote.end;
  }
  return remote.match === undefined ? "awaitingHost" : undefined;
}
