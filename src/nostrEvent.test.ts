// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { schnorr } from "@noble/curves/secp256k1.js";
import { describe, expect, test } from "vitest";
import { createEventKey, parseRelayMessage, publishMessage, ROOM_EVENT_KIND, signedRoomEvent, subscribeMessage } from "./nostrEvent";

const ROOM_TAG = "room-tag";
const CONTENT = "sealed-content";
const CREATED_AT = 1_790_000_000;

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16));
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("signedRoomEvent", () => {
  test("is an ephemeral event tagged with the room", async () => {
    const event = await signedRoomEvent(createEventKey(), ROOM_TAG, CONTENT, CREATED_AT);
    expect(ROOM_EVENT_KIND).toBeGreaterThanOrEqual(20000);
    expect(ROOM_EVENT_KIND).toBeLessThan(30000);
    expect(event).toMatchObject({ kind: ROOM_EVENT_KIND, tags: [["t", ROOM_TAG]], content: CONTENT, created_at: CREATED_AT });
  });

  test("has the NIP-01 id and a valid signature over it", async () => {
    const event = await signedRoomEvent(createEventKey(), ROOM_TAG, CONTENT, CREATED_AT);
    const serialized = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
    expect(event.id).toBe(await sha256Hex(serialized));
    expect(schnorr.verify(fromHex(event.sig), fromHex(event.id), fromHex(event.pubkey))).toBe(true);
  });

  test("comes from a fresh key each visit", async () => {
    const first = await signedRoomEvent(createEventKey(), ROOM_TAG, CONTENT, CREATED_AT);
    const second = await signedRoomEvent(createEventKey(), ROOM_TAG, CONTENT, CREATED_AT);
    expect(second.pubkey).not.toBe(first.pubkey);
  });
});

describe("client messages", () => {
  test("publish the event", async () => {
    const event = await signedRoomEvent(createEventKey(), ROOM_TAG, CONTENT, CREATED_AT);
    expect(JSON.parse(publishMessage(event))).toEqual(["EVENT", event]);
  });

  test("subscribe to the room's events", () => {
    expect(JSON.parse(subscribeMessage("sub", ROOM_TAG))).toEqual(["REQ", "sub", { kinds: [ROOM_EVENT_KIND], "#t": [ROOM_TAG] }]);
  });
});

describe("parseRelayMessage", () => {
  test("reads an acknowledgement", () => {
    expect(parseRelayMessage(JSON.stringify(["OK", "id", false, "blocked"]))).toEqual({ type: "ok", eventId: "id", accepted: false });
  });

  test("reads an event with its room tag and content", () => {
    const event = { id: "id", tags: [["p", "x"], ["t", ROOM_TAG]], content: CONTENT };
    expect(parseRelayMessage(JSON.stringify(["EVENT", "sub", event]))).toEqual({
      type: "event",
      subscriptionId: "sub",
      tag: ROOM_TAG,
      content: CONTENT,
      eventId: "id",
    });
  });

  test("reads an event without a room tag", () => {
    const event = { id: "id", tags: [], content: CONTENT };
    expect(parseRelayMessage(JSON.stringify(["EVENT", "sub", event]))).toMatchObject({ type: "event", tag: undefined });
  });

  test.each([
    "not json",
    "{}",
    JSON.stringify(["EOSE", "sub"]),
    JSON.stringify(["NOTICE", "hello"]),
    JSON.stringify(["OK", "id"]),
    JSON.stringify(["EVENT", "sub", null]),
    JSON.stringify(["EVENT", "sub", { id: "id", tags: [] }]),
  ])("treats %j as other", (text) => {
    expect(parseRelayMessage(text)).toEqual({ type: "other" });
  });
});
