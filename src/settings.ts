// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_MATCH_RULES, type MatchRules, type PlanetCountRange, type PlanetVisibility } from "./core/match";

export type SettingKind = "display" | "matchRule";

export interface SettingChoice<T> {
  value: T;
  label: string;
}

export interface SettingRule<T, Kind extends SettingKind> {
  kind: Kind;
  defaultValue: T;
  parse(stored: unknown): T;
}

export interface ChoiceSettingRule<T, Kind extends SettingKind> extends SettingRule<T, Kind> {
  choices: readonly SettingChoice<T>[];
}

export interface RangeSettingRule<Kind extends SettingKind> extends SettingRule<Readonly<PlanetCountRange>, Kind> {
  choices: readonly SettingChoice<number>[];
}

const FEWEST_PLANETS = 1;
const MOST_PLANETS = 6;

const PLANET_COUNT_CHOICES: readonly SettingChoice<number>[] = Array.from(
  { length: MOST_PLANETS - FEWEST_PLANETS + 1 },
  (_, i) => planetCountChoice(FEWEST_PLANETS + i),
);

const TIMEOUT_CHOICES: readonly SettingChoice<number | undefined>[] = [
  { value: 10, label: "10 s" },
  { value: 25, label: "25 s" },
  { value: 50, label: "50 s" },
  { value: undefined, label: "Never" },
];

const PLANET_VISIBILITY_CHOICES: readonly SettingChoice<PlanetVisibility>[] = [
  { value: "always", label: "Always" },
  { value: "atRoundStart", label: "At round start" },
  { value: "hidden", label: "Hidden" },
];

export const SETTING_RULES = {
  gravityWellContours: toggleSetting("display", true),
  planetCount: rangeSetting("matchRule", PLANET_COUNT_CHOICES, DEFAULT_MATCH_RULES.planetCount),
  timeoutSeconds: choiceSetting("matchRule", TIMEOUT_CHOICES, DEFAULT_MATCH_RULES.timeoutSeconds),
  bounce: toggleSetting("matchRule", DEFAULT_MATCH_RULES.bounce),
  planetVisibility: choiceSetting("matchRule", PLANET_VISIBILITY_CHOICES, DEFAULT_MATCH_RULES.planetVisibility),
};

type SettingRules = typeof SETTING_RULES;
type SettingKey = keyof SettingRules;

export type Settings = { [K in SettingKey]: SettingRules[K]["defaultValue"] };

type MatchRuleKey = { [K in SettingKey]: SettingRules[K]["kind"] extends "matchRule" ? K : never }[SettingKey];

const SETTING_KEYS = Object.keys(SETTING_RULES) as SettingKey[];

const MATCH_RULE_KEYS = SETTING_KEYS.filter((key): key is MatchRuleKey => SETTING_RULES[key].kind === "matchRule");

export const DEFAULT_SETTINGS: Readonly<Settings> = settingsFrom((key) => SETTING_RULES[key].defaultValue);

function toggleSetting<Kind extends SettingKind>(kind: Kind, defaultValue: boolean): SettingRule<boolean, Kind> {
  return {
    kind,
    defaultValue,
    parse: (stored) => (typeof stored === "boolean" ? stored : defaultValue),
  };
}

function choiceSetting<T, Kind extends SettingKind>(
  kind: Kind,
  choices: readonly SettingChoice<T>[],
  defaultValue: T,
): ChoiceSettingRule<T, Kind> {
  return {
    kind,
    defaultValue,
    choices,
    parse: (stored) => {
      const choice = choices.find((candidate) => storedFormOf(candidate.value) === stored);
      return choice === undefined ? defaultValue : choice.value;
    },
  };
}

function rangeSetting<Kind extends SettingKind>(
  kind: Kind,
  choices: readonly SettingChoice<number>[],
  defaultValue: Readonly<PlanetCountRange>,
): RangeSettingRule<Kind> {
  const isChoice = (value: unknown): value is number => choices.some((choice) => choice.value === value);
  return {
    kind,
    defaultValue,
    choices,
    parse: (stored) => {
      if (!isRecord(stored)) {
        return defaultValue;
      }
      const { min, max } = stored;
      if (!isChoice(min) || !isChoice(max) || min > max) {
        return defaultValue;
      }
      return { min, max };
    },
  };
}

function planetCountChoice(count: number): SettingChoice<number> {
  return { value: count, label: String(count) };
}

export function parseSettings(stored: string | null): Settings {
  const fields = storedFields(stored);
  return settingsFrom((key) => SETTING_RULES[key].parse(fields[key]));
}

function storedFields(stored: string | null): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored ?? "");
  } catch {
    parsed = undefined;
  }
  return isRecord(parsed) ? parsed : {};
}

export function serialiseSettings(settings: Readonly<Settings>): string {
  const entries = SETTING_KEYS.map((key) => [key, storedFormOf(settings[key])]);
  const stored = Object.fromEntries(entries);
  return JSON.stringify(stored);
}

function settingsFrom(valueOf: (key: SettingKey) => unknown): Settings {
  const entries = SETTING_KEYS.map((key) => [key, valueOf(key)]);
  return Object.fromEntries(entries) as Settings;
}

// JSON drops undefined fields, so an absent value such as the never timeout is stored as null.
function storedFormOf(value: unknown): unknown {
  return value ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function withMinPlanets(range: Readonly<PlanetCountRange>, min: number): PlanetCountRange {
  return { min, max: Math.max(range.max, min) };
}

export function withMaxPlanets(range: Readonly<PlanetCountRange>, max: number): PlanetCountRange {
  return { min: Math.min(range.min, max), max };
}

export function matchRulesFor(settings: Readonly<Settings>): MatchRules {
  const entries = MATCH_RULE_KEYS.map((key) => [key, settings[key]]);
  const matchRules = Object.fromEntries(entries) as Pick<Settings, MatchRuleKey>;
  return matchRules;
}
