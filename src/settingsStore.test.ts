// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, matchRulesFor, parseSettings, serialiseSettings, type Settings } from "./settings";
import { localSettingsStorage, memorySettingsStorage } from "./settingsStorage";
import { createSettingsStore } from "./settingsStore";

const UNAVAILABLE_STORAGE_WINDOW = {
  get localStorage(): Storage {
    throw new Error("storage unavailable");
  },
} as unknown as Window;

describe("createSettingsStore", () => {
  test("loads the stored settings", () => {
    const stored: Settings = { ...DEFAULT_SETTINGS, bounce: true, planetCount: { min: 3, max: 5 } };
    const storage = memorySettingsStorage(serialiseSettings(stored));

    expect(createSettingsStore(storage).current()).toEqual(stored);
  });

  test("starts from the defaults when nothing is stored", () => {
    const store = createSettingsStore(memorySettingsStorage());

    expect(store.current()).toEqual(DEFAULT_SETTINGS);
  });

  test("saves a changed setting", () => {
    const storage = memorySettingsStorage();
    const store = createSettingsStore(storage);

    store.change("timeoutSeconds", undefined);

    expect(parseSettings(storage.stored)).toEqual({ ...DEFAULT_SETTINGS, timeoutSeconds: undefined });
  });

  test("hands out match rules taken after a change", () => {
    const store = createSettingsStore(memorySettingsStorage());

    store.change("planetVisibility", "hidden");

    expect(store.matchRules()).toEqual(matchRulesFor({ ...DEFAULT_SETTINGS, planetVisibility: "hidden" }));
  });

  test("leaves match rules handed out earlier unchanged by later changes", () => {
    const store = createSettingsStore(memorySettingsStorage());
    const matchRules = store.matchRules();

    store.change("bounce", true);
    store.change("planetCount", { min: 6, max: 6 });

    expect(matchRules).toEqual(matchRulesFor(DEFAULT_SETTINGS));
  });

  test("hands out the display settings with a change applied", () => {
    const store = createSettingsStore(memorySettingsStorage());

    store.change("gravityWellContours", false);

    expect(store.display()).toEqual({ gravityWellContours: false });
  });

  test("keeps only display settings out of the match rules", () => {
    const store = createSettingsStore(memorySettingsStorage());

    expect(store.display()).toEqual({ gravityWellContours: true });
    expect(store.matchRules()).not.toHaveProperty("gravityWellContours");
  });

  test("keeps working on unavailable storage, with the defaults", () => {
    const store = createSettingsStore(localSettingsStorage(UNAVAILABLE_STORAGE_WINDOW));

    store.change("bounce", true);

    expect(store.current()).toEqual({ ...DEFAULT_SETTINGS, bounce: true });
  });
});
