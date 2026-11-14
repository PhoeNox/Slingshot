// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { createEventKey, parseRelayMessage, publishMessage, signedRoomEvent, subscribeMessage } from "./nostrEvent";
import { createRoomSecret, openRelayRoom, type RelayRoom } from "./relayRoom";

export type ReplyDelivery = "accepted" | "unreached";

export interface ReplyRoom {
  readonly roomSecret: string;
  close(): void;
}

export interface ReplyRelay {
  awaitReplies(onReply: (replyCode: string) => void): Promise<ReplyRoom>;
  deliverReply(roomSecret: string, replyCode: string): Promise<ReplyDelivery>;
}

export interface RelaySocket {
  send(text: string): void;
  close(): void;
}

export interface RelaySocketEvents {
  onOpen(socket: RelaySocket): void;
  onText(text: string): void;
  onGone(): void;
}

export type OpenRelaySocket = (url: string, events: RelaySocketEvents) => RelaySocket;

interface Listening {
  open: boolean;
  readonly seenEventIds: Set<string>;
}

interface Delivery {
  settled: boolean;
  unanswered: number;
  readonly resolve: (delivery: ReplyDelivery) => void;
}

export const RELAY_URLS: readonly string[] = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net", "wss://relay.snort.social"];

export const RELAY_ACK_TIMEOUT_MS = 5_000;

const SUBSCRIPTION_ID = "slingshot-room";
const MS_PER_SECOND = 1000;

export function nostrReplyRelay(openSocket: OpenRelaySocket = openBrowserSocket, relayUrls: readonly string[] = RELAY_URLS): ReplyRelay {
  const awaitReplies = (onReply: (replyCode: string) => void) => listenForReplies(openSocket, relayUrls, onReply);
  const deliverReply = (roomSecret: string, replyCode: string) => publishReply(openSocket, relayUrls, roomSecret, replyCode);
  return { awaitReplies, deliverReply };
}

export function openBrowserSocket(url: string, events: RelaySocketEvents): RelaySocket {
  const webSocket = new WebSocket(url);
  const socket: RelaySocket = {
    send: (text) => {
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(text);
      }
    },
    close: () => webSocket.close(),
  };
  webSocket.addEventListener("open", () => events.onOpen(socket));
  webSocket.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      events.onText(event.data);
    }
  });
  webSocket.addEventListener("error", events.onGone);
  webSocket.addEventListener("close", events.onGone);
  return socket;
}

async function listenForReplies(
  openSocket: OpenRelaySocket,
  relayUrls: readonly string[],
  onReply: (replyCode: string) => void,
): Promise<ReplyRoom> {
  const roomSecret = createRoomSecret();
  const room = await openRelayRoom(roomSecret);
  const listening: Listening = { open: true, seenEventIds: new Set() };
  const subscription = subscribeMessage(SUBSCRIPTION_ID, room.tag);
  const events: RelaySocketEvents = {
    onOpen: (socket) => socket.send(subscription),
    onText: (text) => receiveReply(room, listening, text, onReply),
    onGone: () => {},
  };
  const sockets = relayUrls.map((url) => openSocket(url, events));
  const close = () => {
    listening.open = false;
    sockets.forEach((socket) => socket.close());
  };
  return { roomSecret, close };
}

async function receiveReply(room: RelayRoom, listening: Listening, text: string, onReply: (replyCode: string) => void): Promise<void> {
  const message = parseRelayMessage(text);
  if (message.type !== "event" || message.subscriptionId !== SUBSCRIPTION_ID || message.tag !== room.tag) {
    return;
  }
  if (listening.seenEventIds.has(message.eventId)) {
    return;
  }
  listening.seenEventIds.add(message.eventId);
  const replyCode = await room.open(message.content);
  if (replyCode !== undefined && listening.open) {
    onReply(replyCode);
  }
}

async function publishReply(
  openSocket: OpenRelaySocket,
  relayUrls: readonly string[],
  roomSecret: string,
  replyCode: string,
): Promise<ReplyDelivery> {
  const room = await openRelayRoom(roomSecret);
  const content = await room.seal(replyCode);
  const eventKey = createEventKey();
  const createdAt = Math.floor(Date.now() / MS_PER_SECOND);
  const event = await signedRoomEvent(eventKey, room.tag, content, createdAt);
  const publication = publishMessage(event);
  return new Promise((resolve) => {
    const delivery: Delivery = { settled: false, unanswered: relayUrls.length, resolve };
    const sockets = relayUrls.map((url) => publishOnce(openSocket, url, event.id, publication, delivery));
    const giveUp = () => {
      sockets.forEach((socket) => socket.close());
      settle(delivery, "unreached");
    };
    setTimeout(giveUp, RELAY_ACK_TIMEOUT_MS);
  });
}

function publishOnce(openSocket: OpenRelaySocket, url: string, eventId: string, publication: string, delivery: Delivery): RelaySocket {
  let answered = false;
  const answer = (accepted: boolean) => {
    if (answered) {
      return;
    }
    answered = true;
    socket.close();
    countAnswer(delivery, accepted);
  };
  const events: RelaySocketEvents = {
    onOpen: (socket) => socket.send(publication),
    onText: (text) => {
      const message = parseRelayMessage(text);
      if (message.type === "ok" && message.eventId === eventId) {
        answer(message.accepted);
      }
    },
    onGone: () => answer(false),
  };
  const socket = openSocket(url, events);
  return socket;
}

function countAnswer(delivery: Delivery, accepted: boolean): void {
  delivery.unanswered -= 1;
  if (accepted) {
    settle(delivery, "accepted");
  } else if (delivery.unanswered === 0) {
    settle(delivery, "unreached");
  }
}

function settle(delivery: Delivery, outcome: ReplyDelivery): void {
  if (!delivery.settled) {
    delivery.settled = true;
    delivery.resolve(outcome);
  }
}
