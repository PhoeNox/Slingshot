// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

export interface Settings {
  gravityWellContours: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { gravityWellContours: true };

export function parseSettings(stored: string | null): Settings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored ?? "");
  } catch {
    parsed = undefined;
  }
  const fields = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const gravityWellContours =
    typeof fields.gravityWellContours === "boolean" ? fields.gravityWellContours : DEFAULT_SETTINGS.gravityWellContours;
  return { gravityWellContours };
}

export function serialiseSettings(settings: Readonly<Settings>): string {
  return JSON.stringify(settings);
}
