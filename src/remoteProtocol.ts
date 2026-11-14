// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Aim, MatchRules, Point, ShotEndReason, ShotOutcome, ShotRecord } from "./core/match";
import { parseStoredMatchRules, storedMatchRulesOf } from "./settings";

// Bump whenever a message changes shape or meaning, or core physics changes:
// peers on different versions would fly the same shot differently and drift out of sync.
export const PROTOCOL_VERSION = 1;

export interface HelloMessage {
  kind: "hello";
  protocolVersion: number;
  rules: MatchRules;
  seed: number;
}

export interface AimMessage {
  kind: "aim";
  aim: Aim;
}

export interface ShotMessage {
  kind: "shot";
  aim: Aim;
  shot: ShotRecord;
}

export interface OutcomeMessage {
  kind: "outcome";
  outcome: ShotOutcome;
}

export interface LeaveMessage {
  kind: "leave";
}

export type RemoteMessage = HelloMessage | AimMessage | ShotMessage | OutcomeMessage | LeaveMessage;

export type RejectionReason = "malformed" | "protocolMismatch";

export type DecodedMessage =
  | { accepted: true; message: RemoteMessage }
  | { accepted: false; reason: RejectionReason; detail: string };

const SHOT_END_REASONS = {
  hit: true,
  selfHit: true,
  planet: true,
  leftTrackingArea: true,
  timedOut: true,
} satisfies Record<ShotEndReason, true>;

const MAX_SEED = 0xffffffff;

// JSON writes -0 as 0, so it travels as this string to keep shot records bit-exact.
const NEGATIVE_ZERO = "-0";

class MalformedMessage extends Error {}

class ProtocolMismatch extends Error {}

export function encodeMessage(message: Readonly<RemoteMessage>): string {
  const wireForm = message.kind === "hello" ? { ...message, rules: storedMatchRulesOf(message.rules) } : message;
  return JSON.stringify(wireForm, keepNegativeZero);
}

function keepNegativeZero(_key: string, value: unknown): unknown {
  return Object.is(value, -0) ? NEGATIVE_ZERO : value;
}

export function decodeMessage(text: string): DecodedMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { accepted: false, reason: "malformed", detail: "not JSON" };
  }
  try {
    return { accepted: true, message: readMessage(parsed) };
  } catch (error) {
    return rejectionFor(error);
  }
}

function rejectionFor(error: unknown): DecodedMessage {
  if (error instanceof ProtocolMismatch) {
    return { accepted: false, reason: "protocolMismatch", detail: error.message };
  }
  if (error instanceof MalformedMessage) {
    return { accepted: false, reason: "malformed", detail: error.message };
  }
  throw error;
}

function readMessage(value: unknown): RemoteMessage {
  const fields = readRecord(value, "message");
  switch (fields.kind) {
    case "hello":
      return readHello(fields);
    case "aim":
      return { kind: "aim", aim: readAim(fields.aim) };
    case "shot":
      return { kind: "shot", aim: readAim(fields.aim), shot: readShotRecord(fields.shot) };
    case "outcome":
      return { kind: "outcome", outcome: readOutcome(fields.outcome) };
    case "leave":
      return { kind: "leave" };
    default:
      throw new MalformedMessage("unknown message kind");
  }
}

function readHello(fields: Readonly<Record<string, unknown>>): HelloMessage {
  const protocolVersion = readCount(fields.protocolVersion, "protocolVersion");
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolMismatch(`protocol version ${protocolVersion}, expected ${PROTOCOL_VERSION}`);
  }
  const rules = parseStoredMatchRules(fields.rules);
  if (rules === undefined) {
    throw new MalformedMessage("rules outside the allowed settings");
  }
  const seed = readCount(fields.seed, "seed");
  if (seed > MAX_SEED) {
    throw new MalformedMessage("seed out of range");
  }
  return { kind: "hello", protocolVersion, rules, seed };
}

function readAim(value: unknown): Aim {
  const fields = readRecord(value, "aim");
  return { angle: readFinite(fields.angle, "angle"), power: readFinite(fields.power, "power") };
}

function readShotRecord(value: unknown): ShotRecord {
  const fields = readRecord(value, "shot");
  return {
    x: readFinite(fields.x, "x"),
    y: readFinite(fields.y, "y"),
    vx: readFinite(fields.vx, "vx"),
    vy: readFinite(fields.vy, "vy"),
  };
}

function readOutcome(value: unknown): ShotOutcome {
  const fields = readRecord(value, "outcome");
  const endReason = readEndReason(fields.endReason);
  const stepsFlown = readCount(fields.stepsFlown, "stepsFlown");
  const finalPosition = readPoint(fields.finalPosition, "finalPosition");
  return { endReason, stepsFlown, finalPosition };
}

function readPoint(value: unknown, name: string): Point {
  const fields = readRecord(value, name);
  return { x: readFinite(fields.x, "x"), y: readFinite(fields.y, "y") };
}

function readEndReason(value: unknown): ShotEndReason {
  if (typeof value !== "string" || !Object.hasOwn(SHOT_END_REASONS, value)) {
    throw new MalformedMessage("unknown end reason");
  }
  return value as ShotEndReason;
}

function readRecord(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MalformedMessage(`${name} is not an object`);
  }
  return value as Record<string, unknown>;
}

function readFinite(value: unknown, name: string): number {
  if (value === NEGATIVE_ZERO) {
    return -0;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MalformedMessage(`${name} is not a finite number`);
  }
  return value;
}

function readCount(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new MalformedMessage(`${name} is not a non-negative integer`);
  }
  return value as number;
}

export function shotOutcomesAgree(local: Readonly<ShotOutcome>, remote: Readonly<ShotOutcome>): boolean {
  return local.endReason === remote.endReason
    && local.stepsFlown === remote.stepsFlown
    && local.finalPosition.x === remote.finalPosition.x
    && local.finalPosition.y === remote.finalPosition.y;
}
