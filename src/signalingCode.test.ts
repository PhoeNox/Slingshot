// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { PROTOCOL_VERSION } from "./remoteProtocol";
import { decodeSignalingCode, encodeSignalingCode, type SignalingKind } from "./signalingCode";
import { CHROME_ANSWER, CHROME_OFFER, FIREFOX_OFFER } from "./signalingCode.fixtures";

const FINGERPRINT_HEX = "20D45C01C7F4A791A2F1F3DC72CBEB875A13D0E90DEB971EC950B50470CCE969";
const VALID_HEADER = `${PROTOCOL_VERSION} offer actpass 0 Z6zJ NJKo1aLaH9tFyoeZQxpM8dDU sha-256 ${FINGERPRINT_HEX}`;

function connectionFieldsOf(sdp: string) {
  const lines = sdp.split(/\r?\n/);
  const attribute = (name: string) => lines.find((line) => line.startsWith(`a=${name}:`))?.slice(name.length + 3);
  const candidates = lines
    .filter((line) => line.startsWith("a=candidate:"))
    .map((line) => {
      const fields = line.split(" ");
      const tcpTypeIndex = fields.indexOf("tcptype");
      return {
        protocol: fields[2].toLowerCase(),
        priority: fields[3],
        address: fields[4],
        port: fields[5],
        type: fields[7],
        tcpType: tcpTypeIndex === -1 ? undefined : fields[tcpTypeIndex + 1],
      };
    });
  return {
    iceUfrag: attribute("ice-ufrag"),
    icePwd: attribute("ice-pwd"),
    fingerprint: attribute("fingerprint")?.toUpperCase(),
    setup: attribute("setup"),
    mid: attribute("mid"),
    candidates,
  };
}

async function codeOf(compactText: string): Promise<string> {
  const compressed = new Blob([compactText]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

describe("encodeSignalingCode and decodeSignalingCode", () => {
  test.each<[string, RTCSessionDescriptionInit, SignalingKind, number]>([
    ["Chrome offer", CHROME_OFFER, "offer", 4],
    ["Chrome answer", CHROME_ANSWER, "answer", 2],
    ["Firefox offer", FIREFOX_OFFER, "offer", 3],
  ])("a %s keeps every connection field", async (_name, description, kind, candidateCount) => {
    const code = await encodeSignalingCode(description);
    const decoded = await decodeSignalingCode(code, kind);

    expect(decoded.accepted).toBe(true);
    if (!decoded.accepted) {
      return;
    }
    const original = connectionFieldsOf(description.sdp!);
    expect(original.candidates).toHaveLength(candidateCount);
    expect(decoded.description.type).toBe(kind);
    expect(connectionFieldsOf(decoded.description.sdp)).toEqual(original);
  });

  test.each<[string, RTCSessionDescriptionInit]>([
    ["Chrome", CHROME_OFFER],
    ["Firefox", FIREFOX_OFFER],
  ])("a %s offer code is URL-safe and under 400 characters", async (_name, description) => {
    const code = await encodeSignalingCode(description);

    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(400);
  });

  test("the expanded description uses CRLF line endings and lists end of candidates", async () => {
    const code = await encodeSignalingCode(CHROME_OFFER);
    const decoded = await decodeSignalingCode(code, "offer");

    expect(decoded.accepted && decoded.description.sdp).toMatch(/^v=0\r\n[^]*a=end-of-candidates\r\n[^]*\r\n$/);
  });
});

describe("decodeSignalingCode rejections", () => {
  test.each(["", "!!!", "not a code", "AAAA", "A", "a".repeat(3000)])("garbage %j is malformed", async (code) => {
    await expect(decodeSignalingCode(code, "offer")).resolves.toMatchObject({ accepted: false, reason: "malformed" });
  });

  test.each([
    ["half", (code: string) => code.slice(0, code.length / 2)],
    ["all but the last eight characters", (code: string) => code.slice(0, -8)],
  ])("a code truncated to %s is malformed", async (_name, truncate) => {
    const code = await encodeSignalingCode(CHROME_OFFER);

    await expect(decodeSignalingCode(truncate(code), "offer")).resolves.toMatchObject({ accepted: false, reason: "malformed" });
  });

  test("an offer code pasted where a reply code is expected is the wrong kind", async () => {
    const code = await encodeSignalingCode(CHROME_OFFER);

    await expect(decodeSignalingCode(code, "answer")).resolves.toMatchObject({ accepted: false, reason: "wrongKind" });
  });

  test("a reply code opened as an invitation is the wrong kind", async () => {
    const code = await encodeSignalingCode(CHROME_ANSWER);

    await expect(decodeSignalingCode(code, "offer")).resolves.toMatchObject({ accepted: false, reason: "wrongKind" });
  });

  test("an offer from another protocol version is a mismatch, whatever follows the version", async () => {
    const code = await codeOf(`${PROTOCOL_VERSION + 1} something else entirely`);

    await expect(decodeSignalingCode(code, "offer")).resolves.toMatchObject({ accepted: false, reason: "protocolMismatch" });
  });

  test("a well-formed compact text is accepted", async () => {
    const code = await codeOf(`${VALID_HEADER}\nhost udp 2113937151 198.51.100.23 58437`);

    await expect(decodeSignalingCode(code, "offer")).resolves.toMatchObject({ accepted: true });
  });

  test.each([
    ["an unknown kind", `${PROTOCOL_VERSION} pranswer actpass 0 Z6zJ NJKo1aLaH9tFyoeZQxpM8dDU sha-256 ${FINGERPRINT_HEX}`],
    ["a non-numeric version", `v1 offer actpass 0 Z6zJ NJKo1aLaH9tFyoeZQxpM8dDU sha-256 ${FINGERPRINT_HEX}`],
    ["a missing fingerprint", `${PROTOCOL_VERSION} offer actpass 0 Z6zJ NJKo1aLaH9tFyoeZQxpM8dDU sha-256`],
    ["an extra header field", `${VALID_HEADER} extra`],
    ["an unknown setup role", `${PROTOCOL_VERSION} offer both 0 Z6zJ NJKo1aLaH9tFyoeZQxpM8dDU sha-256 ${FINGERPRINT_HEX}`],
    ["a short ice-pwd", `${PROTOCOL_VERSION} offer actpass 0 Z6zJ short sha-256 ${FINGERPRINT_HEX}`],
    ["an odd-length fingerprint", `${PROTOCOL_VERSION} offer actpass 0 Z6zJ NJKo1aLaH9tFyoeZQxpM8dDU sha-256 ${FINGERPRINT_HEX}A`],
    ["an address carrying an SDP line", `${VALID_HEADER}\nhost udp 1 198.51.100.23\ra=setup:active 9`],
    ["a port out of range", `${VALID_HEADER}\nhost udp 1 198.51.100.23 65536`],
    ["a priority out of range", `${VALID_HEADER}\nhost udp 4294967296 198.51.100.23 9`],
    ["a tcp candidate without tcptype", `${VALID_HEADER}\nhost tcp 1 198.51.100.23 9`],
    ["a udp candidate with tcptype", `${VALID_HEADER}\nhost udp 1 198.51.100.23 9 active`],
    ["an unknown candidate type", `${VALID_HEADER}\nmdns udp 1 198.51.100.23 9`],
    ["an empty candidate line", `${VALID_HEADER}\n`],
  ])("a code with %s is malformed", async (_name, compactText) => {
    const code = await codeOf(compactText);

    await expect(decodeSignalingCode(code, "offer")).resolves.toMatchObject({ accepted: false, reason: "malformed" });
  });

  test("a code whose content is not UTF-8 is malformed", async () => {
    const compressed = new Blob([new Uint8Array([0xff, 0xfe])]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
    const code = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

    await expect(decodeSignalingCode(code, "offer")).resolves.toMatchObject({ accepted: false, reason: "malformed" });
  });
});
