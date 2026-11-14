// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { fromBase64Url, toBase64Url } from "./signalingCode";

export interface RelayRoom {
  readonly tag: string;
  seal(text: string): Promise<string>;
  open(sealed: string): Promise<string | undefined>;
}

const SECRET_BYTES = 16;
const TAG_BITS = 256;
const KEY_BITS = 256;
const IV_BYTES = 12;
const HKDF_SALT = "slingshot relay room";
const TAG_INFO = "room tag";
const KEY_INFO = "reply key";

export function createRoomSecret(): string {
  const secret = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
  return toBase64Url(secret);
}

export async function openRelayRoom(roomSecret: string): Promise<RelayRoom> {
  const secretBytes = utf8(roomSecret);
  const material = await crypto.subtle.importKey("raw", secretBytes, "HKDF", false, ["deriveBits", "deriveKey"]);
  const tagParams = hkdfParams(TAG_INFO);
  const tagBits = await crypto.subtle.deriveBits(tagParams, material, TAG_BITS);
  const tag = toBase64Url(new Uint8Array(tagBits));
  const keyParams = hkdfParams(KEY_INFO);
  const aesParams: AesKeyGenParams = { name: "AES-GCM", length: KEY_BITS };
  const key = await crypto.subtle.deriveKey(keyParams, material, aesParams, false, ["encrypt", "decrypt"]);
  const seal = (text: string) => sealText(key, text);
  const open = (sealed: string) => openSealed(key, sealed);
  return { tag, seal, open };
}

async function sealText(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const params: AesGcmParams = { name: "AES-GCM", iv };
  const plaintext = utf8(text);
  const ciphertext = await crypto.subtle.encrypt(params, key, plaintext);
  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), IV_BYTES);
  return toBase64Url(sealed);
}

async function openSealed(key: CryptoKey, sealed: string): Promise<string | undefined> {
  try {
    const bytes = fromBase64Url(sealed);
    const iv = bytes.slice(0, IV_BYTES);
    const params: AesGcmParams = { name: "AES-GCM", iv };
    const ciphertext = bytes.slice(IV_BYTES);
    const plaintext = await crypto.subtle.decrypt(params, key, ciphertext);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(plaintext);
  } catch {
    return undefined;
  }
}

function hkdfParams(info: string): HkdfParams {
  return { name: "HKDF", hash: "SHA-256", salt: utf8(HKDF_SALT), info: utf8(info) };
}

function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}
