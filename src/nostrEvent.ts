// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { schnorr } from "@noble/curves/secp256k1.js";

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type RelayMessage =
  | { readonly type: "event"; readonly subscriptionId: string; readonly tag: string | undefined; readonly content: string; readonly eventId: string }
  | { readonly type: "ok"; readonly eventId: string; readonly accepted: boolean }
  | { readonly type: "other" };

export const ROOM_EVENT_KIND = 25050;

const ROOM_TAG_NAME = "t";
const OTHER: RelayMessage = { type: "other" };

export function createEventKey(): Uint8Array {
  return schnorr.utils.randomSecretKey();
}

export async function signedRoomEvent(secretKey: Uint8Array, roomTag: string, content: string, createdAt: number): Promise<NostrEvent> {
  const pubkey = toHex(schnorr.getPublicKey(secretKey));
  const tags = [[ROOM_TAG_NAME, roomTag]];
  const serialized = JSON.stringify([0, pubkey, createdAt, ROOM_EVENT_KIND, tags, content]);
  const serializedBytes = new TextEncoder().encode(serialized);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", serializedBytes));
  const sig = toHex(schnorr.sign(digest, secretKey));
  return { id: toHex(digest), pubkey, created_at: createdAt, kind: ROOM_EVENT_KIND, tags, content, sig };
}

export function publishMessage(event: Readonly<NostrEvent>): string {
  return JSON.stringify(["EVENT", event]);
}

export function subscribeMessage(subscriptionId: string, roomTag: string): string {
  const filter = { kinds: [ROOM_EVENT_KIND], [`#${ROOM_TAG_NAME}`]: [roomTag] };
  return JSON.stringify(["REQ", subscriptionId, filter]);
}

export function parseRelayMessage(text: string): RelayMessage {
  const message = parseJson(text);
  if (!Array.isArray(message)) {
    return OTHER;
  }
  const [type, first, second] = message;
  if (type === "OK" && typeof first === "string" && typeof second === "boolean") {
    return { type: "ok", eventId: first, accepted: second };
  }
  if (type === "EVENT" && typeof first === "string") {
    return eventMessage(first, second);
  }
  return OTHER;
}

function eventMessage(subscriptionId: string, event: unknown): RelayMessage {
  if (!isRecord(event) || typeof event.id !== "string" || typeof event.content !== "string") {
    return OTHER;
  }
  const tag = roomTagOf(event.tags);
  return { type: "event", subscriptionId, tag, content: event.content, eventId: event.id };
}

function roomTagOf(tags: unknown): string | undefined {
  if (!Array.isArray(tags)) {
    return undefined;
  }
  const roomTag = tags.find((tag) => Array.isArray(tag) && tag[0] === ROOM_TAG_NAME && typeof tag[1] === "string");
  return roomTag?.[1];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
