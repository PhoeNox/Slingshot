// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { AimDelta, Match, MatchRules, Side } from "./core/match";
import {
  aimLockstep,
  endLockstep,
  fireLockstep,
  hostLockstep,
  isEndNoticeOver,
  newLockstep,
  receiveLockstep,
  stepLockstep,
  type Lockstep,
  type LockstepResult,
  type RemoteMatchEnd,
} from "./lockstep";
import type { PeerLink } from "./peerConnection";
import { decodeMessage, encodeMessage } from "./remoteProtocol";

export type RemoteRole = "host" | "guest";

export interface RemoteMatch extends Lockstep {
  readonly link: PeerLink;
}

export interface RemoteMatchStep {
  readonly match: Match | undefined;
  readonly returnsToMainMenu: boolean;
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

export function leaveRemoteMatch(remote: RemoteMatch): void {
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

export function aimRemoteMatch(remote: RemoteMatch, delta: AimDelta): void {
  aimLockstep(remote, delta);
}

export function fireRemoteMatch(remote: RemoteMatch): void {
  const fired = fireLockstep(remote);
  carryOut(remote, fired);
}

export function stepRemoteMatch(remote: RemoteMatch): RemoteMatchStep {
  const stepped = stepLockstep(remote);
  carryOut(remote, stepped);
  const returnsToMainMenu = isEndNoticeOver(remote);
  return { match: remote.match, returnsToMainMenu };
}
