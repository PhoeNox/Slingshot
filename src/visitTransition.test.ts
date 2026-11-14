// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import type { GuestReply, HostInvitation, PeerConnectionFailure, PeerLink } from "./peerConnection";
import type { ReplyRoom } from "./replyRelay";
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
} from "./visitTransition";

const OFFER_CODE = "offer-code";
const REPLY_CODE = "reply-code";
const ROOM_SECRET = "room-secret";
const RETRYABLE_REPLY_FAILURES: readonly PeerConnectionFailure[] = ["malformed", "wrongKind", "protocolMismatch"];
const FINAL_REPLY_FAILURES: readonly PeerConnectionFailure[] = ["couldNotConnect", "noCandidates"];
const ALL_FAILURES: readonly PeerConnectionFailure[] = [...RETRYABLE_REPLY_FAILURES, ...FINAL_REPLY_FAILURES];

const never = <T>() => new Promise<T>(() => {});

function fakeInvitation(): HostInvitation {
  return { offerCode: OFFER_CODE, accept: () => never<PeerLink>(), close: () => {} };
}

function fakeRoom(): ReplyRoom {
  return { roomSecret: ROOM_SECRET, close: () => {} };
}

function fakeReply(): GuestReply {
  return { replyCode: REPLY_CODE, opened: never<PeerLink>(), close: () => {} };
}

function fakeLink(): PeerLink {
  return { send: () => {}, onMessage: () => {}, closed: never<void>(), close: () => {} };
}

function host(progress: HostProgress, ...events: HostEvent[]): HostAction[] {
  return events.map((event) => hostTransition(progress, event)).at(-1) ?? [];
}

function guest(progress: GuestProgress, ...events: GuestEvent[]): GuestAction[] {
  return events.map((event) => guestTransition(progress, event)).at(-1) ?? [];
}

interface HostWithRoom {
  progress: HostProgress;
  invitation: HostInvitation;
  room: ReplyRoom;
}

function hostWithRoom(): HostWithRoom {
  const progress = newHostProgress();
  const invitation = fakeInvitation();
  const room = fakeRoom();
  host(progress, { kind: "started" }, { kind: "connected", invitation }, { kind: "roomOpened", room });
  return { progress, invitation, room };
}

interface GuestWithReply {
  progress: GuestProgress;
  reply: GuestReply;
}

function guestWithReply(): GuestWithReply {
  const progress = newGuestProgress({ offerCode: OFFER_CODE, roomSecret: ROOM_SECRET });
  const reply = fakeReply();
  guest(progress, { kind: "started" }, { kind: "joined", reply });
  return { progress, reply };
}

describe("the host's visit", () => {
  test("shows pending and prepares the invitation when it starts", () => {
    const progress = newHostProgress();
    expect(host(progress, { kind: "started" })).toEqual([{ kind: "show", state: { phase: "pending" } }, { kind: "connectHost" }]);
  });

  test("opens the reply room once the invitation is prepared", () => {
    const progress = newHostProgress();
    const invitation = fakeInvitation();
    expect(host(progress, { kind: "started" }, { kind: "connected", invitation })).toEqual([{ kind: "awaitReplies" }]);
  });

  test("shows the invitation with the room's secret once the room opens", () => {
    const progress = newHostProgress();
    const invitation = fakeInvitation();
    const room = fakeRoom();
    const actions = host(progress, { kind: "started" }, { kind: "connected", invitation }, { kind: "roomOpened", room });
    expect(actions).toEqual([{ kind: "show", state: { phase: "invitation", invitation: { offerCode: OFFER_CODE, roomSecret: ROOM_SECRET } } }]);
  });

  test("takes no reply code before the room opens", () => {
    const progress = newHostProgress();
    const invitation = fakeInvitation();
    host(progress, { kind: "started" }, { kind: "connected", invitation });
    expect(host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE })).toEqual([]);
  });

  test("connects with the first reply code and ignores later ones", () => {
    const { progress, invitation } = hostWithRoom();
    expect(host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE })).toEqual([
      { kind: "show", state: { phase: "connecting" } },
      { kind: "accept", invitation, replyCode: REPLY_CODE },
    ]);
    expect(host(progress, { kind: "replySubmitted", replyCode: "later-reply" })).toEqual([]);
  });

  test("closes the room and hands the link over once accepted", () => {
    const { progress, room } = hostWithRoom();
    const link = fakeLink();
    const actions = host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE }, { kind: "accepted", link });
    expect(actions).toEqual([
      { kind: "close", handle: room },
      { kind: "show", state: { phase: "handedOver" } },
      { kind: "handOver", role: "host", link },
    ]);
  });

  test("closes nothing when left after the handover", () => {
    const { progress } = hostWithRoom();
    const link = fakeLink();
    host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE }, { kind: "accepted", link });
    expect(host(progress, { kind: "left" })).toEqual([]);
  });
});

describe("leaving the host's visit", () => {
  test("closes the invitation and the room", () => {
    const { progress, invitation, room } = hostWithRoom();
    expect(host(progress, { kind: "left" })).toEqual([
      { kind: "close", handle: invitation },
      { kind: "close", handle: room },
    ]);
  });

  test("closes an invitation prepared afterwards", () => {
    const progress = newHostProgress();
    const invitation = fakeInvitation();
    host(progress, { kind: "started" }, { kind: "left" });
    expect(host(progress, { kind: "connected", invitation })).toEqual([{ kind: "close", handle: invitation }]);
  });

  test("closes a room opened afterwards, showing no invitation", () => {
    const progress = newHostProgress();
    const invitation = fakeInvitation();
    const room = fakeRoom();
    host(progress, { kind: "started" }, { kind: "connected", invitation }, { kind: "left" });
    expect(host(progress, { kind: "roomOpened", room })).toEqual([{ kind: "close", handle: room }]);
  });

  test("closes a link accepted afterwards and never hands it over", () => {
    const { progress } = hostWithRoom();
    const link = fakeLink();
    host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE }, { kind: "left" });
    expect(host(progress, { kind: "accepted", link })).toEqual([{ kind: "close", handle: link }]);
  });

  test("ignores a reply code submitted afterwards", () => {
    const { progress } = hostWithRoom();
    expect(host(progress, { kind: "left" }, { kind: "replySubmitted", replyCode: REPLY_CODE })).toEqual([]);
  });

  test("shows nothing and offers no retry for a rejected reply code afterwards", () => {
    const { progress } = hostWithRoom();
    host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE }, { kind: "left" });
    expect(host(progress, { kind: "acceptFailed", failure: "malformed" })).toEqual([]);
    expect(host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE })).toEqual([]);
  });
});

describe("retrying the host's reply code", () => {
  test.each(RETRYABLE_REPLY_FAILURES)("is offered after a rejected reply code (%s), keeping the room", (failure) => {
    const { progress, invitation } = hostWithRoom();
    const actions = host(progress, { kind: "replySubmitted", replyCode: "bad" }, { kind: "acceptFailed", failure });
    expect(actions).toEqual([{ kind: "show", state: { phase: "failed", failure, retry: true } }]);
    expect(host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE })).toContainEqual({ kind: "accept", invitation, replyCode: REPLY_CODE });
  });

  test.each(FINAL_REPLY_FAILURES)("is not offered after a reply fails with %s, closing the room", (failure) => {
    const { progress, room } = hostWithRoom();
    const actions = host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE }, { kind: "acceptFailed", failure });
    expect(actions).toEqual([
      { kind: "close", handle: room },
      { kind: "show", state: { phase: "failed", failure, retry: false } },
    ]);
    expect(host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE })).toEqual([]);
  });

  test("is not offered when preparing the invitation fails", () => {
    const progress = newHostProgress();
    const actions = host(progress, { kind: "started" }, { kind: "preparationFailed", failure: "noCandidates" });
    expect(actions).toEqual([{ kind: "show", state: { phase: "failed", failure: "noCandidates", retry: false } }]);
  });
});

describe("an unexpected host failure", () => {
  test("is shown and rethrown", () => {
    const { progress, room } = hostWithRoom();
    const actions = host(progress, { kind: "replySubmitted", replyCode: REPLY_CODE }, { kind: "acceptFailed", failure: "unexpected" });
    expect(actions).toEqual([
      { kind: "close", handle: room },
      { kind: "show", state: { phase: "failed", failure: "unexpected", retry: false } },
      { kind: "rethrow" },
    ]);
  });

  test("after leaving is only rethrown", () => {
    const progress = newHostProgress();
    host(progress, { kind: "started" }, { kind: "left" });
    expect(host(progress, { kind: "preparationFailed", failure: "unexpected" })).toEqual([{ kind: "rethrow" }]);
  });
});

describe("the guest's visit", () => {
  test("shows pending and joins the invitation's offer when it starts", () => {
    const progress = newGuestProgress({ offerCode: OFFER_CODE, roomSecret: ROOM_SECRET });
    expect(guest(progress, { kind: "started" })).toEqual([
      { kind: "show", state: { phase: "pending" } },
      { kind: "join", offerCode: OFFER_CODE },
    ]);
  });

  test("delivers its reply to the room, starts the fallback timer and awaits the link", () => {
    const progress = newGuestProgress({ offerCode: OFFER_CODE, roomSecret: ROOM_SECRET });
    const reply = fakeReply();
    expect(guest(progress, { kind: "started" }, { kind: "joined", reply })).toEqual([
      { kind: "show", state: { phase: "joining" } },
      { kind: "deliverReply", roomSecret: ROOM_SECRET, replyCode: REPLY_CODE },
      { kind: "startFallbackTimer" },
      { kind: "awaitOpened", reply },
    ]);
  });

  test("hands the link over once opened, cancelling the fallback timer", () => {
    const { progress } = guestWithReply();
    const link = fakeLink();
    expect(guest(progress, { kind: "opened", link })).toEqual([
      { kind: "cancelFallbackTimer" },
      { kind: "show", state: { phase: "handedOver" } },
      { kind: "handOver", role: "guest", link },
    ]);
  });

  test("closes nothing when left after the handover", () => {
    const { progress } = guestWithReply();
    const link = fakeLink();
    guest(progress, { kind: "opened", link });
    expect(guest(progress, { kind: "left" })).toEqual([]);
  });

  test.each(ALL_FAILURES)("offers no retry when failing with %s", (failure) => {
    const progress = newGuestProgress({ offerCode: OFFER_CODE, roomSecret: ROOM_SECRET });
    const actions = guest(progress, { kind: "started" }, { kind: "joinFailed", failure });
    expect(actions).toEqual([{ kind: "show", state: { phase: "failed", failure, retry: false } }]);
  });

  test("cancels the fallback timer when the link fails to open", () => {
    const { progress } = guestWithReply();
    expect(guest(progress, { kind: "joinFailed", failure: "couldNotConnect" })).toEqual([
      { kind: "cancelFallbackTimer" },
      { kind: "show", state: { phase: "failed", failure: "couldNotConnect", retry: false } },
    ]);
  });

  test("shows and rethrows an unexpected failure", () => {
    const { progress } = guestWithReply();
    expect(guest(progress, { kind: "joinFailed", failure: "unexpected" })).toContainEqual({ kind: "rethrow" });
  });
});

describe("the guest's reply code fallback", () => {
  const replyCodeShown: GuestAction[] = [{ kind: "cancelFallbackTimer" }, { kind: "show", state: { phase: "replyCode", code: REPLY_CODE } }];

  test("is shown at once when no relay accepts the reply, and not again when the timer fires", () => {
    const { progress } = guestWithReply();
    expect(guest(progress, { kind: "delivered", delivery: "unreached" })).toEqual(replyCodeShown);
    expect(guest(progress, { kind: "fallbackTimerFired" })).toEqual([]);
  });

  test("is shown when the timer fires first, and not again when no relay accepts the reply", () => {
    const { progress } = guestWithReply();
    expect(guest(progress, { kind: "fallbackTimerFired" })).toEqual(replyCodeShown);
    expect(guest(progress, { kind: "delivered", delivery: "unreached" })).toEqual([]);
  });

  test("is not shown when a relay accepts the reply", () => {
    const { progress } = guestWithReply();
    expect(guest(progress, { kind: "delivered", delivery: "accepted" })).toEqual([]);
  });

  test("still lets the link open after it is shown", () => {
    const { progress } = guestWithReply();
    const link = fakeLink();
    guest(progress, { kind: "fallbackTimerFired" });
    expect(guest(progress, { kind: "opened", link })).toEqual([
      { kind: "show", state: { phase: "handedOver" } },
      { kind: "handOver", role: "guest", link },
    ]);
  });

  test("is not shown after the link opened", () => {
    const { progress } = guestWithReply();
    const link = fakeLink();
    guest(progress, { kind: "opened", link });
    expect(guest(progress, { kind: "delivered", delivery: "unreached" })).toEqual([]);
    expect(guest(progress, { kind: "fallbackTimerFired" })).toEqual([]);
  });
});

describe("leaving the guest's visit", () => {
  test("closes the reply and cancels the fallback timer", () => {
    const { progress, reply } = guestWithReply();
    expect(guest(progress, { kind: "left" })).toEqual([{ kind: "close", handle: reply }, { kind: "cancelFallbackTimer" }]);
  });

  test("closes a reply prepared afterwards", () => {
    const progress = newGuestProgress({ offerCode: OFFER_CODE, roomSecret: ROOM_SECRET });
    const reply = fakeReply();
    guest(progress, { kind: "started" }, { kind: "left" });
    expect(guest(progress, { kind: "joined", reply })).toEqual([{ kind: "close", handle: reply }]);
  });

  test("closes a link opened afterwards and never hands it over", () => {
    const { progress } = guestWithReply();
    const link = fakeLink();
    guest(progress, { kind: "left" });
    expect(guest(progress, { kind: "opened", link })).toEqual([{ kind: "close", handle: link }]);
  });

  test("shows no reply code afterwards", () => {
    const { progress } = guestWithReply();
    guest(progress, { kind: "left" });
    expect(guest(progress, { kind: "delivered", delivery: "unreached" })).toEqual([]);
    expect(guest(progress, { kind: "fallbackTimerFired" })).toEqual([]);
  });

  test("leaves an unexpected failure afterwards only rethrown", () => {
    const { progress } = guestWithReply();
    guest(progress, { kind: "left" });
    expect(guest(progress, { kind: "joinFailed", failure: "unexpected" })).toEqual([{ kind: "rethrow" }]);
  });
});
