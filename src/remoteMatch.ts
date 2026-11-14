// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { matchView, type AimDelta, type MatchRules, type MatchView, type Side } from "./core/match";
import { effectLoop, type Feed } from "./effectLoop";
import type { Viewer } from "./frame";
import {
  isEndNoticeOver,
  isLocalTurn,
  lockstepTransition,
  newLockstep,
  remoteNotice,
  type Lockstep,
  type LockstepEffect,
  type LockstepEvent,
} from "./lockstep";
import type { PeerLink } from "./peerConnection";
import type { PlayedMatch, PlayedMatchStep } from "./playedMatch";
import { decodeMessage, encodeMessage } from "./remoteProtocol";

export type RemoteRole = "host" | "guest";

export interface RemoteMatch extends Lockstep {
  readonly link: PeerLink;
  readonly feed: Feed<LockstepEvent>;
}

const LOCAL_SIDES: Record<RemoteRole, Side> = { host: "left", guest: "right" };
const FIRED: LockstepEvent = { kind: "fired" };
const STEPPED: LockstepEvent = { kind: "stepped" };
const LEFT: LockstepEvent = { kind: "ended", end: "left" };
const OPPONENT_LEFT: LockstepEvent = { kind: "ended", end: "opponentLeft" };

export function startRemoteMatch(
  role: RemoteRole,
  link: PeerLink,
  seed: number,
  rules: Readonly<MatchRules>,
): RemoteMatch {
  const lockstep = newLockstep(LOCAL_SIDES[role]);
  const feed = effectLoop<LockstepEvent, LockstepEffect>(
    (event) => lockstepTransition(lockstep, event),
    (effect) => performLockstepEffect(link, effect),
  );
  const driving = { link, feed };
  const remote: RemoteMatch = Object.assign(lockstep, driving);
  link.onMessage((text) => receiveText(remote, text));
  link.closed.then(() => remote.feed(OPPONENT_LEFT));
  if (role === "host") {
    const hosted: LockstepEvent = { kind: "hosted", seed, rules };
    remote.feed(hosted);
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
    aim: (delta) => aimRemoteMatch(remote, delta),
    fire: () => {
      remote.feed(FIRED);
    },
    step: () => stepRemoteMatch(remote),
    view: () => remoteMatchView(remote),
    notice: () => remoteNotice(remote),
    leave: () => {
      remote.feed(LEFT);
    },
    keptBehind: () => undefined,
  };
}

function remoteAimingSide(remote: Readonly<RemoteMatch>): Side | undefined {
  return isLocalTurn(remote) ? remote.localSide : undefined;
}

function aimRemoteMatch(remote: RemoteMatch, delta: AimDelta): void {
  const aimed: LockstepEvent = { kind: "aimed", delta };
  remote.feed(aimed);
}

function receiveText(remote: RemoteMatch, text: string): void {
  const decoded = decodeMessage(text);
  const received: LockstepEvent = { kind: "received", decoded };
  remote.feed(received);
}

function performLockstepEffect(link: PeerLink, effect: LockstepEffect): void {
  if (effect.kind === "send") {
    const text = encodeMessage(effect.message);
    link.send(text);
  } else {
    link.close();
  }
}

function stepRemoteMatch(remote: RemoteMatch): PlayedMatchStep {
  remote.feed(STEPPED);
  const steppedView = remoteMatchView(remote);
  const returnsToMainMenu = isEndNoticeOver(remote);
  return { steppedView, returnsToMainMenu };
}

function remoteMatchView(remote: Readonly<RemoteMatch>): MatchView | undefined {
  return remote.match === undefined ? undefined : matchView(remote.match);
}
