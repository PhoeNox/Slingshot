// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { effectLoop, type Feed } from "./effectLoop";
import {
  PeerConnectionError,
  type GuestReply,
  type HostInvitation,
  type HostPeerConnection,
  type JoinPeerConnection,
  type PeerLink,
} from "./peerConnection";
import type { RemoteRole } from "./remoteMatch";
import type { ReplyDelivery, ReplyRelay, ReplyRoom } from "./replyRelay";
import {
  guestTransition,
  hostTransition,
  newGuestProgress,
  newHostProgress,
  type Failing,
  type GuestEffect,
  type GuestEvent,
  type HostEffect,
  type HostEvent,
  type Invitation,
  type VisitEffect,
  type VisitState,
} from "./visitTransition";

export type StartRemoteMatch = (role: RemoteRole, link: PeerLink) => void;

export interface PeerConnectors {
  host: HostPeerConnection;
  join: JoinPeerConnection;
}

export type ShowVisitState = (state: VisitState) => void;

export interface RemoteVisit {
  readonly settled: Promise<void>;
  leave(): void;
}

export interface HostVisit extends RemoteVisit {
  submitReply(replyCode: string): Promise<void>;
}

interface VisitOutlet {
  readonly show: ShowVisitState;
  readonly startRemoteMatch: StartRemoteMatch;
}

interface HostPorts extends VisitOutlet {
  readonly connectHost: HostPeerConnection;
  readonly relay: ReplyRelay;
}

interface GuestPorts extends VisitOutlet {
  readonly joinHost: JoinPeerConnection;
  readonly relay: ReplyRelay;
  fallbackTimer: ReturnType<typeof setTimeout> | undefined;
}

export const REPLY_FALLBACK_MS = 15_000;

const STARTED = { kind: "started" } as const;
const LEFT = { kind: "left" } as const;
const FALLBACK_TIMER_FIRED: GuestEvent = { kind: "fallbackTimerFired" };

export function startHostVisit(
  connectHost: HostPeerConnection,
  relay: ReplyRelay,
  show: ShowVisitState,
  startRemoteMatch: StartRemoteMatch,
): HostVisit {
  const host = newHostProgress();
  const ports: HostPorts = { connectHost, relay, show, startRemoteMatch };
  const feed = effectLoop<HostEvent, HostEffect>(
    (event) => hostTransition(host, event),
    (effect, feedBack) => performHostEffect(ports, effect, feedBack),
  );
  const settled = feed(STARTED);
  const submitReply = (replyCode: string) => submitReplyCode(feed, replyCode);
  const leave = () => {
    feed(LEFT);
  };
  return { settled, submitReply, leave };
}

export function startGuestVisit(
  joinHost: JoinPeerConnection,
  relay: ReplyRelay,
  invitation: Invitation,
  show: ShowVisitState,
  startRemoteMatch: StartRemoteMatch,
): RemoteVisit {
  const guest = newGuestProgress(invitation);
  const ports: GuestPorts = { joinHost, relay, show, startRemoteMatch, fallbackTimer: undefined };
  const feed = effectLoop<GuestEvent, GuestEffect>(
    (event) => guestTransition(guest, event),
    (effect, feedBack) => performGuestEffect(ports, effect, feedBack),
  );
  const settled = feed(STARTED);
  const leave = () => {
    feed(LEFT);
  };
  return { settled, leave };
}

function submitReplyCode(feed: Feed<HostEvent>, replyCode: string): Promise<void> {
  const submitted: HostEvent = { kind: "replySubmitted", replyCode };
  return feed(submitted);
}

function performHostEffect(ports: HostPorts, effect: HostEffect, feed: Feed<HostEvent>): Promise<HostEvent> | void {
  switch (effect.kind) {
    case "connectHost":
      return ports.connectHost().then(connected, preparationFailed);
    case "awaitReplies":
      return openReplyRoom(ports.relay, feed);
    case "accept":
      return effect.invitation.accept(effect.replyCode).then(accepted, acceptFailed);
    default:
      return performVisitEffect(ports, effect);
  }
}

function openReplyRoom(relay: ReplyRelay, feed: Feed<HostEvent>): Promise<HostEvent> {
  const takeReply = (replyCode: string) => submitReplyCode(feed, replyCode);
  return relay.awaitReplies(takeReply).then(roomOpened, preparationFailed);
}

function performGuestEffect(ports: GuestPorts, effect: GuestEffect, feed: Feed<GuestEvent>): Promise<GuestEvent> | void {
  switch (effect.kind) {
    case "join":
      return ports.joinHost(effect.offerCode).then(joined, joinFailed);
    case "awaitOpened":
      return effect.reply.opened.then(opened, joinFailed);
    case "deliverReply":
      return ports.relay.deliverReply(effect.roomSecret, effect.replyCode).then(delivered);
    case "startFallbackTimer":
      ports.fallbackTimer = setTimeout(() => feed(FALLBACK_TIMER_FIRED), REPLY_FALLBACK_MS);
      return;
    case "cancelFallbackTimer":
      clearTimeout(ports.fallbackTimer);
      return;
    default:
      return performVisitEffect(ports, effect);
  }
}

function performVisitEffect(outlet: VisitOutlet, effect: VisitEffect): void {
  switch (effect.kind) {
    case "show":
      outlet.show(effect.state);
      return;
    case "close":
      effect.handle.close();
      return;
    case "handOver":
      outlet.startRemoteMatch(effect.role, effect.link);
      return;
    case "rethrow":
      throw effect.error;
  }
}

function connected(invitation: HostInvitation): HostEvent {
  return { kind: "connected", invitation };
}

function roomOpened(room: ReplyRoom): HostEvent {
  return { kind: "roomOpened", room };
}

function accepted(link: PeerLink): HostEvent {
  return { kind: "accepted", link };
}

function preparationFailed(error: unknown): HostEvent {
  return { kind: "preparationFailed", ...failingOf(error) };
}

function acceptFailed(error: unknown): HostEvent {
  return { kind: "acceptFailed", ...failingOf(error) };
}

function joined(reply: GuestReply): GuestEvent {
  return { kind: "joined", reply };
}

function opened(link: PeerLink): GuestEvent {
  return { kind: "opened", link };
}

function delivered(delivery: ReplyDelivery): GuestEvent {
  return { kind: "delivered", delivery };
}

function joinFailed(error: unknown): GuestEvent {
  return { kind: "joinFailed", ...failingOf(error) };
}

function failingOf(error: unknown): Failing {
  const failure = error instanceof PeerConnectionError ? error.reason : "unexpected";
  return { failure, error };
}
