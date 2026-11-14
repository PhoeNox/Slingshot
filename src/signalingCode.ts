// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { PROTOCOL_VERSION } from "./remoteProtocol";

export type SignalingKind = "offer" | "answer";

export interface SignalingDescription {
  type: SignalingKind;
  sdp: string;
}

export type SignalingRejectionReason = "malformed" | "wrongKind" | "protocolMismatch";

export type DecodedSignalingCode =
  | { accepted: true; description: SignalingDescription }
  | { accepted: false; reason: SignalingRejectionReason; detail: string };

interface ConnectionFields {
  kind: SignalingKind;
  setup: string;
  mid: string;
  iceUfrag: string;
  icePwd: string;
  fingerprintAlgorithm: string;
  fingerprintHex: string;
  candidates: Candidate[];
}

interface Candidate {
  type: string;
  protocol: string;
  priority: string;
  address: string;
  port: string;
  tcpType: string | undefined;
}

const COMPRESSION_FORMAT = "deflate-raw";
const MAX_CODE_LENGTH = 2000;
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

const SETUP_ROLE = /^(?:actpass|active|passive)$/;
const MID = /^[A-Za-z0-9_-]{1,32}$/;
const ICE_UFRAG = /^[A-Za-z0-9+/]{4,256}$/;
const ICE_PWD = /^[A-Za-z0-9+/]{22,256}$/;
const HASH_ALGORITHM = /^[a-z0-9-]{1,16}$/;
const FINGERPRINT_HEX = /^(?:[0-9A-F]{2}){16,64}$/;
const CANDIDATE_TYPE = /^(?:host|srflx|prflx|relay)$/;
const PROTOCOL = /^(?:udp|tcp)$/;
const TCP_TYPE = /^(?:active|passive|so)$/;
const ADDRESS = /^[A-Za-z0-9.:-]{1,253}$/;
const DIGITS = /^\d{1,10}$/;
const HEX_BYTE = /../g;

const MAX_PRIORITY = 0xffffffff;
const MAX_PORT = 0xffff;

const CANDIDATE_PREFIX = "a=candidate:";
const SESSION_ID = "1";
const SCTP_PORT = 5000;
const MAX_MESSAGE_SIZE = 262144;

class RejectedCode extends Error {
  constructor(readonly reason: SignalingRejectionReason, detail: string) {
    super(detail);
  }
}

export async function encodeSignalingCode(description: Readonly<RTCSessionDescriptionInit>): Promise<string> {
  const fields = readConnectionFields(description);
  const compactText = writeCompactText(fields);
  const compressed = await deflate(compactText);
  return toBase64Url(compressed);
}

export async function decodeSignalingCode(code: string, expectedKind: SignalingKind): Promise<DecodedSignalingCode> {
  try {
    const compactText = await inflateCode(code);
    const fields = readCompactText(compactText, expectedKind);
    const sdp = writeSdp(fields);
    return { accepted: true, description: { type: fields.kind, sdp } };
  } catch (error) {
    return rejectionFor(error);
  }
}

function rejectionFor(error: unknown): DecodedSignalingCode {
  if (error instanceof RejectedCode) {
    return { accepted: false, reason: error.reason, detail: error.message };
  }
  throw error;
}

function readConnectionFields(description: Readonly<RTCSessionDescriptionInit>): ConnectionFields {
  const { type, sdp } = description;
  if ((type !== "offer" && type !== "answer") || sdp === undefined) {
    throw new Error(`cannot encode a ${type} description`);
  }
  const lines = sdp.split(/\r?\n/);
  const [fingerprintAlgorithm, fingerprint] = sdpAttribute(lines, "fingerprint").split(" ");
  return {
    kind: type,
    setup: sdpAttribute(lines, "setup"),
    mid: sdpAttribute(lines, "mid"),
    iceUfrag: sdpAttribute(lines, "ice-ufrag"),
    icePwd: sdpAttribute(lines, "ice-pwd"),
    fingerprintAlgorithm,
    fingerprintHex: fingerprint.replaceAll(":", "").toUpperCase(),
    candidates: lines
      .filter((line) => line.startsWith(CANDIDATE_PREFIX))
      .map(readSdpCandidate)
      .filter((candidate) => candidate !== undefined),
  };
}

function sdpAttribute(lines: readonly string[], name: string): string {
  const prefix = `a=${name}:`;
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  if (line === undefined) {
    throw new Error(`session description lacks a=${name}`);
  }
  return line.slice(prefix.length);
}

function readSdpCandidate(line: string): Candidate | undefined {
  const [, component, protocol, priority, address, port, , type, ...extensions] = line.slice(CANDIDATE_PREFIX.length).split(" ");
  const normalizedProtocol = protocol.toLowerCase();
  if (component !== "1" || !PROTOCOL.test(normalizedProtocol)) {
    return undefined;
  }
  const tcpTypeIndex = extensions.indexOf("tcptype");
  const tcpType = tcpTypeIndex === -1 ? undefined : extensions[tcpTypeIndex + 1];
  return { type, protocol: normalizedProtocol, priority, address, port, tcpType };
}

function writeCompactText(fields: Readonly<ConnectionFields>): string {
  const header = [
    PROTOCOL_VERSION,
    fields.kind,
    fields.setup,
    fields.mid,
    fields.iceUfrag,
    fields.icePwd,
    fields.fingerprintAlgorithm,
    fields.fingerprintHex,
  ].join(" ");
  const candidateLines = fields.candidates.map((candidate) => [
    candidate.type,
    candidate.protocol,
    candidate.priority,
    candidate.address,
    candidate.port,
    candidate.tcpType,
  ].filter((field) => field !== undefined).join(" "));
  return [header, ...candidateLines].join("\n");
}

function readCompactText(text: string, expectedKind: SignalingKind): ConnectionFields {
  const [header, ...candidateLines] = text.split("\n");
  const [version, kind, setup, mid, iceUfrag, icePwd, fingerprintAlgorithm, fingerprintHex, ...extraFields] = header.split(" ");
  readProtocolVersion(version);
  if (kind !== "offer" && kind !== "answer") {
    throw new RejectedCode("malformed", "unknown code kind");
  }
  if (kind !== expectedKind) {
    throw new RejectedCode("wrongKind", `${kind} code, expected ${expectedKind}`);
  }
  if (extraFields.length > 0) {
    throw new RejectedCode("malformed", "unexpected header fields");
  }
  return {
    kind,
    setup: readToken(setup, SETUP_ROLE, "setup"),
    mid: readToken(mid, MID, "mid"),
    iceUfrag: readToken(iceUfrag, ICE_UFRAG, "ice-ufrag"),
    icePwd: readToken(icePwd, ICE_PWD, "ice-pwd"),
    fingerprintAlgorithm: readToken(fingerprintAlgorithm, HASH_ALGORITHM, "fingerprint algorithm"),
    fingerprintHex: readToken(fingerprintHex, FINGERPRINT_HEX, "fingerprint"),
    candidates: candidateLines.map(readCompactCandidate),
  };
}

function readProtocolVersion(version: string): void {
  if (!DIGITS.test(version)) {
    throw new RejectedCode("malformed", "protocol version is not a number");
  }
  if (Number(version) !== PROTOCOL_VERSION) {
    throw new RejectedCode("protocolMismatch", `protocol version ${version}, expected ${PROTOCOL_VERSION}`);
  }
}

function readCompactCandidate(line: string): Candidate {
  const [type, protocol, priority, address, port, tcpType, ...extraFields] = line.split(" ");
  if (extraFields.length > 0) {
    throw new RejectedCode("malformed", "unexpected candidate fields");
  }
  const candidate = {
    type: readToken(type, CANDIDATE_TYPE, "candidate type"),
    protocol: readToken(protocol, PROTOCOL, "protocol"),
    priority: readBoundedNumber(priority, MAX_PRIORITY, "priority"),
    address: readToken(address, ADDRESS, "address"),
    port: readBoundedNumber(port, MAX_PORT, "port"),
    tcpType: tcpType === undefined ? undefined : readToken(tcpType, TCP_TYPE, "tcptype"),
  };
  if ((candidate.protocol === "tcp") !== (candidate.tcpType !== undefined)) {
    throw new RejectedCode("malformed", "tcptype without tcp or tcp without tcptype");
  }
  return candidate;
}

function readToken(value: string | undefined, pattern: RegExp, name: string): string {
  if (value === undefined || !pattern.test(value)) {
    throw new RejectedCode("malformed", `invalid ${name}`);
  }
  return value;
}

function readBoundedNumber(value: string | undefined, max: number, name: string): string {
  if (value === undefined || !DIGITS.test(value) || Number(value) > max) {
    throw new RejectedCode("malformed", `invalid ${name}`);
  }
  return value;
}

function writeSdp(fields: Readonly<ConnectionFields>): string {
  const candidateLines = fields.candidates.map((candidate, index) => {
    const tcpTypeExtension = candidate.tcpType === undefined ? "" : ` tcptype ${candidate.tcpType}`;
    const foundation = index + 1;
    return `${CANDIDATE_PREFIX}${foundation} 1 ${candidate.protocol} ${candidate.priority} ${candidate.address} ${candidate.port} typ ${candidate.type}${tcpTypeExtension}`;
  });
  const fingerprint = fields.fingerprintHex.match(HEX_BYTE)!.join(":");
  const lines = [
    "v=0",
    `o=- ${SESSION_ID} 2 IN IP4 127.0.0.1`,
    "s=-",
    "t=0 0",
    `a=group:BUNDLE ${fields.mid}`,
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    ...candidateLines,
    "a=end-of-candidates",
    `a=ice-ufrag:${fields.iceUfrag}`,
    `a=ice-pwd:${fields.icePwd}`,
    `a=fingerprint:${fields.fingerprintAlgorithm} ${fingerprint}`,
    `a=setup:${fields.setup}`,
    `a=mid:${fields.mid}`,
    `a=sctp-port:${SCTP_PORT}`,
    `a=max-message-size:${MAX_MESSAGE_SIZE}`,
    "",
  ];
  return lines.join("\r\n");
}

async function inflateCode(code: string): Promise<string> {
  if (code.length > MAX_CODE_LENGTH || !CODE_PATTERN.test(code)) {
    throw new RejectedCode("malformed", "not a signaling code");
  }
  try {
    const compressed = fromBase64Url(code);
    return await inflate(compressed);
  } catch {
    throw new RejectedCode("malformed", "not a compressed signaling code");
  }
}

async function deflate(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const source = new Blob([text]);
  const compression = new CompressionStream(COMPRESSION_FORMAT);
  const compressed = source.stream().pipeThrough(compression);
  const buffer = await new Response(compressed).arrayBuffer();
  return new Uint8Array(buffer);
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const source = new Blob([bytes]);
  const decompression = new DecompressionStream(COMPRESSION_FORMAT);
  const decompressed = source.stream().pipeThrough(decompression);
  const buffer = await new Response(decompressed).arrayBuffer();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return decoder.decode(buffer);
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(code: string): Uint8Array<ArrayBuffer> {
  const base64 = code.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
