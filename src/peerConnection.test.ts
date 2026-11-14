// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CONNECT_TIMEOUT_MS,
  hostPeerConnection,
  joinPeerConnection,
  PeerConnectionError,
  type HostInvitation,
  type PeerLink,
} from "./peerConnection";
import { encodeSignalingCode } from "./signalingCode";
import { CHROME_ANSWER, CHROME_OFFER } from "./signalingCode.fixtures";

const realSetTimeout = globalThis.setTimeout;

class FakeChannel extends EventTarget {
  readyState: RTCDataChannelState = "connecting";
  sent: string[] = [];
  peer: FakeChannel | undefined;

  send(text: string) {
    this.sent.push(text);
    this.peer?.receive(text);
  }

  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  receive(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  close() {
    if (this.readyState === "closed") {
      return;
    }
    this.readyState = "closed";
    this.peer?.closeFromPeer();
  }

  closeFromPeer() {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  }
}

class FakeConnection extends EventTarget {
  iceGatheringState: RTCIceGatheringState = "new";
  connectionState: RTCPeerConnectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  channel = new FakeChannel();
  closed = false;
  remoteDescriptionSet: Promise<void>;
  private markRemoteDescriptionSet: () => void = () => undefined;

  constructor(private readonly localSdp: string) {
    super();
    this.remoteDescriptionSet = new Promise((resolve) => {
      this.markRemoteDescriptionSet = resolve;
    });
  }

  createDataChannel() {
    return this.channel;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    this.markRemoteDescriptionSet();
  }

  async setLocalDescription() {
    const type = this.remoteDescription === null ? "offer" : "answer";
    this.localDescription = { type, sdp: this.localSdp };
    this.iceGatheringState = "gathering";
    realSetTimeout(() => {
      this.iceGatheringState = "complete";
      this.dispatchEvent(new Event("icegatheringstatechange"));
    }, 0);
  }

  announceChannel() {
    const event = new Event("datachannel");
    Object.assign(event, { channel: this.channel });
    this.dispatchEvent(event);
    this.channel.open();
  }

  fail() {
    this.connectionState = "failed";
    this.dispatchEvent(new Event("connectionstatechange"));
  }

  close() {
    this.closed = true;
    this.connectionState = "closed";
    this.channel.close();
  }
}

function factoryFor(connection: FakeConnection) {
  return () => connection as unknown as RTCPeerConnection;
}

function withoutCandidates(sdp: string): string {
  return sdp.split("\r\n").filter((line) => !line.startsWith("a=candidate:")).join("\r\n");
}

function hostWith(connection: FakeConnection) {
  return hostPeerConnection(factoryFor(connection));
}

function joinWith(offerCode: string, connection: FakeConnection) {
  return joinPeerConnection(offerCode, factoryFor(connection));
}

async function acceptReply(invitation: HostInvitation, connection: FakeConnection, replyCode: string) {
  const accepting = invitation.accept(replyCode);
  accepting.catch(() => undefined);
  await connection.remoteDescriptionSet;
  await vi.advanceTimersByTimeAsync(0);
  return { accepting };
}

async function acceptChromeAnswer(invitation: HostInvitation, connection: FakeConnection) {
  const replyCode = await encodeSignalingCode(CHROME_ANSWER);
  return acceptReply(invitation, connection, replyCode);
}

async function openHostLink(connection: FakeConnection): Promise<PeerLink> {
  const invitation = await hostWith(connection);
  const { accepting } = await acceptChromeAnswer(invitation, connection);
  connection.channel.open();
  return accepting;
}

function settledState(promise: Promise<unknown>) {
  const state = { settled: false };
  promise.then(
    () => (state.settled = true),
    () => (state.settled = true),
  );
  return state;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hostPeerConnection", () => {
  test("returns an offer code once ICE gathering completes", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);

    const invitation = await hostWith(connection);

    expect(invitation.offerCode).toBe(await encodeSignalingCode(CHROME_OFFER));
  });

  test("fails when the gathered offer has no candidates", async () => {
    const connection = new FakeConnection(withoutCandidates(CHROME_OFFER.sdp!));

    const hosting = hostWith(connection);

    await expect(hosting).rejects.toMatchObject({ reason: "noCandidates" });
    expect(connection.closed).toBe(true);
  });

  test("resolves with a link when the channel opens after the reply code", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);

    const link = await openHostLink(connection);

    expect(connection.remoteDescription?.type).toBe("answer");
    expect(connection.closed).toBe(false);
    link.send("hello");
    expect(connection.channel.sent).toEqual(["hello"]);
  });

  test("rejects an offer code pasted as a reply code and keeps the invitation open", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const invitation = await hostWith(connection);

    const accepting = invitation.accept(invitation.offerCode);

    await expect(accepting).rejects.toMatchObject({ reason: "wrongKind" });
    expect(connection.remoteDescription).toBeNull();
    expect(connection.closed).toBe(false);
  });

  test("fails with could not connect when the channel stays closed after the reply code", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const invitation = await hostWith(connection);

    const { accepting } = await acceptChromeAnswer(invitation, connection);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);

    await expect(accepting).rejects.toMatchObject({ reason: "couldNotConnect" });
    await expect(accepting).rejects.toBeInstanceOf(PeerConnectionError);
    expect(connection.closed).toBe(true);
  });

  test("connects when the channel opens just before the timeout", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const invitation = await hostWith(connection);

    const { accepting } = await acceptChromeAnswer(invitation, connection);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS - 1);
    connection.channel.open();
    await vi.advanceTimersByTimeAsync(1);

    await expect(accepting).resolves.toBeDefined();
    expect(connection.closed).toBe(false);
  });

  test("closing a pending invitation closes the connection and never reports a timeout", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const invitation = await hostWith(connection);

    const { accepting } = await acceptChromeAnswer(invitation, connection);
    const state = settledState(accepting);
    invitation.close();
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);

    expect(connection.closed).toBe(true);
    expect(state.settled).toBe(false);
  });
});

describe("joinPeerConnection", () => {
  test("rejects a garbage invitation without creating a connection", async () => {
    const createConnection = vi.fn();

    const joining = joinPeerConnection("not a code", createConnection);

    await expect(joining).rejects.toMatchObject({ reason: "malformed" });
    expect(createConnection).not.toHaveBeenCalled();
  });

  test("returns a reply code for the offer once ICE gathering completes", async () => {
    const connection = new FakeConnection(CHROME_ANSWER.sdp!);
    const offerCode = await encodeSignalingCode(CHROME_OFFER);

    const reply = await joinWith(offerCode, connection);

    expect(connection.remoteDescription?.type).toBe("offer");
    expect(reply.replyCode).toBe(await encodeSignalingCode(CHROME_ANSWER));
  });

  test("opens when the host's channel arrives", async () => {
    const connection = new FakeConnection(CHROME_ANSWER.sdp!);
    const offerCode = await encodeSignalingCode(CHROME_OFFER);
    const reply = await joinWith(offerCode, connection);

    connection.announceChannel();
    const link = await reply.opened;

    link.send("hi");
    expect(connection.channel.sent).toEqual(["hi"]);
  });

  test("keeps waiting for the host past the connect timeout", async () => {
    const connection = new FakeConnection(CHROME_ANSWER.sdp!);
    const offerCode = await encodeSignalingCode(CHROME_OFFER);
    const reply = await joinWith(offerCode, connection);
    const state = settledState(reply.opened);

    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    expect(state.settled).toBe(false);

    connection.announceChannel();
    await expect(reply.opened).resolves.toBeDefined();
    expect(connection.closed).toBe(false);
  });

  test("fails with could not connect when the connection fails before the host's channel arrives", async () => {
    const connection = new FakeConnection(CHROME_ANSWER.sdp!);
    const offerCode = await encodeSignalingCode(CHROME_OFFER);
    const reply = await joinWith(offerCode, connection);
    reply.opened.catch(() => undefined);

    connection.fail();

    await expect(reply.opened).rejects.toMatchObject({ reason: "couldNotConnect" });
    expect(connection.closed).toBe(true);
  });

  test("closing a pending reply closes the connection and never settles", async () => {
    const connection = new FakeConnection(CHROME_ANSWER.sdp!);
    const offerCode = await encodeSignalingCode(CHROME_OFFER);
    const reply = await joinWith(offerCode, connection);
    const state = settledState(reply.opened);

    reply.close();
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);

    expect(connection.closed).toBe(true);
    expect(state.settled).toBe(false);
  });
});

describe("an open link", () => {
  test("delivers text received before a listener is set, then later text in order", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const link = await openHostLink(connection);
    const received: string[] = [];

    connection.channel.receive("first");
    connection.channel.receive("second");
    link.onMessage((text) => received.push(text));
    connection.channel.receive("third");

    expect(received).toEqual(["first", "second", "third"]);
  });

  test("ignores binary messages", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const link = await openHostLink(connection);
    const received: string[] = [];
    link.onMessage((text) => received.push(text));

    connection.channel.receive(new ArrayBuffer(4));

    expect(received).toEqual([]);
  });

  test("closing locally fires the closed signal and closes the connection", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const link = await openHostLink(connection);
    const state = settledState(link.closed);

    link.close();
    link.close();
    await vi.advanceTimersByTimeAsync(0);

    expect(state.settled).toBe(true);
    expect(connection.closed).toBe(true);
  });

  test("a channel closed by the peer fires the closed signal", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const link = await openHostLink(connection);

    connection.channel.closeFromPeer();

    await expect(link.closed).resolves.toBeUndefined();
    expect(connection.closed).toBe(true);
  });

  test("a failed connection fires the closed signal", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const link = await openHostLink(connection);

    connection.fail();

    await expect(link.closed).resolves.toBeUndefined();
  });

  test("drops text sent after the channel closed", async () => {
    const connection = new FakeConnection(CHROME_OFFER.sdp!);
    const link = await openHostLink(connection);

    connection.channel.closeFromPeer();
    link.send("late");

    expect(connection.channel.sent).toEqual([]);
  });
});

describe("host and guest", () => {
  async function connectPair() {
    const hostConnection = new FakeConnection(CHROME_OFFER.sdp!);
    const guestConnection = new FakeConnection(CHROME_ANSWER.sdp!);
    hostConnection.channel.peer = guestConnection.channel;
    guestConnection.channel.peer = hostConnection.channel;
    const invitation = await hostWith(hostConnection);
    const reply = await joinWith(invitation.offerCode, guestConnection);
    const { accepting } = await acceptReply(invitation, hostConnection, reply.replyCode);
    hostConnection.channel.open();
    guestConnection.announceChannel();
    return { host: await accepting, guest: await reply.opened };
  }

  test("exchange text through invitation and reply code", async () => {
    const { host, guest } = await connectPair();
    const atHost: string[] = [];
    const atGuest: string[] = [];
    host.onMessage((text) => atHost.push(text));
    guest.onMessage((text) => atGuest.push(text));

    host.send("ping");
    guest.send("pong");

    expect(atGuest).toEqual(["ping"]);
    expect(atHost).toEqual(["pong"]);
  });

  test.each(["host", "guest"] as const)("closing the %s fires the closed signal on both", async (closingSide) => {
    const links = await connectPair();

    links[closingSide].close();

    await expect(links.host.closed).resolves.toBeUndefined();
    await expect(links.guest.closed).resolves.toBeUndefined();
  });
});
