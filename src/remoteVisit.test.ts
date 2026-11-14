// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { PeerConnectionError, type GuestReply, type HostInvitation, type PeerConnectionFailure, type PeerLink } from "./peerConnection";
import type { RemoteRole } from "./remoteMatch";
import { startGuestVisit, startHostVisit, type HostVisit, type RemoteVisit, type VisitState } from "./remoteVisit";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface FakeLink {
  link: PeerLink;
  closed: boolean;
}

interface FakeInvitation {
  invitation: HostInvitation;
  replies: string[];
  pendingAccepts: Deferred<PeerLink>[];
  closed: boolean;
}

interface FakeReply {
  reply: GuestReply;
  opened: Deferred<PeerLink>;
  closed: boolean;
}

interface Observed {
  states: VisitState[];
  handOvers: [RemoteRole, PeerLink][];
}

interface HostHarness extends Observed {
  visit: HostVisit;
  connected: Deferred<HostInvitation>;
}

interface GuestHarness extends Observed {
  visit: RemoteVisit;
  joined: Deferred<GuestReply>;
  offerCodes: string[];
}

const OFFER_CODE = "offer-code";
const REPLY_CODE = "reply-code";
const RETRYABLE_REPLY_FAILURES: readonly PeerConnectionFailure[] = ["malformed", "wrongKind", "protocolMismatch"];
const FINAL_REPLY_FAILURES: readonly PeerConnectionFailure[] = ["couldNotConnect", "noCandidates"];
const ALL_FAILURES: readonly PeerConnectionFailure[] = [...RETRYABLE_REPLY_FAILURES, ...FINAL_REPLY_FAILURES];

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fakeLink(): FakeLink {
  const fake = { closed: false } as FakeLink;
  fake.link = {
    send: () => {},
    onMessage: () => {},
    closed: new Promise<void>(() => {}),
    close: () => {
      fake.closed = true;
    },
  };
  return fake;
}

function fakeInvitation(): FakeInvitation {
  const fake = { replies: [], pendingAccepts: [], closed: false } as unknown as FakeInvitation;
  fake.invitation = {
    offerCode: OFFER_CODE,
    accept: (replyCode) => {
      fake.replies.push(replyCode);
      const accepted = deferred<PeerLink>();
      fake.pendingAccepts.push(accepted);
      return accepted.promise;
    },
    close: () => {
      fake.closed = true;
    },
  };
  return fake;
}

function fakeReply(): FakeReply {
  const opened = deferred<PeerLink>();
  const fake = { opened, closed: false } as FakeReply;
  fake.reply = {
    replyCode: REPLY_CODE,
    opened: opened.promise,
    close: () => {
      fake.closed = true;
    },
  };
  return fake;
}

function observed(): Observed {
  return { states: [], handOvers: [] };
}

function hostHarness(): HostHarness {
  const seen = observed();
  const connected = deferred<HostInvitation>();
  const visit = startHostVisit(
    () => connected.promise,
    (state) => seen.states.push(state),
    (role, link) => seen.handOvers.push([role, link]),
  );
  return { ...seen, visit, connected };
}

function guestHarness(): GuestHarness {
  const seen = observed();
  const joined = deferred<GuestReply>();
  const offerCodes: string[] = [];
  const join = (offerCode: string) => {
    offerCodes.push(offerCode);
    return joined.promise;
  };
  const visit = startGuestVisit(
    join,
    OFFER_CODE,
    (state) => seen.states.push(state),
    (role, link) => seen.handOvers.push([role, link]),
  );
  return { ...seen, visit, joined, offerCodes };
}

async function hostWithInvitation(): Promise<{ h: HostHarness; invitation: FakeInvitation }> {
  const h = hostHarness();
  const invitation = fakeInvitation();
  h.connected.resolve(invitation.invitation);
  await h.visit.settled;
  return { h, invitation };
}

async function guestWithReply(): Promise<{ h: GuestHarness; reply: FakeReply }> {
  const h = guestHarness();
  const reply = fakeReply();
  h.joined.resolve(reply.reply);
  await flush();
  return { h, reply };
}

function rejection(reason: PeerConnectionFailure): PeerConnectionError {
  return new PeerConnectionError(reason, reason);
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("a successful connection", () => {
  test("hands the host's link over once, as host", async () => {
    const { h, invitation } = await hostWithInvitation();
    const link = fakeLink();
    const connecting = h.visit.submitReply(REPLY_CODE);
    const resubmitted = h.visit.submitReply(REPLY_CODE);
    invitation.pendingAccepts[0].resolve(link.link);
    await connecting;
    await resubmitted;
    expect(invitation.replies).toEqual([REPLY_CODE]);
    expect(h.handOvers).toEqual([["host", link.link]]);
    expect(h.states).toEqual([
      { phase: "pending" },
      { phase: "invitation", code: OFFER_CODE },
      { phase: "connecting" },
      { phase: "handedOver" },
    ]);
  });

  test("hands the guest's link over once, as guest", async () => {
    const { h, reply } = await guestWithReply();
    const link = fakeLink();
    reply.opened.resolve(link.link);
    await h.visit.settled;
    expect(h.offerCodes).toEqual([OFFER_CODE]);
    expect(h.handOvers).toEqual([["guest", link.link]]);
    expect(h.states).toEqual([
      { phase: "pending" },
      { phase: "invitation", code: REPLY_CODE },
      { phase: "handedOver" },
    ]);
  });

  test("is not closed by leaving after the handover", async () => {
    const { h, reply } = await guestWithReply();
    const link = fakeLink();
    reply.opened.resolve(link.link);
    await h.visit.settled;
    h.visit.leave();
    expect(link.closed).toBe(false);
  });
});

describe("a connection that arrives after its route was left", () => {
  test("closes the host's invitation", async () => {
    const h = hostHarness();
    const invitation = fakeInvitation();
    h.visit.leave();
    h.connected.resolve(invitation.invitation);
    await h.visit.settled;
    expect(invitation.closed).toBe(true);
    expect(h.states).toEqual([{ phase: "pending" }]);
  });

  test("closes the host's link and never hands it over", async () => {
    const { h, invitation } = await hostWithInvitation();
    const link = fakeLink();
    const connecting = h.visit.submitReply(REPLY_CODE);
    h.visit.leave();
    invitation.pendingAccepts[0].resolve(link.link);
    await connecting;
    expect(link.closed).toBe(true);
    expect(h.handOvers).toEqual([]);
  });

  test("closes the guest's reply", async () => {
    const h = guestHarness();
    const reply = fakeReply();
    h.visit.leave();
    h.joined.resolve(reply.reply);
    await h.visit.settled;
    expect(reply.closed).toBe(true);
    expect(h.states).toEqual([{ phase: "pending" }]);
  });

  test("closes the guest's link and never hands it over", async () => {
    const { h, reply } = await guestWithReply();
    const link = fakeLink();
    h.visit.leave();
    reply.opened.resolve(link.link);
    await h.visit.settled;
    expect(link.closed).toBe(true);
    expect(h.handOvers).toEqual([]);
  });
});

describe("leaving a visit", () => {
  test("closes the connection it waits on", async () => {
    const { h, invitation } = await hostWithInvitation();
    h.visit.leave();
    expect(invitation.closed).toBe(true);
  });

  test("ignores a reply code submitted afterwards", async () => {
    const { h, invitation } = await hostWithInvitation();
    h.visit.leave();
    await h.visit.submitReply(REPLY_CODE);
    expect(invitation.replies).toEqual([]);
  });

  test("shows nothing for a failure afterwards", async () => {
    const { h, invitation } = await hostWithInvitation();
    const connecting = h.visit.submitReply(REPLY_CODE);
    h.visit.leave();
    const failure = rejection("malformed");
    invitation.pendingAccepts[0].reject(failure);
    await connecting;
    await h.visit.submitReply(REPLY_CODE);
    expect(h.states.at(-1)).toEqual({ phase: "connecting" });
    expect(invitation.replies).toEqual([REPLY_CODE]);
  });
});

describe("retrying", () => {
  test.each(RETRYABLE_REPLY_FAILURES)("is offered after a rejected reply code (%s) and takes another code", async (reason) => {
    const { h, invitation } = await hostWithInvitation();
    const failure = rejection(reason);
    const connecting = h.visit.submitReply("bad");
    invitation.pendingAccepts[0].reject(failure);
    await connecting;
    expect(h.states.at(-1)).toEqual({ phase: "failed", failure: reason, retry: true });
    const link = fakeLink();
    const retrying = h.visit.submitReply(REPLY_CODE);
    invitation.pendingAccepts[1].resolve(link.link);
    await retrying;
    expect(invitation.replies).toEqual(["bad", REPLY_CODE]);
    expect(h.handOvers).toEqual([["host", link.link]]);
  });

  test.each(FINAL_REPLY_FAILURES)("is not offered after a reply fails with %s", async (reason) => {
    const { h, invitation } = await hostWithInvitation();
    const failure = rejection(reason);
    const connecting = h.visit.submitReply(REPLY_CODE);
    invitation.pendingAccepts[0].reject(failure);
    await connecting;
    expect(h.states.at(-1)).toEqual({ phase: "failed", failure: reason, retry: false });
    await h.visit.submitReply(REPLY_CODE);
    expect(invitation.replies).toEqual([REPLY_CODE]);
  });

  test("is not offered when preparing the invitation fails", async () => {
    const h = hostHarness();
    const failure = rejection("noCandidates");
    h.connected.reject(failure);
    await h.visit.settled;
    expect(h.states.at(-1)).toEqual({ phase: "failed", failure: "noCandidates", retry: false });
  });

  test.each(ALL_FAILURES)("is not offered to a guest failing with %s", async (reason) => {
    const h = guestHarness();
    const failure = rejection(reason);
    h.joined.reject(failure);
    await h.visit.settled;
    expect(h.states.at(-1)).toEqual({ phase: "failed", failure: reason, retry: false });
  });
});

describe("an unexpected failure", () => {
  test("while preparing the invitation is shown and rethrown", async () => {
    const h = hostHarness();
    const failure = new Error("boom");
    h.connected.reject(failure);
    await expect(h.visit.settled).rejects.toBe(failure);
    expect(h.states.at(-1)).toEqual({ phase: "failed", failure: "unexpected", retry: false });
  });

  test("while accepting the reply code is shown and rethrown", async () => {
    const { h, invitation } = await hostWithInvitation();
    const failure = new Error("boom");
    const connecting = h.visit.submitReply(REPLY_CODE);
    invitation.pendingAccepts[0].reject(failure);
    await expect(connecting).rejects.toBe(failure);
    expect(h.states.at(-1)).toEqual({ phase: "failed", failure: "unexpected", retry: false });
  });

  test("while joining is shown and rethrown", async () => {
    const { h, reply } = await guestWithReply();
    const failure = new Error("boom");
    reply.opened.reject(failure);
    await expect(h.visit.settled).rejects.toBe(failure);
    expect(h.states.at(-1)).toEqual({ phase: "failed", failure: "unexpected", retry: false });
  });

  test("after leaving is still rethrown", async () => {
    const h = hostHarness();
    const failure = new Error("boom");
    h.visit.leave();
    h.connected.reject(failure);
    await expect(h.visit.settled).rejects.toBe(failure);
    expect(h.states).toEqual([{ phase: "pending" }]);
  });
});
