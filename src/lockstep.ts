// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  adjustAim,
  aimOf,
  createMatch,
  fire,
  fireReceivedShot,
  isAimingTurnOf,
  isAimStreamingStep,
  isRoundOver,
  isShotInFlight,
  nextShooter,
  opponentOf,
  showAim,
  startNextRound,
  step,
  type Aim,
  type AimDelta,
  type Match,
  type MatchRules,
  type ShotOutcome,
  type Side,
} from "./core/match";
import {
  PROTOCOL_VERSION,
  shotOutcomesAgree,
  type AimMessage,
  type DecodedMessage,
  type NextRoundMessage,
  type RejectionReason,
  type RemoteMessage,
  type ShotMessage,
} from "./remoteProtocol";

export type RemoteMatchEnd = "left" | "opponentLeft" | "outOfSync" | "versionMismatch";

export type RemoteNotice = Exclude<RemoteMatchEnd, "left"> | "awaitingHost";

type OpponentMove = AimMessage | ShotMessage | NextRoundMessage;

export interface Lockstep {
  readonly localSide: Side;
  match: Match | undefined;
  receivedMoves: OpponentMove[];
  localOutcomes: ShotOutcome[];
  remoteOutcomes: ShotOutcome[];
  sentAim: Aim | undefined;
  end: RemoteMatchEnd | undefined;
  stepsSinceEnd: number;
}

export interface LockstepResult {
  outgoing: RemoteMessage[];
  end: RemoteMatchEnd | undefined;
}

const END_NOTICE_STEPS = 90;

const REJECTION_ENDS: Record<RejectionReason, RemoteMatchEnd> = {
  malformed: "outOfSync",
  protocolMismatch: "versionMismatch",
};

export function newLockstep(localSide: Side): Lockstep {
  return {
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

function emptyResult(): LockstepResult {
  return { outgoing: [], end: undefined };
}

export function hostLockstep(lockstep: Lockstep, seed: number, rules: Readonly<MatchRules>): LockstepResult {
  const result = emptyResult();
  lockstep.match = createMatch(seed, undefined, rules);
  result.outgoing.push({ kind: "hello", protocolVersion: PROTOCOL_VERSION, rules, seed });
  return result;
}

export function endLockstep(lockstep: Lockstep, end: RemoteMatchEnd): LockstepResult {
  const result = emptyResult();
  finish(lockstep, result, end);
  return result;
}

function finish(lockstep: Lockstep, result: LockstepResult, end: RemoteMatchEnd): void {
  if (lockstep.end !== undefined) {
    return;
  }
  lockstep.end = end;
  result.end = end;
  if (end !== "opponentLeft") {
    result.outgoing.push({ kind: "leave" });
  }
}

export function receiveLockstep(lockstep: Lockstep, decoded: Readonly<DecodedMessage>): LockstepResult {
  const result = emptyResult();
  if (lockstep.end !== undefined) {
    return result;
  }
  if (decoded.accepted) {
    receiveMessage(lockstep, result, decoded.message);
  } else {
    finish(lockstep, result, REJECTION_ENDS[decoded.reason]);
  }
  return result;
}

function receiveMessage(lockstep: Lockstep, result: LockstepResult, message: Readonly<RemoteMessage>): void {
  const match = lockstep.match;
  if (message.kind === "leave") {
    finish(lockstep, result, "opponentLeft");
  } else if (message.kind === "hello") {
    receiveHello(lockstep, result, message.seed, message.rules);
  } else if (match === undefined) {
    finish(lockstep, result, "outOfSync");
  } else if (message.kind === "outcome") {
    lockstep.remoteOutcomes.push(message.outcome);
    compareOutcomes(lockstep, result);
  } else {
    lockstep.receivedMoves.push(message);
    applyReceivedMoves(lockstep, result, match);
  }
}

function receiveHello(lockstep: Lockstep, result: LockstepResult, seed: number, rules: Readonly<MatchRules>): void {
  if (lockstep.match !== undefined) {
    finish(lockstep, result, "outOfSync");
    return;
  }
  lockstep.match = createMatch(seed, undefined, rules);
}

function opponentSide(lockstep: Readonly<Lockstep>): Side {
  return opponentOf(lockstep.localSide);
}

// Opponent moves apply in the order sent, each only once the local flight has ended,
// so a move always meets the phase the opponent made it in.
function applyReceivedMoves(lockstep: Lockstep, result: LockstepResult, match: Match): void {
  while (lockstep.end === undefined && !isShotInFlight(match)) {
    const move = lockstep.receivedMoves.shift();
    if (move === undefined) {
      return;
    }
    applyReceivedMove(lockstep, result, match, move);
  }
}

function applyReceivedMove(lockstep: Lockstep, result: LockstepResult, match: Match, move: Readonly<OpponentMove>): void {
  if (move.kind === "aim") {
    showAim(match, opponentSide(lockstep), move.aim);
  } else if (move.kind === "nextRound") {
    startOpponentRound(lockstep, result, match);
  } else {
    fireOpponentShot(lockstep, result, match, move);
  }
}

function startOpponentRound(lockstep: Lockstep, result: LockstepResult, match: Match): void {
  if (isRoundStartOf(match, opponentSide(lockstep))) {
    startRound(lockstep, match);
  } else {
    finish(lockstep, result, "outOfSync");
  }
}

function fireOpponentShot(lockstep: Lockstep, result: LockstepResult, match: Match, received: Readonly<ShotMessage>): void {
  const fromOpponent = isAimingTurnOf(match, opponentSide(lockstep));
  if (!fromOpponent || !fireReceivedShot(match, received.aim, received.shot)) {
    finish(lockstep, result, "outOfSync");
  }
}

function isRoundStartOf(match: Readonly<Match>, side: Side): boolean {
  return isRoundOver(match) && nextShooter(match) === side;
}

function startRound(lockstep: Lockstep, match: Match): void {
  startNextRound(match);
  lockstep.sentAim = undefined;
}

function compareOutcomes(lockstep: Lockstep, result: LockstepResult): void {
  while (lockstep.end === undefined && lockstep.localOutcomes.length > 0 && lockstep.remoteOutcomes.length > 0) {
    const local = lockstep.localOutcomes.shift()!;
    const received = lockstep.remoteOutcomes.shift()!;
    if (!shotOutcomesAgree(local, received)) {
      finish(lockstep, result, "outOfSync");
    }
  }
}

export function aimLockstep(lockstep: Lockstep, delta: AimDelta): void {
  if (isLocalTurn(lockstep)) {
    adjustAim(lockstep.match!, delta);
  }
}

export function fireLockstep(lockstep: Lockstep): LockstepResult {
  const result = emptyResult();
  const match = lockstep.match;
  if (match === undefined || lockstep.end !== undefined) {
    return result;
  }
  if (isRoundStartOf(match, lockstep.localSide)) {
    startRound(lockstep, match);
    result.outgoing.push({ kind: "nextRound" });
  } else if (isLocalTurn(lockstep)) {
    const aim = aimOf(match, lockstep.localSide);
    const shot = fire(match)!;
    result.outgoing.push({ kind: "shot", aim, shot });
  }
  return result;
}

function isLocalTurn(lockstep: Readonly<Lockstep>): boolean {
  return lockstep.end === undefined
    && lockstep.match !== undefined
    && isAimingTurnOf(lockstep.match, lockstep.localSide);
}

export function stepLockstep(lockstep: Lockstep): LockstepResult {
  const result = emptyResult();
  if (lockstep.end !== undefined) {
    lockstep.stepsSinceEnd++;
  }
  const match = lockstep.match;
  if (match !== undefined) {
    stepStartedMatch(lockstep, result, match);
  }
  return result;
}

function stepStartedMatch(lockstep: Lockstep, result: LockstepResult, match: Match): void {
  const outcome = step(match);
  if (outcome !== undefined) {
    reportShotOutcome(lockstep, result, outcome);
  }
  applyReceivedMoves(lockstep, result, match);
  sendChangedAim(lockstep, result, match);
}

function reportShotOutcome(lockstep: Lockstep, result: LockstepResult, outcome: Readonly<ShotOutcome>): void {
  if (lockstep.end !== undefined) {
    return;
  }
  lockstep.localOutcomes.push(outcome);
  result.outgoing.push({ kind: "outcome", outcome });
  compareOutcomes(lockstep, result);
}

function sendChangedAim(lockstep: Lockstep, result: LockstepResult, match: Readonly<Match>): void {
  if (!isLocalTurn(lockstep) || !isAimStreamingStep(match)) {
    return;
  }
  const aim = aimOf(match, lockstep.localSide);
  if (lockstep.sentAim?.angle === aim.angle && lockstep.sentAim.power === aim.power) {
    return;
  }
  lockstep.sentAim = aim;
  result.outgoing.push({ kind: "aim", aim });
}

export function isEndNoticeOver(lockstep: Readonly<Lockstep>): boolean {
  return lockstep.end !== undefined && lockstep.stepsSinceEnd >= END_NOTICE_STEPS;
}

export function remoteNotice(lockstep: Readonly<Lockstep>): RemoteNotice | undefined {
  if (lockstep.end !== undefined && lockstep.end !== "left") {
    return lockstep.end;
  }
  return lockstep.match === undefined ? "awaitingHost" : undefined;
}
