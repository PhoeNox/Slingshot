// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

const SETTINGS_KEY = "slingshot.settings";

export function readStoredSettings(target: Window): string | null {
  try {
    return target.localStorage.getItem(SETTINGS_KEY);
  } catch {
    return null;
  }
}

export function writeStoredSettings(target: Window, serialised: string): void {
  try {
    target.localStorage.setItem(SETTINGS_KEY, serialised);
  } catch {
    return;
  }
}
