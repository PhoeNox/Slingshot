// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, serialiseSettings, type Settings } from "./settings";

describe("parseSettings", () => {
  test("shows gravity-well contours by default", () => {
    expect(DEFAULT_SETTINGS).toEqual({ gravityWellContours: true });
  });

  test.each<Settings>([{ gravityWellContours: true }, { gravityWellContours: false }])(
    "reads back serialised settings %j",
    (settings) => {
      expect(parseSettings(serialiseSettings(settings))).toEqual(settings);
    },
  );

  test.each([
    ["nothing stored", null],
    ["an empty string", ""],
    ["corrupt JSON", "{gravityWellContours"],
    ["a non-object", "42"],
    ["null", "null"],
    ["an array", "[false]"],
    ["a non-boolean value", '{"gravityWellContours":"no"}'],
    ["a missing field", "{}"],
  ])("falls back to the defaults for %s", (_, stored) => {
    expect(parseSettings(stored)).toEqual(DEFAULT_SETTINGS);
  });

  test("ignores unknown fields", () => {
    expect(parseSettings('{"gravityWellContours":false,"volume":3}')).toEqual({ gravityWellContours: false });
  });
});
