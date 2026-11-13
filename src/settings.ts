// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_MATCH_RULES, type MatchRules, type PlanetCountRange } from "./core/match";

export interface Settings {
  gravityWellContours: boolean;
  planetCount: Readonly<PlanetCountRange>;
  timeoutSeconds: number | undefined;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  gravityWellContours: true,
  planetCount: DEFAULT_MATCH_RULES.planetCount,
  timeoutSeconds: DEFAULT_MATCH_RULES.timeoutSeconds,
};

const FEWEST_PLANETS = 1;
const MOST_PLANETS = 6;

export const PLANET_COUNT_CHOICES: readonly number[] = Array.from(
  { length: MOST_PLANETS - FEWEST_PLANETS + 1 },
  (_, i) => FEWEST_PLANETS + i,
);

export const TIMEOUT_CHOICES: readonly (number | undefined)[] = [10, 25, 50, undefined];

export function parseSettings(stored: string | null): Settings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored ?? "");
  } catch {
    parsed = undefined;
  }
  const fields = isRecord(parsed) ? parsed : {};
  const gravityWellContours =
    typeof fields.gravityWellContours === "boolean" ? fields.gravityWellContours : DEFAULT_SETTINGS.gravityWellContours;
  const planetCount = parsePlanetCount(fields.planetCount);
  const timeoutSeconds = parseTimeoutSeconds(fields.timeoutSeconds);
  return { gravityWellContours, planetCount, timeoutSeconds };
}

function parsePlanetCount(value: unknown): Readonly<PlanetCountRange> {
  if (!isRecord(value)) {
    return DEFAULT_SETTINGS.planetCount;
  }
  const { min, max } = value;
  if (!isPlanetCountChoice(min) || !isPlanetCountChoice(max) || min > max) {
    return DEFAULT_SETTINGS.planetCount;
  }
  return { min, max };
}

function parseTimeoutSeconds(value: unknown): number | undefined {
  if (value === null) {
    return undefined;
  }
  return typeof value === "number" && TIMEOUT_CHOICES.includes(value) ? value : DEFAULT_SETTINGS.timeoutSeconds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlanetCountChoice(value: unknown): value is number {
  return typeof value === "number" && PLANET_COUNT_CHOICES.includes(value);
}

export function serialiseSettings(settings: Readonly<Settings>): string {
  const stored = { ...settings, timeoutSeconds: settings.timeoutSeconds ?? null };
  return JSON.stringify(stored);
}

export function withMinPlanets(range: Readonly<PlanetCountRange>, min: number): PlanetCountRange {
  return { min, max: Math.max(range.max, min) };
}

export function withMaxPlanets(range: Readonly<PlanetCountRange>, max: number): PlanetCountRange {
  return { min: Math.min(range.min, max), max };
}

export function matchRulesFor(settings: Readonly<Settings>): MatchRules {
  return { planetCount: settings.planetCount, timeoutSeconds: settings.timeoutSeconds };
}
