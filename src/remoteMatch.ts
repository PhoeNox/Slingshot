// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { matchView, type MatchRules, type MatchView, type Side } from "./core/match";
import type { Viewer } from "./frame";
import {
  aimLockstep,
  endLockstep,
  fireLockstep,
  hostLockstep,
  isEndNoticeOver,
  isLocalTurn,
  newLockstep,
  receiveLockstep,
  remoteNotice,
  stepLockstep,
  type Lockstep,
  type LockstepResult,
  type RemoteMatchEnd,
} from "./lockstep";
import type { PeerLink } from "./peerConnection";
import type { PlayedMatch, PlayedMatchStep } from "./playedMatch";
import { decodeMessage, encodeMessage } from "./remoteProtocol";

export type RemoteRole = "host" | "guest";

export interface RemoteMatch extends Lockstep {
  readonly link: PeerLink;
}

const LOCAL_SIDES: Record<RemoteRole, Side> = { host: "left", guest: "right" };

export function startRemoteMatch(
  role: RemoteRole,
  link: PeerLink,
  seed: number,
  rules: Readonly<MatchRules>,
): RemoteMatch {
  const lockstep = newLockstep(LOCAL_SIDES[role]);
  const remote: RemoteMatch = { ...lockstep, link };
  link.onMessage((text) => receiveText(remote, text));
  link.closed.then(() => endRemoteMatch(remote, "opponentLeft"));
  if (role === "host") {
    const hosted = hostLockstep(remote, seed, rules);
    carryOut(remote, hosted);
  }
  return remote;
}

export function playRemoteMatch(remote: RemoteMatch): PlayedMatch {
  const viewer: Viewer = { kind: "remote", localSide: remote.localSide };
  return {
    viewer,
    shakes: true,
    takesInput: true,
    aimingSide: () => remoteAimingSide(remote),
    aim: (delta) => aimLockstep(remote, delta),
    fire: () => fireRemoteMatch(remote),
    step: () => stepRemoteMatch(remote),
    view: () => remoteMatchView(remote),
    notice: () => remoteNotice(remote),
    leave: () => leaveRemoteMatch(remote),
  };
}

function remoteAimingSide(remote: Readonly<RemoteMatch>): Side | undefined {
  return isLocalTurn(remote) ? remote.localSide : undefined;
}

function leaveRemoteMatch(remote: RemoteMatch): void {
  endRemoteMatch(remote, "left");
}

function endRemoteMatch(remote: RemoteMatch, end: RemoteMatchEnd): void {
  const ended = endLockstep(remote, end);
  carryOut(remote, ended);
}

function receiveText(remote: RemoteMatch, text: string): void {
  const decoded = decodeMessage(text);
  const received = receiveLockstep(remote, decoded);
  carryOut(remote, received);
}

function carryOut(remote: RemoteMatch, result: Readonly<LockstepResult>): void {
  for (const message of result.outgoing) {
    const text = encodeMessage(message);
    remote.link.send(text);
  }
  if (result.end !== undefined) {
    remote.link.close();
  }
}

function fireRemoteMatch(remote: RemoteMatch): void {
  const fired = fireLockstep(remote);
  carryOut(remote, fired);
}

function stepRemoteMatch(remote: RemoteMatch): PlayedMatchStep {
  const stepped = stepLockstep(remote);
  carryOut(remote, stepped);
  const steppedView = remoteMatchView(remote);
  const returnsToMainMenu = isEndNoticeOver(remote);
  return { steppedView, returnsToMainMenu };
}

function remoteMatchView(remote: Readonly<RemoteMatch>): MatchView | undefined {
  return remote.match === undefined ? undefined : matchView(remote.match);
}
