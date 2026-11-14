// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { invitationHash, type Route } from "./navigation";
import { hostPeerConnection, joinPeerConnection, PeerConnectionError, type HostInvitation, type PeerConnectionFailure, type PeerLink } from "./peerConnection";

export type RemoteRole = "host" | "guest";

export type StartRemoteMatch = (role: RemoteRole, link: PeerLink) => void;

export interface HostScreenElements {
  invitationField: HTMLElement;
  invitationLink: HTMLInputElement;
  invitationCopyButton: HTMLButtonElement;
  replyForm: HTMLFormElement;
  replyFields: HTMLFieldSetElement;
  replyCodeInput: HTMLInputElement;
  status: HTMLElement;
}

export interface GuestScreenElements {
  replyCodeField: HTMLElement;
  replyCode: HTMLInputElement;
  replyCodeCopyButton: HTMLButtonElement;
  status: HTMLElement;
}

interface Closable {
  close(): void;
}

interface RemoteVisit {
  readonly listeners: AbortController;
  connection: Closable | undefined;
}

const COPY_LABEL = "Copy";
const COPIED_LABEL = "Copied";
const COPY_BLOCKED_LABEL = "Copy manually";

const CONNECTION_FAILURE_MESSAGES = {
  couldNotConnect: "could not connect (network blocks direct connections)",
  noCandidates: "could not connect (no network address found)",
  protocolMismatch: "different game version, reload both",
} as const;

const FAILURE_MESSAGES: Record<RemoteRole, Record<PeerConnectionFailure, string>> = {
  host: {
    ...CONNECTION_FAILURE_MESSAGES,
    malformed: "not a valid reply code, check it and paste again",
    wrongKind: "that is an invitation link, not a reply code",
  },
  guest: {
    ...CONNECTION_FAILURE_MESSAGES,
    malformed: "this invitation link is not valid",
    wrongKind: "this invitation link is not valid",
  },
};

const UNEXPECTED_FAILURE_MESSAGE = "could not connect";

const RETRYABLE_REPLY_FAILURES: ReadonlySet<PeerConnectionFailure> = new Set(["malformed", "wrongKind", "protocolMismatch"]);

export function failureMessage(role: RemoteRole, error: unknown): string {
  if (error instanceof PeerConnectionError) {
    return FAILURE_MESSAGES[role][error.reason];
  }
  return UNEXPECTED_FAILURE_MESSAGE;
}

export function bindRemoteMatchScreens(
  target: Window,
  host: HostScreenElements,
  guest: GuestScreenElements,
  startRemoteMatch: StartRemoteMatch,
): (route: Route) => void {
  bindCopyButton(target, host.invitationCopyButton, host.invitationLink);
  bindCopyButton(target, guest.replyCodeCopyButton, guest.replyCode);
  let visit: RemoteVisit | undefined;
  return (route) => {
    if (visit !== undefined) {
      leaveVisit(visit);
    }
    visit = startVisit();
    if (route.screen === "host") {
      hostRemoteMatch(target, host, visit, startRemoteMatch);
    }
    if (route.screen === "guest") {
      joinRemoteMatch(guest, visit, route.offerCode, startRemoteMatch);
    }
  };
}

function startVisit(): RemoteVisit {
  const listeners = new AbortController();
  return { listeners, connection: undefined };
}

function leaveVisit(visit: RemoteVisit): void {
  visit.listeners.abort();
  visit.connection?.close();
}

function isActive(visit: RemoteVisit): boolean {
  return !visit.listeners.signal.aborted;
}

function handOver(visit: RemoteVisit, role: RemoteRole, link: PeerLink, startRemoteMatch: StartRemoteMatch): void {
  visit.connection = undefined;
  startRemoteMatch(role, link);
}

function adopt(visit: RemoteVisit, connection: Closable): boolean {
  if (!isActive(visit)) {
    connection.close();
    return false;
  }
  visit.connection = connection;
  return true;
}

async function hostRemoteMatch(
  target: Window,
  elements: HostScreenElements,
  visit: RemoteVisit,
  startRemoteMatch: StartRemoteMatch,
): Promise<void> {
  resetHostScreen(elements);
  showStatus(elements.status, "Preparing invitation…", false);
  try {
    const invitation = await hostPeerConnection();
    if (!adopt(visit, invitation)) {
      return;
    }
    showInvitation(target, elements, invitation.offerCode);
    const submitReply = (event: SubmitEvent) => {
      event.preventDefault();
      acceptReplyCode(elements, visit, invitation, startRemoteMatch);
    };
    elements.replyForm.addEventListener("submit", submitReply, { signal: visit.listeners.signal });
  } catch (error) {
    reportFailure(elements.status, visit, "host", error);
  }
}

async function acceptReplyCode(
  elements: HostScreenElements,
  visit: RemoteVisit,
  invitation: HostInvitation,
  startRemoteMatch: StartRemoteMatch,
): Promise<void> {
  const replyCode = elements.replyCodeInput.value.trim();
  elements.replyFields.disabled = true;
  showStatus(elements.status, "Connecting…", false);
  try {
    const link = await invitation.accept(replyCode);
    if (!adopt(visit, link)) {
      return;
    }
    elements.replyForm.hidden = true;
    handOver(visit, "host", link, startRemoteMatch);
  } catch (error) {
    offerReplyRetry(elements, error);
    reportFailure(elements.status, visit, "host", error);
  }
}

function offerReplyRetry(elements: HostScreenElements, error: unknown): void {
  const retryable = error instanceof PeerConnectionError && RETRYABLE_REPLY_FAILURES.has(error.reason);
  elements.replyForm.hidden = !retryable;
  elements.replyFields.disabled = !retryable;
  if (retryable) {
    elements.replyCodeInput.select();
  }
}

async function joinRemoteMatch(
  elements: GuestScreenElements,
  visit: RemoteVisit,
  offerCode: string,
  startRemoteMatch: StartRemoteMatch,
): Promise<void> {
  elements.replyCodeField.hidden = true;
  elements.replyCodeCopyButton.textContent = COPY_LABEL;
  showStatus(elements.status, "Preparing reply code…", false);
  try {
    const reply = await joinPeerConnection(offerCode);
    if (!adopt(visit, reply)) {
      return;
    }
    showReplyCode(elements, reply.replyCode);
    const link = await reply.opened;
    if (!adopt(visit, link)) {
      return;
    }
    elements.replyCodeField.hidden = true;
    handOver(visit, "guest", link, startRemoteMatch);
  } catch (error) {
    elements.replyCodeField.hidden = true;
    reportFailure(elements.status, visit, "guest", error);
  }
}

function resetHostScreen(elements: HostScreenElements): void {
  elements.invitationField.hidden = true;
  elements.invitationCopyButton.textContent = COPY_LABEL;
  elements.replyForm.hidden = true;
  elements.replyForm.reset();
  elements.replyFields.disabled = false;
}

function showInvitation(target: Window, elements: HostScreenElements, offerCode: string): void {
  const hash = invitationHash(offerCode);
  elements.invitationLink.value = new URL(hash, target.location.href).href;
  elements.invitationField.hidden = false;
  elements.replyForm.hidden = false;
  elements.invitationCopyButton.focus();
  showStatus(elements.status, "Waiting for the reply code", false);
}

function showReplyCode(elements: GuestScreenElements, replyCode: string): void {
  elements.replyCode.value = replyCode;
  elements.replyCodeField.hidden = false;
  elements.replyCodeCopyButton.focus();
  showStatus(elements.status, "Waiting for the host to connect…", false);
}

function reportFailure(status: HTMLElement, visit: RemoteVisit, role: RemoteRole, error: unknown): void {
  if (isActive(visit)) {
    showStatus(status, failureMessage(role, error), true);
  }
  if (!(error instanceof PeerConnectionError)) {
    throw error;
  }
}

function showStatus(status: HTMLElement, text: string, failed: boolean): void {
  status.textContent = text;
  status.toggleAttribute("data-failed", failed);
}

function bindCopyButton(target: Window, button: HTMLButtonElement, field: HTMLInputElement): void {
  button.addEventListener("click", async () => {
    field.select();
    try {
      await target.navigator.clipboard.writeText(field.value);
      button.textContent = COPIED_LABEL;
    } catch {
      button.textContent = COPY_BLOCKED_LABEL;
    }
  });
}
