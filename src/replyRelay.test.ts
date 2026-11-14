// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { NostrEvent } from "./nostrEvent";
import { createRoomSecret } from "./relayRoom";
import { nostrReplyRelay, RELAY_ACK_TIMEOUT_MS, type RelaySocket, type RelaySocketEvents } from "./replyRelay";

interface FakeSocket {
  url: string;
  events: RelaySocketEvents;
  socket: RelaySocket;
  sent: string[];
  closed: boolean;
}

interface FakeNetwork {
  sockets: FakeSocket[];
  open: (url: string, events: RelaySocketEvents) => RelaySocket;
}

const RELAY_URLS = ["wss://one.example", "wss://two.example"];
const REPLY_CODE = "reply-code";
const realSetTimeout = globalThis.setTimeout;
const IDLE_TURNS = 20;

function fakeNetwork(): FakeNetwork {
  const network: FakeNetwork = { sockets: [], open: () => undefined as unknown as RelaySocket };
  network.open = (url, events) => {
    const fake = { url, events, sent: [], closed: false } as unknown as FakeSocket;
    fake.socket = {
      send: (text) => fake.sent.push(text),
      close: () => {
        fake.closed = true;
      },
    };
    network.sockets.push(fake);
    return fake.socket;
  };
  return network;
}

function connect(fake: FakeSocket): void {
  fake.events.onOpen(fake.socket);
}

function publishedEvent(fake: FakeSocket): NostrEvent {
  const [, event] = JSON.parse(fake.sent[0]) as [string, NostrEvent];
  return event;
}

function subscriptionOf(fake: FakeSocket): [string, { "#t": string[] }] {
  const [, subscriptionId, filter] = JSON.parse(fake.sent[0]) as [string, string, { "#t": string[] }];
  return [subscriptionId, filter];
}

function forward(event: NostrEvent, to: FakeSocket): void {
  const [subscriptionId] = subscriptionOf(to);
  to.events.onText(JSON.stringify(["EVENT", subscriptionId, event]));
}

function acknowledge(fake: FakeSocket, event: NostrEvent, accepted: boolean): void {
  fake.events.onText(JSON.stringify(["OK", event.id, accepted, ""]));
}

function flush(): Promise<void> {
  return new Promise((resolve) => realSetTimeout(resolve, 0));
}

async function until(condition: () => boolean): Promise<void> {
  while (!condition()) {
    await flush();
  }
}

async function idle(): Promise<void> {
  for (let turn = 0; turn < IDLE_TURNS; turn += 1) {
    await flush();
  }
}

async function publishedReply(roomSecret: string): Promise<NostrEvent> {
  const network = fakeNetwork();
  const relay = nostrReplyRelay(network.open, RELAY_URLS);
  relay.deliverReply(roomSecret, REPLY_CODE);
  await until(() => network.sockets.length > 0);
  connect(network.sockets[0]);
  return publishedEvent(network.sockets[0]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("awaiting replies", () => {
  test("subscribes on every relay to the room's tag", async () => {
    const network = fakeNetwork();
    const relay = nostrReplyRelay(network.open, RELAY_URLS);
    await relay.awaitReplies(() => {});
    network.sockets.forEach(connect);
    expect(network.sockets.map((fake) => fake.url)).toEqual(RELAY_URLS);
    const [[, first], [, second]] = network.sockets.map(subscriptionOf);
    expect(second).toEqual(first);
    expect(first["#t"]).toHaveLength(1);
  });

  test("receives a reply delivered to the room once, however many relays forward it", async () => {
    const network = fakeNetwork();
    const relay = nostrReplyRelay(network.open, RELAY_URLS);
    const replies: string[] = [];
    const room = await relay.awaitReplies((replyCode) => replies.push(replyCode));
    network.sockets.forEach(connect);
    const event = await publishedReply(room.roomSecret);
    network.sockets.forEach((fake) => forward(event, fake));
    await until(() => replies.length > 0);
    await idle();
    expect(replies).toEqual([REPLY_CODE]);
  });

  test("ignores a reply delivered to another room", async () => {
    const network = fakeNetwork();
    const relay = nostrReplyRelay(network.open, RELAY_URLS);
    const replies: string[] = [];
    await relay.awaitReplies((replyCode) => replies.push(replyCode));
    connect(network.sockets[0]);
    const event = await publishedReply(createRoomSecret());
    forward(event, network.sockets[0]);
    await idle();
    expect(replies).toEqual([]);
  });

  test("ignores content it cannot open", async () => {
    const network = fakeNetwork();
    const relay = nostrReplyRelay(network.open, RELAY_URLS);
    const replies: string[] = [];
    const room = await relay.awaitReplies((replyCode) => replies.push(replyCode));
    connect(network.sockets[0]);
    const event = await publishedReply(room.roomSecret);
    const forged = { ...event, id: "forged", content: "garbage" };
    forward(forged, network.sockets[0]);
    await idle();
    expect(replies).toEqual([]);
  });

  test("closes every socket and takes no reply once closed", async () => {
    const network = fakeNetwork();
    const relay = nostrReplyRelay(network.open, RELAY_URLS);
    const replies: string[] = [];
    const room = await relay.awaitReplies((replyCode) => replies.push(replyCode));
    connect(network.sockets[0]);
    const event = await publishedReply(room.roomSecret);
    room.close();
    forward(event, network.sockets[0]);
    await idle();
    expect(network.sockets.every((fake) => fake.closed)).toBe(true);
    expect(replies).toEqual([]);
  });
});

describe("delivering a reply", () => {
  async function delivering() {
    const network = fakeNetwork();
    const relay = nostrReplyRelay(network.open, RELAY_URLS);
    const delivery = relay.deliverReply(createRoomSecret(), REPLY_CODE);
    await until(() => network.sockets.length === RELAY_URLS.length);
    network.sockets.forEach(connect);
    const event = publishedEvent(network.sockets[0]);
    return { network, delivery, event };
  }

  test("publishes the same sealed event to every relay", async () => {
    const { network, event } = await delivering();
    expect(network.sockets.map(publishedEvent)).toEqual([event, event]);
    expect(event.content).not.toContain(REPLY_CODE);
  });

  test("is accepted once one relay accepts it", async () => {
    const { network, delivery, event } = await delivering();
    acknowledge(network.sockets[0], event, false);
    acknowledge(network.sockets[1], event, true);
    await expect(delivery).resolves.toBe("accepted");
    expect(network.sockets.every((fake) => fake.closed)).toBe(true);
  });

  test("is unreached once every relay rejected it or went away", async () => {
    const { network, delivery, event } = await delivering();
    acknowledge(network.sockets[0], event, false);
    network.sockets[1].events.onGone();
    await expect(delivery).resolves.toBe("unreached");
  });

  test("is unreached when no relay answers in time, closing every socket", async () => {
    const { network, delivery } = await delivering();
    await vi.advanceTimersByTimeAsync(RELAY_ACK_TIMEOUT_MS);
    await expect(delivery).resolves.toBe("unreached");
    expect(network.sockets.every((fake) => fake.closed)).toBe(true);
  });

  test("ignores an acknowledgement for another event", async () => {
    const { network, delivery, event } = await delivering();
    const other = { ...event, id: "other" };
    network.sockets.forEach((fake) => acknowledge(fake, other, true));
    await vi.advanceTimersByTimeAsync(RELAY_ACK_TIMEOUT_MS);
    await expect(delivery).resolves.toBe("unreached");
  });
});
