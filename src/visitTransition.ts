// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { GuestReply, HostInvitation, PeerConnectionFailure, PeerLink } from "./peerConnection";
import type { RemoteRole } from "./remoteMatch";
import type { ReplyDelivery, ReplyRoom } from "./replyRelay";

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

export interface HostProgress {
  left: boolean;
  invitation: HostInvitation | undefined;
  invitationAwaitingReply: HostInvitation | undefined;
  room: ReplyRoom | undefined;
}

export interface GuestProgress {
  readonly invitation: Invitation;
  left: boolean;
  reply: GuestReply | undefined;
  dueReplyCode: string | undefined;
}

interface Closable {
  close(): void;
}

export type VisitEffect =
  | { readonly kind: "show"; readonly state: VisitState }
  | { readonly kind: "close"; readonly handle: Closable }
  | { readonly kind: "handOver"; readonly role: RemoteRole; readonly link: PeerLink }
  | { readonly kind: "rethrow"; readonly error: unknown };

export type HostEffect =
  | VisitEffect
  | { readonly kind: "connectHost" }
  | { readonly kind: "awaitReplies" }
  | { readonly kind: "accept"; readonly invitation: HostInvitation; readonly replyCode: string };

export type GuestEffect =
  | VisitEffect
  | { readonly kind: "join"; readonly offerCode: string }
  | { readonly kind: "awaitOpened"; readonly reply: GuestReply }
  | { readonly kind: "deliverReply"; readonly roomSecret: string; readonly replyCode: string }
  | { readonly kind: "startFallbackTimer" }
  | { readonly kind: "cancelFallbackTimer" };

export type HostEvent =
  | { readonly kind: "started" }
  | { readonly kind: "left" }
  | { readonly kind: "connected"; readonly invitation: HostInvitation }
  | { readonly kind: "roomOpened"; readonly room: ReplyRoom }
  | { readonly kind: "preparationFailed"; readonly failure: VisitFailure; readonly error: unknown }
  | { readonly kind: "replySubmitted"; readonly replyCode: string }
  | { readonly kind: "accepted"; readonly link: PeerLink }
  | { readonly kind: "acceptFailed"; readonly failure: VisitFailure; readonly error: unknown };

export type GuestEvent =
  | { readonly kind: "started" }
  | { readonly kind: "left" }
  | { readonly kind: "joined"; readonly reply: GuestReply }
  | { readonly kind: "delivered"; readonly delivery: ReplyDelivery }
  | { readonly kind: "fallbackTimerFired" }
  | { readonly kind: "opened"; readonly link: PeerLink }
  | { readonly kind: "joinFailed"; readonly failure: VisitFailure; readonly error: unknown };

export interface Failing {
  readonly failure: VisitFailure;
  readonly error: unknown;
}

interface Leavable {
  readonly left: boolean;
}

const PENDING: VisitState = { phase: "pending" };
const JOINING: VisitState = { phase: "joining" };
const CONNECTING: VisitState = { phase: "connecting" };
const HANDED_OVER: VisitState = { phase: "handedOver" };
const CONNECT_HOST: HostEffect = { kind: "connectHost" };
const AWAIT_REPLIES: HostEffect = { kind: "awaitReplies" };
const START_FALLBACK_TIMER: GuestEffect = { kind: "startFallbackTimer" };
const CANCEL_FALLBACK_TIMER: GuestEffect = { kind: "cancelFallbackTimer" };

const RETRYABLE_REPLY_FAILURES: ReadonlySet<VisitFailure> = new Set(["malformed", "wrongKind", "protocolMismatch"]);

export function newHostProgress(): HostProgress {
  return { left: false, invitation: undefined, invitationAwaitingReply: undefined, room: undefined };
}

export function newGuestProgress(invitation: Invitation): GuestProgress {
  return { invitation, left: false, reply: undefined, dueReplyCode: undefined };
}

export function hostTransition(host: HostProgress, event: HostEvent): HostEffect[] {
  switch (event.kind) {
    case "started":
      return [...showing(host, PENDING), CONNECT_HOST];
    case "left":
      return leaveHost(host);
    case "connected":
      return adoptInvitation(host, event.invitation);
    case "roomOpened":
      return adoptRoom(host, event.room);
    case "preparationFailed":
      return failed(host, event, false);
    case "replySubmitted":
      return takeReplyCode(host, event.replyCode);
    case "accepted":
      return handOverHostLink(host, event.link);
    case "acceptFailed":
      return rejectReplyCode(host, event);
  }
}

export function guestTransition(guest: GuestProgress, event: GuestEvent): GuestEffect[] {
  switch (event.kind) {
    case "started":
      return [...showing(guest, PENDING), { kind: "join", offerCode: guest.invitation.offerCode }];
    case "left":
      return leaveGuest(guest);
    case "joined":
      return adoptReply(guest, event.reply);
    case "delivered":
      return event.delivery === "unreached" ? showReplyCode(guest) : [];
    case "fallbackTimerFired":
      return showReplyCode(guest);
    case "opened":
      return handOverGuestLink(guest, event.link);
    case "joinFailed":
      return [...cancelFallback(guest), ...failed(guest, event, false)];
  }
}

function leaveHost(host: HostProgress): HostEffect[] {
  const closingHandles = closing(host.invitation, host.room);
  host.left = true;
  host.invitation = undefined;
  host.invitationAwaitingReply = undefined;
  host.room = undefined;
  return closingHandles;
}

function adoptInvitation(host: HostProgress, invitation: HostInvitation): HostEffect[] {
  if (host.left) {
    return closing(invitation);
  }
  host.invitation = invitation;
  return [AWAIT_REPLIES];
}

function adoptRoom(host: HostProgress, room: ReplyRoom): HostEffect[] {
  const invitation = host.invitation;
  if (invitation === undefined) {
    return closing(room);
  }
  host.room = room;
  host.invitationAwaitingReply = invitation;
  const shownInvitation: Invitation = { offerCode: invitation.offerCode, roomSecret: room.roomSecret };
  return showing(host, { phase: "invitation", invitation: shownInvitation });
}

function takeReplyCode(host: HostProgress, replyCode: string): HostEffect[] {
  const invitation = host.invitationAwaitingReply;
  if (invitation === undefined) {
    return [];
  }
  host.invitationAwaitingReply = undefined;
  return [...showing(host, CONNECTING), { kind: "accept", invitation, replyCode }];
}

function handOverHostLink(host: HostProgress, link: PeerLink): HostEffect[] {
  const closingRoom = closeRoom(host);
  if (host.left) {
    return [...closingRoom, ...closing(link)];
  }
  host.invitation = undefined;
  return [...closingRoom, ...showing(host, HANDED_OVER), { kind: "handOver", role: "host", link }];
}

function rejectReplyCode(host: HostProgress, failing: Readonly<Failing>): HostEffect[] {
  const retry = RETRYABLE_REPLY_FAILURES.has(failing.failure) && !host.left;
  if (retry) {
    host.invitationAwaitingReply = host.invitation;
    return failed(host, failing, true);
  }
  return [...closeRoom(host), ...failed(host, failing, false)];
}

function closeRoom(host: HostProgress): VisitEffect[] {
  const closingRoom = closing(host.room);
  host.room = undefined;
  return closingRoom;
}

function leaveGuest(guest: GuestProgress): GuestEffect[] {
  const closingReply = closing(guest.reply);
  const cancelling = cancelFallback(guest);
  guest.left = true;
  guest.reply = undefined;
  return [...closingReply, ...cancelling];
}

function adoptReply(guest: GuestProgress, reply: GuestReply): GuestEffect[] {
  if (guest.left) {
    return closing(reply);
  }
  guest.reply = reply;
  guest.dueReplyCode = reply.replyCode;
  return [
    ...showing(guest, JOINING),
    { kind: "deliverReply", roomSecret: guest.invitation.roomSecret, replyCode: reply.replyCode },
    START_FALLBACK_TIMER,
    { kind: "awaitOpened", reply },
  ];
}

function showReplyCode(guest: GuestProgress): GuestEffect[] {
  const code = guest.dueReplyCode;
  if (code === undefined) {
    return [];
  }
  guest.dueReplyCode = undefined;
  return [CANCEL_FALLBACK_TIMER, ...showing(guest, { phase: "replyCode", code })];
}

function handOverGuestLink(guest: GuestProgress, link: PeerLink): GuestEffect[] {
  const cancelling = cancelFallback(guest);
  if (guest.left) {
    return [...cancelling, ...closing(link)];
  }
  guest.reply = undefined;
  return [...cancelling, ...showing(guest, HANDED_OVER), { kind: "handOver", role: "guest", link }];
}

function cancelFallback(guest: GuestProgress): GuestEffect[] {
  if (guest.dueReplyCode === undefined) {
    return [];
  }
  guest.dueReplyCode = undefined;
  return [CANCEL_FALLBACK_TIMER];
}

function failed(progress: Leavable, failing: Readonly<Failing>, retry: boolean): VisitEffect[] {
  const { failure, error } = failing;
  const rethrowing: VisitEffect[] = failure === "unexpected" ? [{ kind: "rethrow", error }] : [];
  return [...showing(progress, { phase: "failed", failure, retry }), ...rethrowing];
}

function showing(progress: Leavable, state: VisitState): VisitEffect[] {
  return progress.left ? [] : [{ kind: "show", state }];
}

function closing(...handles: (Closable | undefined)[]): VisitEffect[] {
  return handles.filter((handle) => handle !== undefined).map((handle) => ({ kind: "close", handle }));
}
