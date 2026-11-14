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

export type LockstepEvent =
  | { readonly kind: "hosted"; readonly seed: number; readonly rules: Readonly<MatchRules> }
  | { readonly kind: "aimed"; readonly delta: AimDelta }
  | { readonly kind: "fired" }
  | { readonly kind: "received"; readonly decoded: Readonly<DecodedMessage> }
  | { readonly kind: "stepped" }
  | { readonly kind: "ended"; readonly end: RemoteMatchEnd };

export type LockstepEffect =
  | { readonly kind: "send"; readonly message: RemoteMessage }
  | { readonly kind: "end"; readonly end: RemoteMatchEnd };

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

export function lockstepTransition(lockstep: Lockstep, event: Readonly<LockstepEvent>): LockstepEffect[] {
  const effects: LockstepEffect[] = [];
  switch (event.kind) {
    case "hosted":
      startHosting(lockstep, effects, event.seed, event.rules);
      break;
    case "aimed":
      aimLocalTurn(lockstep, event.delta);
      break;
    case "fired":
      fireLocalTurn(lockstep, effects);
      break;
    case "received":
      receive(lockstep, effects, event.decoded);
      break;
    case "stepped":
      stepLockstep(lockstep, effects);
      break;
    case "ended":
      finish(lockstep, effects, event.end);
      break;
  }
  return effects;
}

function send(effects: LockstepEffect[], message: RemoteMessage): void {
  effects.push({ kind: "send", message });
}

function startHosting(lockstep: Lockstep, effects: LockstepEffect[], seed: number, rules: Readonly<MatchRules>): void {
  lockstep.match = createMatch(seed, undefined, rules);
  send(effects, { kind: "hello", protocolVersion: PROTOCOL_VERSION, rules, seed });
}

function finish(lockstep: Lockstep, effects: LockstepEffect[], end: RemoteMatchEnd): void {
  if (lockstep.end !== undefined) {
    return;
  }
  lockstep.end = end;
  if (end !== "opponentLeft") {
    send(effects, { kind: "leave" });
  }
  effects.push({ kind: "end", end });
}

function receive(lockstep: Lockstep, effects: LockstepEffect[], decoded: Readonly<DecodedMessage>): void {
  if (lockstep.end !== undefined) {
    return;
  }
  if (decoded.accepted) {
    receiveMessage(lockstep, effects, decoded.message);
  } else {
    finish(lockstep, effects, REJECTION_ENDS[decoded.reason]);
  }
}

function receiveMessage(lockstep: Lockstep, effects: LockstepEffect[], message: Readonly<RemoteMessage>): void {
  const match = lockstep.match;
  if (message.kind === "leave") {
    finish(lockstep, effects, "opponentLeft");
  } else if (message.kind === "hello") {
    receiveHello(lockstep, effects, message.seed, message.rules);
  } else if (match === undefined) {
    finish(lockstep, effects, "outOfSync");
  } else if (message.kind === "outcome") {
    lockstep.remoteOutcomes.push(message.outcome);
    compareOutcomes(lockstep, effects);
  } else {
    lockstep.receivedMoves.push(message);
    applyReceivedMoves(lockstep, effects, match);
  }
}

function receiveHello(lockstep: Lockstep, effects: LockstepEffect[], seed: number, rules: Readonly<MatchRules>): void {
  if (lockstep.match !== undefined) {
    finish(lockstep, effects, "outOfSync");
    return;
  }
  lockstep.match = createMatch(seed, undefined, rules);
}

function opponentSide(lockstep: Readonly<Lockstep>): Side {
  return opponentOf(lockstep.localSide);
}

// Opponent moves apply in the order sent, each only once the local flight has ended,
// so a move always meets the phase the opponent made it in.
function applyReceivedMoves(lockstep: Lockstep, effects: LockstepEffect[], match: Match): void {
  while (lockstep.end === undefined && !isShotInFlight(match)) {
    const move = lockstep.receivedMoves.shift();
    if (move === undefined) {
      return;
    }
    applyReceivedMove(lockstep, effects, match, move);
  }
}

function applyReceivedMove(lockstep: Lockstep, effects: LockstepEffect[], match: Match, move: Readonly<OpponentMove>): void {
  if (move.kind === "aim") {
    showAim(match, opponentSide(lockstep), move.aim);
  } else if (move.kind === "nextRound") {
    startOpponentRound(lockstep, effects, match);
  } else {
    fireOpponentShot(lockstep, effects, match, move);
  }
}

function startOpponentRound(lockstep: Lockstep, effects: LockstepEffect[], match: Match): void {
  if (isRoundStartOf(match, opponentSide(lockstep))) {
    startRound(lockstep, match);
  } else {
    finish(lockstep, effects, "outOfSync");
  }
}

function fireOpponentShot(lockstep: Lockstep, effects: LockstepEffect[], match: Match, received: Readonly<ShotMessage>): void {
  const fromOpponent = isAimingTurnOf(match, opponentSide(lockstep));
  if (!fromOpponent || !fireReceivedShot(match, received.aim, received.shot)) {
    finish(lockstep, effects, "outOfSync");
  }
}

function isRoundStartOf(match: Readonly<Match>, side: Side): boolean {
  return isRoundOver(match) && nextShooter(match) === side;
}

function startRound(lockstep: Lockstep, match: Match): void {
  startNextRound(match);
  lockstep.sentAim = undefined;
}

function compareOutcomes(lockstep: Lockstep, effects: LockstepEffect[]): void {
  while (lockstep.end === undefined && lockstep.localOutcomes.length > 0 && lockstep.remoteOutcomes.length > 0) {
    const local = lockstep.localOutcomes.shift()!;
    const received = lockstep.remoteOutcomes.shift()!;
    if (!shotOutcomesAgree(local, received)) {
      finish(lockstep, effects, "outOfSync");
    }
  }
}

function aimLocalTurn(lockstep: Lockstep, delta: AimDelta): void {
  if (isLocalTurn(lockstep)) {
    adjustAim(lockstep.match!, delta);
  }
}

function fireLocalTurn(lockstep: Lockstep, effects: LockstepEffect[]): void {
  const match = lockstep.match;
  if (match === undefined || lockstep.end !== undefined) {
    return;
  }
  if (isRoundStartOf(match, lockstep.localSide)) {
    startRound(lockstep, match);
    send(effects, { kind: "nextRound" });
  } else if (isLocalTurn(lockstep)) {
    const aim = aimOf(match, lockstep.localSide);
    const shot = fire(match)!;
    send(effects, { kind: "shot", aim, shot });
  }
}

export function isLocalTurn(lockstep: Readonly<Lockstep>): boolean {
  return lockstep.end === undefined
    && lockstep.match !== undefined
    && isAimingTurnOf(lockstep.match, lockstep.localSide);
}

function stepLockstep(lockstep: Lockstep, effects: LockstepEffect[]): void {
  if (lockstep.end !== undefined) {
    lockstep.stepsSinceEnd++;
  }
  const match = lockstep.match;
  if (match !== undefined) {
    stepStartedMatch(lockstep, effects, match);
  }
}

function stepStartedMatch(lockstep: Lockstep, effects: LockstepEffect[], match: Match): void {
  const outcome = step(match);
  if (outcome !== undefined) {
    reportShotOutcome(lockstep, effects, outcome);
  }
  applyReceivedMoves(lockstep, effects, match);
  sendChangedAim(lockstep, effects, match);
}

function reportShotOutcome(lockstep: Lockstep, effects: LockstepEffect[], outcome: Readonly<ShotOutcome>): void {
  if (lockstep.end !== undefined) {
    return;
  }
  lockstep.localOutcomes.push(outcome);
  send(effects, { kind: "outcome", outcome });
  compareOutcomes(lockstep, effects);
}

function sendChangedAim(lockstep: Lockstep, effects: LockstepEffect[], match: Readonly<Match>): void {
  if (!isLocalTurn(lockstep) || !isAimStreamingStep(match)) {
    return;
  }
  const aim = aimOf(match, lockstep.localSide);
  if (lockstep.sentAim?.angle === aim.angle && lockstep.sentAim.power === aim.power) {
    return;
  }
  lockstep.sentAim = aim;
  send(effects, { kind: "aim", aim });
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
