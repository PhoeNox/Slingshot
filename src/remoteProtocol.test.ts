// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { DEFAULT_MATCH_RULES, type ShotOutcome, type ShotRecord } from "./core/match";
import {
  decodeMessage,
  encodeMessage,
  PROTOCOL_VERSION,
  shotOutcomesAgree,
  type RemoteMessage,
} from "./remoteProtocol";

const OUTCOME: ShotOutcome = { endReason: "planet", stepsFlown: 87, finalPosition: { x: 412.5, y: 233.25 } };

const HELLO: RemoteMessage = {
  kind: "hello",
  protocolVersion: PROTOCOL_VERSION,
  rules: { ...DEFAULT_MATCH_RULES, planetCount: { min: 1, max: 6 } },
  seed: 4294967295,
};

const MESSAGES: RemoteMessage[] = [
  HELLO,
  { ...HELLO, rules: { planetCount: { min: 3, max: 3 }, timeoutSeconds: undefined, bounce: true, planetVisibility: "hidden" } },
  { kind: "aim", aim: { angle: 123.5, power: 200 } },
  { kind: "shot", aim: { angle: 90, power: 350 }, shot: { x: 59.5, y: 300, vx: 35, vy: -2.1e-15 } },
  { kind: "nextRound" },
  { kind: "outcome", outcome: OUTCOME },
  ...(["hit", "selfHit", "leftTrackingArea", "timedOut"] as const).map(
    (endReason): RemoteMessage => ({ kind: "outcome", outcome: { ...OUTCOME, endReason } }),
  ),
  { kind: "leave" },
];

const AWKWARD_NUMBERS = [
  0.1 + 0.2,
  Number.MIN_VALUE,
  -Number.MIN_VALUE,
  2.2250738585072014e-308 / 3,
  Number.MAX_VALUE,
  -0,
  1 / 3,
  Number.EPSILON,
];

function bitsOf(value: number): bigint {
  return new BigUint64Array(new Float64Array([value]).buffer)[0];
}

function roundTrip<T extends RemoteMessage>(message: T): T {
  const decoded = decodeMessage(encodeMessage(message));
  if (!decoded.accepted) {
    throw new Error(`rejected: ${decoded.detail}`);
  }
  return decoded.message as T;
}

const WIRE_RULES = { planetCount: { min: 2, max: 4 }, timeoutSeconds: 25, bounce: false, planetVisibility: "always" };

function helloWith(fields: Record<string, unknown>): string {
  return JSON.stringify({ kind: "hello", protocolVersion: PROTOCOL_VERSION, rules: WIRE_RULES, seed: 7, ...fields });
}

function helloWithRules(rules: Record<string, unknown>): string {
  return helloWith({ rules: { ...WIRE_RULES, ...rules } });
}

describe("encodeMessage and decodeMessage", () => {
  test.each(MESSAGES)("round-trip %j", (message) => {
    expect(decodeMessage(encodeMessage(message))).toEqual({ accepted: true, message });
  });

  test.each(AWKWARD_NUMBERS)("round-trip shot record and outcome numbers bit-exactly, here %d", (value) => {
    const shot: ShotRecord = { x: value, y: -value, vx: value, vy: value * 0.5 };
    const outcome: ShotOutcome = { endReason: "hit", stepsFlown: 1, finalPosition: { x: value, y: -value } };

    const sent = roundTrip({ kind: "shot", aim: { angle: value, power: 1 }, shot });
    const reported = roundTrip({ kind: "outcome", outcome });

    expect([sent.aim.angle, sent.shot.x, sent.shot.y, sent.shot.vx, sent.shot.vy].map(bitsOf))
      .toEqual([value, shot.x, shot.y, shot.vx, shot.vy].map(bitsOf));
    expect([reported.outcome.finalPosition.x, reported.outcome.finalPosition.y].map(bitsOf))
      .toEqual([outcome.finalPosition.x, outcome.finalPosition.y].map(bitsOf));
  });
});

describe("decodeMessage", () => {
  test.each([
    "",
    "not json",
    "{",
    "NaN",
    "null",
    "42",
    '"leave"',
    "[]",
    '[{"kind":"leave"}]',
    "{}",
    '{"kind":"surrender"}',
    '{"kind":{"toString":1}}',
    '{"__proto__":{"kind":"leave"}}',
    '{"kind":"aim"}',
    '{"kind":"aim","aim":null}',
    '{"kind":"aim","aim":{"angle":"90","power":100}}',
    '{"kind":"aim","aim":{"angle":90}}',
    '{"kind":"aim","aim":{"angle":1e999,"power":100}}',
    '{"kind":"aim","aim":{"angle":90,"power":-1e999}}',
    '{"kind":"aim","aim":{"angle":"-1","power":100}}',
    '{"kind":"shot","aim":{"angle":90,"power":100}}',
    '{"kind":"shot","aim":{"angle":90,"power":100},"shot":{"x":1,"y":2,"vx":3}}',
    '{"kind":"shot","aim":{"angle":90,"power":100},"shot":{"x":1,"y":2,"vx":3,"vy":null}}',
    '{"kind":"shot","aim":{"angle":90,"power":100},"shot":[1,2,3,4]}',
    '{"kind":"outcome","outcome":{"endReason":"exploded","stepsFlown":1,"finalPosition":{"x":0,"y":0}}}',
    '{"kind":"outcome","outcome":{"endReason":"toString","stepsFlown":1,"finalPosition":{"x":0,"y":0}}}',
    '{"kind":"outcome","outcome":{"endReason":"hit","stepsFlown":-1,"finalPosition":{"x":0,"y":0}}}',
    '{"kind":"outcome","outcome":{"endReason":"hit","stepsFlown":1.5,"finalPosition":{"x":0,"y":0}}}',
    '{"kind":"outcome","outcome":{"endReason":"hit","stepsFlown":1,"finalPosition":{"x":0}}}',
    '{"kind":"outcome","outcome":{"endReason":"hit","stepsFlown":1}}',
    helloWith({ rules: undefined }),
    helloWith({ rules: "default" }),
    helloWith({ seed: -1 }),
    helloWith({ seed: 1.5 }),
    helloWith({ seed: 4294967296 }),
    helloWith({ seed: "7" }),
    helloWith({ protocolVersion: "1" }),
    helloWith({ protocolVersion: undefined }),
    helloWithRules({ planetCount: { min: 0, max: 4 } }),
    helloWithRules({ planetCount: { min: 2, max: 7 } }),
    helloWithRules({ planetCount: { min: 5, max: 3 } }),
    helloWithRules({ planetCount: { min: 2.5, max: 4 } }),
    helloWithRules({ planetCount: [2, 4] }),
    helloWithRules({ timeoutSeconds: 30 }),
    helloWithRules({ timeoutSeconds: "25" }),
    helloWithRules({ timeoutSeconds: undefined }),
    helloWithRules({ bounce: "yes" }),
    helloWithRules({ bounce: undefined }),
    helloWithRules({ planetVisibility: "sometimes" }),
  ])("rejects malformed input %s without throwing", (text) => {
    expect(decodeMessage(text)).toMatchObject({ accepted: false, reason: "malformed" });
  });

  test("rejects NaN, which JSON encodes as null", () => {
    const text = encodeMessage({ kind: "aim", aim: { angle: Number.NaN, power: 100 } });

    expect(decodeMessage(text)).toMatchObject({ accepted: false, reason: "malformed" });
  });

  test.each([PROTOCOL_VERSION + 1, 0])("rejects a hello for protocol version %i as a protocol mismatch", (protocolVersion) => {
    const text = helloWith({ protocolVersion, rules: { planetCount: "from a later version" } });

    expect(decodeMessage(text)).toMatchObject({ accepted: false, reason: "protocolMismatch" });
  });

  test("ignores unknown extra fields", () => {
    expect(decodeMessage('{"kind":"leave","reason":"bored"}')).toEqual({ accepted: true, message: { kind: "leave" } });
  });
});

describe("shotOutcomesAgree", () => {
  test("agrees on an identical outcome", () => {
    expect(shotOutcomesAgree(OUTCOME, structuredClone(OUTCOME))).toBe(true);
  });

  test.each<ShotOutcome>([
    { ...OUTCOME, endReason: "hit" },
    { ...OUTCOME, stepsFlown: OUTCOME.stepsFlown + 1 },
    { ...OUTCOME, finalPosition: { ...OUTCOME.finalPosition, x: OUTCOME.finalPosition.x + 1e-13 } },
    { ...OUTCOME, finalPosition: { ...OUTCOME.finalPosition, y: OUTCOME.finalPosition.y - 1e-13 } },
  ])("detects a difference in %j", (remote) => {
    expect(shotOutcomesAgree(OUTCOME, remote)).toBe(false);
  });
});
