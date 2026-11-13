// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { DEFAULT_MATCH_RULES } from "./core/match";
import {
  DEFAULT_SETTINGS,
  matchRulesFor,
  parseSettings,
  PLANET_COUNT_CHOICES,
  PLANET_VISIBILITY_CHOICES,
  serialiseSettings,
  TIMEOUT_CHOICES,
  withMaxPlanets,
  withMinPlanets,
  type Settings,
} from "./settings";

describe("parseSettings", () => {
  test("shows contours and always-visible planets, with 2 to 4 planets, a 25 s timeout and no bounce by default", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      gravityWellContours: true,
      planetCount: { min: 2, max: 4 },
      timeoutSeconds: 25,
      bounce: false,
      planetVisibility: "always",
    });
  });

  test.each<Settings>([
    DEFAULT_SETTINGS,
    { ...DEFAULT_SETTINGS, gravityWellContours: false, planetCount: { min: 1, max: 6 }, timeoutSeconds: 10, bounce: true },
    { ...DEFAULT_SETTINGS, planetCount: { min: 3, max: 3 }, timeoutSeconds: 50, planetVisibility: "atRoundStart" },
    { ...DEFAULT_SETTINGS, timeoutSeconds: undefined, bounce: true, planetVisibility: "hidden" },
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

    expect(parseSettings(stored)).toEqual({
      gravityWellContours: false,
      planetCount: { min: 2, max: 4 },
      timeoutSeconds: 25,
      bounce: false,
      planetVisibility: "always",
    });
  });

  test.each([
    ["an unoffered duration", 30],
    ["a non-numeric duration", "25"],
    ["a missing duration", undefined],
    ["an object", { seconds: 10 }],
  ])("falls back to the 25 s timeout for %s", (_, timeoutSeconds) => {
    const stored = JSON.stringify({ gravityWellContours: false, planetCount: { min: 1, max: 3 }, timeoutSeconds });

    expect(parseSettings(stored)).toEqual({
      gravityWellContours: false,
      planetCount: { min: 1, max: 3 },
      timeoutSeconds: 25,
      bounce: false,
      planetVisibility: "always",
    });
  });

  test.each([
    ["a non-boolean value", "yes"],
    ["a number", 1],
    ["null", null],
    ["a missing value", undefined],
  ])("falls back to no bounce for %s", (_, bounce) => {
    const fields = { gravityWellContours: false, planetCount: { min: 1, max: 3 }, timeoutSeconds: 10, bounce };
    const stored = JSON.stringify(fields);

    expect(parseSettings(stored)).toEqual({
      gravityWellContours: false,
      planetCount: { min: 1, max: 3 },
      timeoutSeconds: 10,
      bounce: false,
      planetVisibility: "always",
    });
  });

  test.each([
    ["an unoffered value", "invisible"],
    ["a differently cased value", "Hidden"],
    ["a number", 2],
    ["null", null],
    ["a missing value", undefined],
  ])("falls back to always-visible planets for %s", (_, planetVisibility) => {
    const fields = { gravityWellContours: false, planetCount: { min: 1, max: 3 }, timeoutSeconds: 10, planetVisibility };
    const stored = JSON.stringify(fields);

    expect(parseSettings(stored)).toEqual({
      gravityWellContours: false,
      planetCount: { min: 1, max: 3 },
      timeoutSeconds: 10,
      bounce: false,
      planetVisibility: "always",
    });
  });

  test("ignores unknown fields", () => {
    const stored =
      '{"gravityWellContours":false,"planetCount":{"min":1,"max":5,"mean":3},"timeoutSeconds":null,"bounce":true,' +
      '"planetVisibility":"hidden","volume":3}';

    expect(parseSettings(stored)).toEqual({
      gravityWellContours: false,
      planetCount: { min: 1, max: 5 },
      timeoutSeconds: undefined,
      bounce: true,
      planetVisibility: "hidden",
    });
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

describe("timeout choices", () => {
  test("offer 10 s, 25 s, 50 s and never", () => {
    expect(TIMEOUT_CHOICES).toEqual([10, 25, 50, undefined]);
  });

  test("store never as null so it survives serialisation", () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, timeoutSeconds: undefined };

    expect(JSON.parse(serialiseSettings(settings))).toHaveProperty("timeoutSeconds", null);
  });
});

describe("planet visibility choices", () => {
  test("offer always, at round start and hidden", () => {
    expect(PLANET_VISIBILITY_CHOICES).toEqual(["always", "atRoundStart", "hidden"]);
  });
});

describe("matchRulesFor", () => {
  test("takes the planet count range, the timeout, bounce and planet visibility from the settings", () => {
    const settings: Settings = {
      gravityWellContours: true,
      planetCount: { min: 5, max: 6 },
      timeoutSeconds: 10,
      bounce: true,
      planetVisibility: "atRoundStart",
    };

    expect(matchRulesFor(settings)).toEqual({
      planetCount: { min: 5, max: 6 },
      timeoutSeconds: 10,
      bounce: true,
      planetVisibility: "atRoundStart",
    });
  });

  test("lets missiles never time out", () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, timeoutSeconds: undefined };

    expect(matchRulesFor(settings).timeoutSeconds).toBeUndefined();
  });

  test("reproduces the default match rules from the default settings", () => {
    expect(matchRulesFor(DEFAULT_SETTINGS)).toEqual(DEFAULT_MATCH_RULES);
  });
});
