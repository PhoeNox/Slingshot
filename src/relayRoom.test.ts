// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { createRoomSecret, openRelayRoom } from "./relayRoom";

const REPLY_CODE = "reply-code_123";

describe("createRoomSecret", () => {
  test("is a fresh URL-safe secret each time", () => {
    const first = createRoomSecret();
    const second = createRoomSecret();
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(second).not.toBe(first);
  });
});

describe("a relay room", () => {
  test("has the same tag for the same secret and another tag for another secret", async () => {
    const secret = createRoomSecret();
    const room = await openRelayRoom(secret);
    const sameRoom = await openRelayRoom(secret);
    const otherRoom = await openRelayRoom(createRoomSecret());
    expect(sameRoom.tag).toBe(room.tag);
    expect(otherRoom.tag).not.toBe(room.tag);
    expect(room.tag).not.toContain(secret);
  });

  test("opens what a room with the same secret sealed", async () => {
    const secret = createRoomSecret();
    const sender = await openRelayRoom(secret);
    const receiver = await openRelayRoom(secret);
    const sealed = await sender.seal(REPLY_CODE);
    expect(sealed).not.toContain(REPLY_CODE);
    await expect(receiver.open(sealed)).resolves.toBe(REPLY_CODE);
  });

  test("seals the same text differently each time", async () => {
    const room = await openRelayRoom(createRoomSecret());
    const first = await room.seal(REPLY_CODE);
    const second = await room.seal(REPLY_CODE);
    expect(second).not.toBe(first);
  });

  test("does not open what a room with another secret sealed", async () => {
    const sender = await openRelayRoom(createRoomSecret());
    const receiver = await openRelayRoom(createRoomSecret());
    const sealed = await sender.seal(REPLY_CODE);
    await expect(receiver.open(sealed)).resolves.toBeUndefined();
  });

  test("does not open tampered text", async () => {
    const room = await openRelayRoom(createRoomSecret());
    const sealed = await room.seal(REPLY_CODE);
    const flipped = sealed.at(-1) === "A" ? "B" : "A";
    const tampered = `${sealed.slice(0, -1)}${flipped}`;
    await expect(room.open(tampered)).resolves.toBeUndefined();
  });

  test.each(["", "not base64!", "AAAA"])("does not open garbage %j", async (garbage) => {
    const room = await openRelayRoom(createRoomSecret());
    await expect(room.open(garbage)).resolves.toBeUndefined();
  });
});
