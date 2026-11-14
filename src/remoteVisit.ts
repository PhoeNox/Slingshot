// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

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
  type GuestAction,
  type GuestEvent,
  type GuestProgress,
  type HostAction,
  type HostEvent,
  type HostProgress,
  type Invitation,
  type VisitAction,
  type VisitFailure,
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

interface HostDriver extends VisitOutlet {
  readonly host: HostProgress;
  readonly connectHost: HostPeerConnection;
  readonly relay: ReplyRelay;
}

interface GuestDriver extends VisitOutlet {
  readonly guest: GuestProgress;
  readonly joinHost: JoinPeerConnection;
  readonly relay: ReplyRelay;
  fallbackTimer: ReturnType<typeof setTimeout> | undefined;
}

interface Arrival<Event> {
  readonly event: Event;
  readonly error: unknown;
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
  const driver: HostDriver = { host, connectHost, relay, show, startRemoteMatch };
  const settled = dispatchHost(driver, STARTED);
  const submitReply = (replyCode: string) => submitReplyCode(driver, replyCode);
  const leave = () => {
    dispatchHost(driver, LEFT);
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
  const driver: GuestDriver = { guest, joinHost, relay, show, startRemoteMatch, fallbackTimer: undefined };
  const settled = dispatchGuest(driver, STARTED);
  const leave = () => {
    dispatchGuest(driver, LEFT);
  };
  return { settled, leave };
}

async function dispatchHost(driver: HostDriver, event: HostEvent, error?: unknown): Promise<void> {
  const actions = hostTransition(driver.host, event);
  const performed = actions.map((action) => performHostAction(driver, action, error));
  await Promise.all(performed);
}

async function dispatchGuest(driver: GuestDriver, event: GuestEvent, error?: unknown): Promise<void> {
  const actions = guestTransition(driver.guest, event);
  const performed = actions.map((action) => performGuestAction(driver, action, error));
  await Promise.all(performed);
}

function submitReplyCode(driver: HostDriver, replyCode: string): Promise<void> {
  const submitted: HostEvent = { kind: "replySubmitted", replyCode };
  return dispatchHost(driver, submitted);
}

async function performHostAction(driver: HostDriver, action: HostAction, error: unknown): Promise<void> {
  switch (action.kind) {
    case "connectHost":
      return prepareInvitation(driver);
    case "awaitReplies":
      return openReplyRoom(driver);
    case "accept":
      return acceptReplyCode(driver, action.invitation, action.replyCode);
    default:
      return performVisitAction(driver, action, error);
  }
}

async function performGuestAction(driver: GuestDriver, action: GuestAction, error: unknown): Promise<void> {
  switch (action.kind) {
    case "join":
      return joinOffer(driver, action.offerCode);
    case "awaitOpened":
      return awaitOpened(driver, action.reply);
    case "deliverReply":
      deliverReply(driver, action.roomSecret, action.replyCode);
      return;
    case "startFallbackTimer":
      driver.fallbackTimer = setTimeout(() => dispatchGuest(driver, FALLBACK_TIMER_FIRED), REPLY_FALLBACK_MS);
      return;
    case "cancelFallbackTimer":
      clearTimeout(driver.fallbackTimer);
      return;
    default:
      return performVisitAction(driver, action, error);
  }
}

async function performVisitAction(outlet: VisitOutlet, action: VisitAction, error: unknown): Promise<void> {
  switch (action.kind) {
    case "show":
      outlet.show(action.state);
      return;
    case "close":
      action.handle.close();
      return;
    case "handOver":
      outlet.startRemoteMatch(action.role, action.link);
      return;
    case "rethrow":
      throw error;
  }
}

async function prepareInvitation(driver: HostDriver): Promise<void> {
  const preparing = driver.connectHost();
  const arrival = await arrive<HostEvent, HostInvitation>(
    preparing,
    (invitation) => ({ kind: "connected", invitation }),
    (failure) => ({ kind: "preparationFailed", failure }),
  );
  return dispatchHost(driver, arrival.event, arrival.error);
}

async function openReplyRoom(driver: HostDriver): Promise<void> {
  const opening = driver.relay.awaitReplies((replyCode) => submitReplyCode(driver, replyCode));
  const arrival = await arrive<HostEvent, ReplyRoom>(
    opening,
    (room) => ({ kind: "roomOpened", room }),
    (failure) => ({ kind: "preparationFailed", failure }),
  );
  return dispatchHost(driver, arrival.event, arrival.error);
}

async function acceptReplyCode(driver: HostDriver, invitation: HostInvitation, replyCode: string): Promise<void> {
  const accepting = invitation.accept(replyCode);
  const arrival = await arrive<HostEvent, PeerLink>(
    accepting,
    (link) => ({ kind: "accepted", link }),
    (failure) => ({ kind: "acceptFailed", failure }),
  );
  return dispatchHost(driver, arrival.event, arrival.error);
}

async function joinOffer(driver: GuestDriver, offerCode: string): Promise<void> {
  const joining = driver.joinHost(offerCode);
  const arrival = await arrive<GuestEvent, GuestReply>(
    joining,
    (reply) => ({ kind: "joined", reply }),
    (failure) => ({ kind: "joinFailed", failure }),
  );
  return dispatchGuest(driver, arrival.event, arrival.error);
}

async function awaitOpened(driver: GuestDriver, reply: GuestReply): Promise<void> {
  const arrival = await arrive<GuestEvent, PeerLink>(
    reply.opened,
    (link) => ({ kind: "opened", link }),
    (failure) => ({ kind: "joinFailed", failure }),
  );
  return dispatchGuest(driver, arrival.event, arrival.error);
}

function deliverReply(driver: GuestDriver, roomSecret: string, replyCode: string): void {
  const delivering = driver.relay.deliverReply(roomSecret, replyCode);
  delivering.then((delivery) => reportDelivery(driver, delivery));
}

function reportDelivery(driver: GuestDriver, delivery: ReplyDelivery): Promise<void> {
  const delivered: GuestEvent = { kind: "delivered", delivery };
  return dispatchGuest(driver, delivered);
}

async function arrive<Event, Value>(
  pending: Promise<Value>,
  arrived: (value: Value) => Event,
  failed: (failure: VisitFailure) => Event,
): Promise<Arrival<Event>> {
  let value: Value;
  try {
    value = await pending;
  } catch (error) {
    const failure = failureOf(error);
    const failedEvent = failed(failure);
    return { event: failedEvent, error };
  }
  const arrivedEvent = arrived(value);
  return { event: arrivedEvent, error: undefined };
}

function failureOf(error: unknown): VisitFailure {
  return error instanceof PeerConnectionError ? error.reason : "unexpected";
}
