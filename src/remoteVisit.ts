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

export type StartRemoteMatch = (role: RemoteRole, link: PeerLink) => void;

export interface PeerConnectors {
  host: HostPeerConnection;
  join: JoinPeerConnection;
}

export type VisitFailure = PeerConnectionFailure | "unexpected";

export type VisitState =
  | { readonly phase: "pending" }
  | { readonly phase: "invitation"; readonly code: string }
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
}

const PENDING: VisitState = { phase: "pending" };
const CONNECTING: VisitState = { phase: "connecting" };
const HANDED_OVER: VisitState = { phase: "handedOver" };

const RETRYABLE_REPLY_FAILURES: ReadonlySet<PeerConnectionFailure> = new Set(["malformed", "wrongKind", "protocolMismatch"]);

export function startHostVisit(
  connectHost: HostPeerConnection,
  show: ShowVisitState,
  startRemoteMatch: StartRemoteMatch,
): HostVisit {
  const visit = beginVisit(show);
  const host: HostFlow = { visit, invitationAwaitingReply: undefined };
  const settled = prepareInvitation(host, connectHost);
  const submitReply = (replyCode: string) => acceptReplyCode(host, replyCode, startRemoteMatch);
  const leave = () => leaveHostVisit(host);
  return { settled, submitReply, leave };
}

export function startGuestVisit(
  joinHost: JoinPeerConnection,
  offerCode: string,
  show: ShowVisitState,
  startRemoteMatch: StartRemoteMatch,
): RemoteVisit {
  const visit = beginVisit(show);
  const settled = joinWithReply(visit, joinHost, offerCode, startRemoteMatch);
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
  leaveVisit(host.visit);
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

async function prepareInvitation(host: HostFlow, connectHost: HostPeerConnection): Promise<void> {
  showState(host.visit, PENDING);
  try {
    const invitation = await connectHost();
    if (!adopt(host.visit, invitation)) {
      return;
    }
    host.invitationAwaitingReply = invitation;
    const invitationState: VisitState = { phase: "invitation", code: invitation.offerCode };
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
    if (!adopt(host.visit, link)) {
      return;
    }
    handOver(host.visit, "host", link, startRemoteMatch);
  } catch (error) {
    const retry = isRetryableReplyFailure(error);
    if (retry && host.visit.active) {
      host.invitationAwaitingReply = invitation;
    }
    fail(host.visit, error, retry);
  }
}

async function joinWithReply(
  visit: Visit,
  joinHost: JoinPeerConnection,
  offerCode: string,
  startRemoteMatch: StartRemoteMatch,
): Promise<void> {
  showState(visit, PENDING);
  try {
    const reply = await joinHost(offerCode);
    if (!adopt(visit, reply)) {
      return;
    }
    const invitationState: VisitState = { phase: "invitation", code: reply.replyCode };
    showState(visit, invitationState);
    const link = await reply.opened;
    if (!adopt(visit, link)) {
      return;
    }
    handOver(visit, "guest", link, startRemoteMatch);
  } catch (error) {
    fail(visit, error, false);
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
