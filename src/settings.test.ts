// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { DEFAULT_MATCH_RULES } from "./core/match";
import {
  DEFAULT_SETTINGS,
  matchRulesFor,
  parseSettings,
  PLANET_COUNT_CHOICES,
  serialiseSettings,
  withMaxPlanets,
  withMinPlanets,
  type Settings,
} from "./settings";

describe("parseSettings", () => {
  test("shows gravity-well contours and plays with 2 to 4 planets by default", () => {
    expect(DEFAULT_SETTINGS).toEqual({ gravityWellContours: true, planetCount: { min: 2, max: 4 } });
  });

  test.each<Settings>([
    { gravityWellContours: true, planetCount: { min: 2, max: 4 } },
    { gravityWellContours: false, planetCount: { min: 1, max: 6 } },
    { gravityWellContours: true, planetCount: { min: 3, max: 3 } },
  ])("reads back serialised settings %j", (settings) => {
    expect(parseSettings(serialiseSettings(settings))).toEqual(settings);
  });

  test.each([
    ["nothing stored", null],
    ["an empty string", ""],
    ["corrupt JSON", "{gravityWellContours"],
    ["a non-object", "42"],
    ["null", "null"],
    ["an array", "[false]"],
    ["a non-boolean value", '{"gravityWellContours":"no","planetCount":"many"}'],
    ["missing fields", "{}"],
  ])("falls back to the defaults for %s", (_, stored) => {
    expect(parseSettings(stored)).toEqual(DEFAULT_SETTINGS);
  });

  test.each([
    ["a minimum below 1", { min: 0, max: 4 }],
    ["a maximum above 6", { min: 2, max: 7 }],
    ["a minimum above the maximum", { min: 5, max: 3 }],
    ["a fractional count", { min: 2.5, max: 4 }],
    ["a non-numeric count", { min: "2", max: 4 }],
    ["a missing bound", { min: 2 }],
    ["an array", [2, 4]],
  ])("falls back to the default planet count range for %s", (_, planetCount) => {
    const stored = JSON.stringify({ gravityWellContours: false, planetCount });

    expect(parseSettings(stored)).toEqual({ gravityWellContours: false, planetCount: { min: 2, max: 4 } });
  });

  test("ignores unknown fields", () => {
    const stored = '{"gravityWellContours":false,"planetCount":{"min":1,"max":5,"mean":3},"volume":3}';

    expect(parseSettings(stored)).toEqual({ gravityWellContours: false, planetCount: { min: 1, max: 5 } });
  });
});

describe("planet count choices", () => {
  test("offer 1 to 6 planets", () => {
    expect(PLANET_COUNT_CHOICES).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("raising the minimum above the maximum raises the maximum to match", () => {
    expect(withMinPlanets({ min: 2, max: 4 }, 5)).toEqual({ min: 5, max: 5 });
  });

  test("lowering the minimum leaves the maximum", () => {
    expect(withMinPlanets({ min: 2, max: 4 }, 1)).toEqual({ min: 1, max: 4 });
  });

  test("lowering the maximum below the minimum lowers the minimum to match", () => {
    expect(withMaxPlanets({ min: 2, max: 4 }, 1)).toEqual({ min: 1, max: 1 });
  });

  test("raising the maximum leaves the minimum", () => {
    expect(withMaxPlanets({ min: 2, max: 4 }, 6)).toEqual({ min: 2, max: 6 });
  });
});

describe("matchRulesFor", () => {
  test("takes the planet count range from the settings and keeps the other default rules", () => {
    const settings: Settings = { gravityWellContours: true, planetCount: { min: 5, max: 6 } };

    expect(matchRulesFor(settings)).toEqual({ ...DEFAULT_MATCH_RULES, planetCount: { min: 5, max: 6 } });
  });
});
