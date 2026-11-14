// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { invitationHash } from "./navigation";
import type { PeerConnectionFailure } from "./peerConnection";
import type { RemoteRole } from "./remoteMatch";
import type { ReplyRelay } from "./replyRelay";
import { startGuestVisit, startHostVisit, type HostVisit, type PeerConnectors, type RemoteVisit } from "./remoteVisit";
import type { EnterRemoteRoute } from "./routeController";
import type { Invitation, VisitFailure, VisitState } from "./visitTransition";

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

export function bindRemoteMatchScreens(
  target: Window,
  host: HostScreenElements,
  guest: GuestScreenElements,
  peers: PeerConnectors,
  relay: ReplyRelay,
): EnterRemoteRoute {
  bindCopyButton(target, host.invitationCopyButton, host.invitationLink);
  bindCopyButton(target, guest.replyCodeCopyButton, guest.replyCode);
  let visit: RemoteVisit | undefined;
  let hostVisit: HostVisit | undefined;
  host.replyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const replyCode = host.replyCodeInput.value.trim();
    hostVisit?.submitReply(replyCode);
  });
  const showHostState = (state: VisitState) => showHostScreen(target, host, state);
  const showGuestState = (state: VisitState) => showGuestScreen(guest, state);
  return (route, startRemoteMatch) => {
    visit?.leave();
    visit = undefined;
    hostVisit = undefined;
    if (route.screen === "host") {
      hostVisit = startHostVisit(peers.host, relay, showHostState, startRemoteMatch);
      visit = hostVisit;
    }
    if (route.screen === "guest") {
      const invitation: Invitation = { offerCode: route.offerCode, roomSecret: route.roomSecret };
      visit = startGuestVisit(peers.join, relay, invitation, showGuestState, startRemoteMatch);
    }
  };
}

function showHostScreen(target: Window, elements: HostScreenElements, state: VisitState): void {
  switch (state.phase) {
    case "pending":
      resetHostScreen(elements);
      showStatus(elements.status, "Preparing invitation…", false);
      return;
    case "invitation":
      showInvitation(target, elements, state.invitation);
      return;
    case "connecting":
      elements.replyFields.disabled = true;
      showStatus(elements.status, "Connecting…", false);
      return;
    case "handedOver":
      elements.replyForm.hidden = true;
      return;
    case "failed":
      offerReplyRetry(elements, state.retry);
      showFailure(elements.status, "host", state.failure);
  }
}

function showGuestScreen(elements: GuestScreenElements, state: VisitState): void {
  switch (state.phase) {
    case "pending":
      elements.replyCodeField.hidden = true;
      elements.replyCodeCopyButton.textContent = COPY_LABEL;
      showStatus(elements.status, "Preparing to join…", false);
      return;
    case "joining":
      showStatus(elements.status, "Joining…", false);
      return;
    case "replyCode":
      showReplyCode(elements, state.code);
      return;
    case "handedOver":
      elements.replyCodeField.hidden = true;
      return;
    case "failed":
      elements.replyCodeField.hidden = true;
      showFailure(elements.status, "guest", state.failure);
  }
}

function offerReplyRetry(elements: HostScreenElements, retry: boolean): void {
  elements.replyForm.hidden = !retry;
  elements.replyFields.disabled = !retry;
  if (retry) {
    elements.replyCodeInput.select();
  }
}

function resetHostScreen(elements: HostScreenElements): void {
  elements.invitationField.hidden = true;
  elements.invitationCopyButton.textContent = COPY_LABEL;
  elements.replyForm.hidden = true;
  elements.replyForm.reset();
  elements.replyFields.disabled = false;
}

function showInvitation(target: Window, elements: HostScreenElements, invitation: Invitation): void {
  const hash = invitationHash(invitation.offerCode, invitation.roomSecret);
  elements.invitationLink.value = new URL(hash, target.location.href).href;
  elements.invitationField.hidden = false;
  elements.replyForm.hidden = false;
  elements.invitationCopyButton.focus();
  showStatus(elements.status, "Waiting for the guest to join", false);
}

function showReplyCode(elements: GuestScreenElements, replyCode: string): void {
  elements.replyCode.value = replyCode;
  elements.replyCodeField.hidden = false;
  elements.replyCodeCopyButton.focus();
  showStatus(elements.status, "Couldn't join automatically, send this code to the host", false);
}

function showFailure(status: HTMLElement, role: RemoteRole, failure: VisitFailure): void {
  const message = failureMessage(role, failure);
  showStatus(status, message, true);
}

function failureMessage(role: RemoteRole, failure: VisitFailure): string {
  if (failure === "unexpected") {
    return UNEXPECTED_FAILURE_MESSAGE;
  }
  return FAILURE_MESSAGES[role][failure];
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
