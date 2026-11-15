// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

export function canEnterFullscreen(document: Document): boolean {
  return document.fullscreenEnabled;
}

export async function enterLandscapeFullscreen(document: Document, screen: Screen): Promise<void> {
  await document.documentElement.requestFullscreen();
  try {
    await screen.orientation.lock("landscape");
  } catch {
    return;
  }
}
