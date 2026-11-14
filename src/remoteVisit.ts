// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  PeerConnectionError,
  type HostInvitation,
  type HostPeerConnection,
  type JoinPeerConnection,
  type PeerConnectionFailure,
  type PeerLink,
} from "./peerConnection";
import type { RemoteRole } from "./remoteMatch";
import type { ReplyDelivery, ReplyRelay } from "./replyRelay";

export type StartRemoteMatch = (role: RemoteRole, link: PeerLink) => void;

export interface PeerConnectors {
  host: HostPeerConnection;
  join: JoinPeerConnection;
}

export type VisitFailure = PeerConnectionFailure | "unexpected";

export interface Invitation {
  readonly offerCode: string;
  readonly roomSecret: string;
}

export type VisitState =
  | { readonly phase: "pending" }
  | { readonly phase: "invitation"; readonly invitation: Invitation }
  | { readonly phase: "joining" }
  | { readonly phase: "replyCode"; readonly code: string }
  | { readonly phase: "connecting" }
  | { readonly phase: "handedOver" }
  | { readonly phase: "failed"; readonly failure: VisitFailure; readonly retry: boolean };

export type ShowVisitState = (state: VisitState) => void;

export interface RemoteVisit {
  readonly settled: Promise<void>;
  leave(): void;
}

export interface HostVisit extends RemoteVisit {
  submitReply(replyCode: string): Promise<void>;
}

interface Closable {
  close(): void;
}

interface Visit {
  active: boolean;
  connection: Closable | undefined;
  readonly show: ShowVisitState;
}

interface HostFlow {
  readonly visit: Visit;
  invitationAwaitingReply: HostInvitation | undefined;
  room: Closable | undefined;
}

interface ReplyCodeFallback {
  cancel(): void;
}

export const REPLY_FALLBACK_MS = 15_000;

const PENDING: VisitState = { phase: "pending" };
const JOINING: VisitState = { phase: "joining" };
const CONNECTING: VisitState = { phase: "connecting" };
const HANDED_OVER: VisitState = { phase: "handedOver" };

const RETRYABLE_REPLY_FAILURES: ReadonlySet<PeerConnectionFailure> = new Set(["malformed", "wrongKind", "protocolMismatch"]);

export function startHostVisit(
  connectHost: HostPeerConnection,
  relay: ReplyRelay,
  show: ShowVisitState,
  startRemoteMatch: StartRemoteMatch,
): HostVisit {
  const visit = beginVisit(show);
  const host: HostFlow = { visit, invitationAwaitingReply: undefined, room: undefined };
  const settled = prepareInvitation(host, connectHost, relay, startRemoteMatch);
  const submitReply = (replyCode: string) => acceptReplyCode(host, replyCode, startRemoteMatch);
  const leave = () => leaveHostVisit(host);
  return { settled, submitReply, leave };
}

export function startGuestVisit(
  joinHost: JoinPeerConnection,
  relay: ReplyRelay,
  invitation: Invitation,
  show: ShowVisitState,
  startRemoteMatch: StartRemoteMatch,
): RemoteVisit {
  const visit = beginVisit(show);
  const settled = joinWithReply(visit, joinHost, relay, invitation, startRemoteMatch);
  const leave = () => leaveVisit(visit);
  return { settled, leave };
}

function beginVisit(show: ShowVisitState): Visit {
  return { active: true, connection: undefined, show };
}

function leaveVisit(visit: Visit): void {
  visit.active = false;
  visit.connection?.close();
}

function leaveHostVisit(host: HostFlow): void {
  host.invitationAwaitingReply = undefined;
  closeRoom(host);
  leaveVisit(host.visit);
}

function closeRoom(host: HostFlow): void {
  host.room?.close();
  host.room = undefined;
}

function showState(visit: Visit, state: VisitState): void {
  if (visit.active) {
    visit.show(state);
  }
}

function adopt(visit: Visit, connection: Closable): boolean {
  if (!visit.active) {
    connection.close();
    return false;
  }
  visit.connection = connection;
  return true;
}

function handOver(visit: Visit, role: RemoteRole, link: PeerLink, startRemoteMatch: StartRemoteMatch): void {
  visit.connection = undefined;
  showState(visit, HANDED_OVER);
  startRemoteMatch(role, link);
}

async function prepareInvitation(
  host: HostFlow,
  connectHost: HostPeerConnection,
  relay: ReplyRelay,
  startRemoteMatch: StartRemoteMatch,
): Promise<void> {
  showState(host.visit, PENDING);
  try {
    const hostInvitation = await connectHost();
    if (!adopt(host.visit, hostInvitation)) {
      return;
    }
    host.invitationAwaitingReply = hostInvitation;
    const room = await relay.awaitReplies((replyCode) => acceptReplyCode(host, replyCode, startRemoteMatch));
    if (!host.visit.active) {
      room.close();
      return;
    }
    host.room = room;
    const invitation: Invitation = { offerCode: hostInvitation.offerCode, roomSecret: room.roomSecret };
    const invitationState: VisitState = { phase: "invitation", invitation };
    showState(host.visit, invitationState);
  } catch (error) {
    fail(host.visit, error, false);
  }
}

async function acceptReplyCode(host: HostFlow, replyCode: string, startRemoteMatch: StartRemoteMatch): Promise<void> {
  const invitation = host.invitationAwaitingReply;
  if (invitation === undefined) {
    return;
  }
  host.invitationAwaitingReply = undefined;
  showState(host.visit, CONNECTING);
  try {
    const link = await invitation.accept(replyCode);
    closeRoom(host);
    if (!adopt(host.visit, link)) {
      return;
    }
    handOver(host.visit, "host", link, startRemoteMatch);
  } catch (error) {
    const retry = isRetryableReplyFailure(error) && host.visit.active;
    if (retry) {
      host.invitationAwaitingReply = invitation;
    } else {
      closeRoom(host);
    }
    fail(host.visit, error, retry);
  }
}

async function joinWithReply(
  visit: Visit,
  joinHost: JoinPeerConnection,
  relay: ReplyRelay,
  invitation: Invitation,
  startRemoteMatch: StartRemoteMatch,
): Promise<void> {
  showState(visit, PENDING);
  try {
    const reply = await joinHost(invitation.offerCode);
    if (!adopt(visit, reply)) {
      return;
    }
    showState(visit, JOINING);
    const delivery = relay.deliverReply(invitation.roomSecret, reply.replyCode);
    const fallback = scheduleReplyCodeFallback(visit, reply.replyCode, delivery);
    const link = await openedBeforeFallback(reply.opened, fallback);
    if (!adopt(visit, link)) {
      return;
    }
    handOver(visit, "guest", link, startRemoteMatch);
  } catch (error) {
    fail(visit, error, false);
  }
}

function scheduleReplyCodeFallback(visit: Visit, replyCode: string, delivery: Promise<ReplyDelivery>): ReplyCodeFallback {
  let due = true;
  const showReplyCode = () => {
    if (!due) {
      return;
    }
    due = false;
    clearTimeout(timer);
    const replyCodeState: VisitState = { phase: "replyCode", code: replyCode };
    showState(visit, replyCodeState);
  };
  const timer = setTimeout(showReplyCode, REPLY_FALLBACK_MS);
  delivery.then((outcome) => {
    if (outcome === "unreached") {
      showReplyCode();
    }
  });
  const cancel = () => {
    due = false;
    clearTimeout(timer);
  };
  return { cancel };
}

async function openedBeforeFallback(opened: Promise<PeerLink>, fallback: ReplyCodeFallback): Promise<PeerLink> {
  try {
    return await opened;
  } finally {
    fallback.cancel();
  }
}

function isRetryableReplyFailure(error: unknown): boolean {
  return error instanceof PeerConnectionError && RETRYABLE_REPLY_FAILURES.has(error.reason);
}

function fail(visit: Visit, error: unknown, retry: boolean): void {
  const failed = failedState(error, retry);
  showState(visit, failed);
  if (!(error instanceof PeerConnectionError)) {
    throw error;
  }
}

function failedState(error: unknown, retry: boolean): VisitState {
  const failure = error instanceof PeerConnectionError ? error.reason : "unexpected";
  return { phase: "failed", failure, retry };
}
