// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  decodeSignalingCode,
  encodeSignalingCode,
  type SignalingDescription,
  type SignalingKind,
  type SignalingRejectionReason,
} from "./signalingCode";

export type PeerConnectionFailure = "couldNotConnect" | "noCandidates" | SignalingRejectionReason;

export interface PeerLink {
  send(text: string): void;
  onMessage(listener: (text: string) => void): void;
  readonly closed: Promise<void>;
  close(): void;
}

export interface HostInvitation {
  offerCode: string;
  accept(replyCode: string): Promise<PeerLink>;
  close(): void;
}

export interface GuestReply {
  replyCode: string;
  opened: Promise<PeerLink>;
  close(): void;
}

export type ConnectionFactory = () => RTCPeerConnection;

interface ConnectionCloser {
  closed: Promise<void>;
  close(): void;
}

export const CONNECT_TIMEOUT_MS = 15_000;

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }],
};

const CHANNEL_LABEL = "slingshot";
const CANDIDATE_LINE = /^a=candidate:/m;

export class PeerConnectionError extends Error {
  constructor(readonly reason: PeerConnectionFailure, message: string) {
    super(message);
    this.name = "PeerConnectionError";
  }
}

export function createBrowserConnection(): RTCPeerConnection {
  return new RTCPeerConnection(RTC_CONFIGURATION);
}

export async function hostPeerConnection(createConnection: ConnectionFactory = createBrowserConnection): Promise<HostInvitation> {
  const connection = createConnection();
  const closer = closerFor(connection);
  const channel = connection.createDataChannel(CHANNEL_LABEL);
  const channelOpened = openEventOf(channel);
  try {
    const offer = await gatherLocalDescription(connection);
    requireCandidates(offer);
    const offerCode = await encodeSignalingCode(offer);
    const accept = (replyCode: string) => acceptReply(connection, channelOpened, closer, replyCode);
    return { offerCode, accept, close: closer.close };
  } catch (error) {
    closer.close();
    throw error;
  }
}

export async function joinPeerConnection(offerCode: string, createConnection: ConnectionFactory = createBrowserConnection): Promise<GuestReply> {
  const offer = await decodeOrReject(offerCode, "offer");
  const connection = createConnection();
  const closer = closerFor(connection);
  const channelOpened = incomingChannelOf(connection);
  try {
    await connection.setRemoteDescription(offer);
    const answer = await gatherLocalDescription(connection);
    const replyCode = await encodeSignalingCode(answer);
    const opened = openLink(connection, channelOpened, closer);
    return { replyCode, opened, close: closer.close };
  } catch (error) {
    closer.close();
    throw error;
  }
}

async function acceptReply(
  connection: RTCPeerConnection,
  channelOpened: Promise<RTCDataChannel>,
  closer: ConnectionCloser,
  replyCode: string,
): Promise<PeerLink> {
  const answer = await decodeOrReject(replyCode, "answer");
  await connection.setRemoteDescription(answer);
  return openLink(connection, channelOpened, closer);
}

async function openLink(
  connection: RTCPeerConnection,
  channelOpened: Promise<RTCDataChannel>,
  closer: ConnectionCloser,
): Promise<PeerLink> {
  const channel = await openWithinTimeout(channelOpened, closer);
  return linkOver(connection, channel, closer);
}

async function decodeOrReject(code: string, kind: SignalingKind): Promise<SignalingDescription> {
  const decoded = await decodeSignalingCode(code, kind);
  if (!decoded.accepted) {
    throw new PeerConnectionError(decoded.reason, decoded.detail);
  }
  return decoded.description;
}

async function gatherLocalDescription(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  await connection.setLocalDescription();
  await iceGatheringComplete(connection);
  return connection.localDescription!;
}

function iceGatheringComplete(connection: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (connection.iceGatheringState === "complete") {
      resolve();
      return;
    }
    connection.addEventListener("icegatheringstatechange", () => {
      if (connection.iceGatheringState === "complete") {
        resolve();
      }
    });
  });
}

function requireCandidates(description: Readonly<RTCSessionDescriptionInit>): void {
  if (!CANDIDATE_LINE.test(description.sdp ?? "")) {
    throw new PeerConnectionError("noCandidates", "could not connect (no network address found)");
  }
}

function openEventOf(channel: RTCDataChannel): Promise<RTCDataChannel> {
  return new Promise((resolve) => {
    channel.addEventListener("open", () => resolve(channel), { once: true });
  });
}

function incomingChannelOf(connection: RTCPeerConnection): Promise<RTCDataChannel> {
  return new Promise((resolve) => {
    connection.addEventListener("datachannel", (event) => resolve(event.channel), { once: true });
  });
}

function closerFor(connection: RTCPeerConnection): ConnectionCloser {
  let markClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    markClosed = resolve;
  });
  const close = () => {
    markClosed();
    connection.close();
  };
  return { closed, close };
}

function openWithinTimeout(channelOpened: Promise<RTCDataChannel>, closer: ConnectionCloser): Promise<RTCDataChannel> {
  return new Promise((resolve, reject) => {
    const giveUp = () => {
      const failure = new PeerConnectionError("couldNotConnect", "could not connect (network blocks direct connections)");
      closer.close();
      reject(failure);
    };
    const timer = setTimeout(giveUp, CONNECT_TIMEOUT_MS);
    closer.closed.then(() => clearTimeout(timer));
    channelOpened.then((channel) => {
      clearTimeout(timer);
      resolve(channel);
    });
  });
}

function linkOver(connection: RTCPeerConnection, channel: RTCDataChannel, closer: ConnectionCloser): PeerLink {
  const pending: string[] = [];
  let receive: ((text: string) => void) | undefined;
  channel.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    if (receive === undefined) {
      pending.push(event.data);
    } else {
      receive(event.data);
    }
  });
  channel.addEventListener("close", closer.close);
  connection.addEventListener("connectionstatechange", () => {
    if (connection.connectionState === "failed") {
      closer.close();
    }
  });
  return {
    send: (text) => {
      if (channel.readyState === "open") {
        channel.send(text);
      }
    },
    onMessage: (listener) => {
      receive = listener;
      for (const text of pending.splice(0)) {
        listener(text);
      }
    },
    closed: closer.closed,
    close: closer.close,
  };
}
