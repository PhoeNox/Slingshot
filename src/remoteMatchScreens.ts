// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { invitationHash } from "./navigation";
import type { PeerConnectionFailure } from "./peerConnection";
import type { RemoteRole } from "./remoteMatch";
import type { VisitScreens } from "./screenSession";
import type { Invitation, VisitFailure, VisitState } from "./visitTransition";

export interface HostScreenElements {
  invitationField: HTMLElement;
  invitationLink: HTMLInputElement;
  invitationCopyButton: HTMLButtonElement;
  invitationShareButton: HTMLButtonElement;
  replyForm: HTMLFormElement;
  replyFields: HTMLFieldSetElement;
  replyCodeInput: HTMLInputElement;
  status: HTMLElement;
}

export interface GuestScreenElements {
  replyCodeField: HTMLElement;
  replyCode: HTMLInputElement;
  replyCodeCopyButton: HTMLButtonElement;
  replyCodeShareButton: HTMLButtonElement;
  status: HTMLElement;
}

export type SubmitReplyCode = (replyCode: string) => void;

export type ShareNavigator = Partial<Pick<Navigator, "canShare" | "share">>;

type ShareDataOf = (value: string) => ShareData;

const invitationShareData: ShareDataOf = (url) => ({ url });
const replyCodeShareData: ShareDataOf = (text) => ({ text });

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
  submitReply: SubmitReplyCode,
): VisitScreens {
  bindCopyButton(target, host.invitationCopyButton, host.invitationLink);
  bindCopyButton(target, guest.replyCodeCopyButton, guest.replyCode);
  bindShareButton(target, host.invitationShareButton, host.invitationLink, invitationShareData);
  bindShareButton(target, guest.replyCodeShareButton, guest.replyCode, replyCodeShareData);
  host.replyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const replyCode = host.replyCodeInput.value.trim();
    submitReply(replyCode);
  });
  const showHostState = (state: VisitState) => showHostScreen(target, host, state);
  const showGuestState = (state: VisitState) => showGuestScreen(target, guest, state);
  return { showHostState, showGuestState };
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

function showGuestScreen(target: Window, elements: GuestScreenElements, state: VisitState): void {
  switch (state.phase) {
    case "pending":
      elements.replyCodeField.hidden = true;
      elements.replyCodeCopyButton.textContent = COPY_LABEL;
      elements.replyCodeShareButton.hidden = true;
      showStatus(elements.status, "Preparing to join…", false);
      return;
    case "joining":
      showStatus(elements.status, "Joining…", false);
      return;
    case "replyCode":
      showReplyCode(target, elements, state.code);
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
  elements.invitationShareButton.hidden = true;
  elements.replyForm.hidden = true;
  elements.replyForm.reset();
  elements.replyFields.disabled = false;
}

function showInvitation(target: Window, elements: HostScreenElements, invitation: Invitation): void {
  const hash = invitationHash(invitation.offerCode, invitation.roomSecret);
  const link = new URL(hash, target.location.href).href;
  elements.invitationLink.value = link;
  const shareData = invitationShareData(link);
  elements.invitationShareButton.hidden = !canShareCode(target.navigator, shareData);
  elements.invitationField.hidden = false;
  elements.replyForm.hidden = false;
  elements.invitationCopyButton.focus();
  showStatus(elements.status, "Waiting for the guest to join", false);
}

function showReplyCode(target: Window, elements: GuestScreenElements, replyCode: string): void {
  elements.replyCode.value = replyCode;
  const shareData = replyCodeShareData(replyCode);
  elements.replyCodeShareButton.hidden = !canShareCode(target.navigator, shareData);
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

function bindShareButton(target: Window, button: HTMLButtonElement, field: HTMLInputElement, shareDataOf: ShareDataOf): void {
  button.addEventListener("click", () => {
    const shareData = shareDataOf(field.value);
    void shareCode(target.navigator, shareData);
  });
}

export function canShareCode(navigator: ShareNavigator, shareData: ShareData): boolean {
  return navigator.canShare !== undefined && navigator.share !== undefined && navigator.canShare(shareData);
}

export async function shareCode(navigator: ShareNavigator, shareData: ShareData): Promise<void> {
  try {
    await navigator.share!(shareData);
  } catch (error) {
    if (!isShareCancelled(error)) {
      throw error;
    }
  }
}

function isShareCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
