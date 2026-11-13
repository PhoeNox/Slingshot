// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { MAIN_MENU_ITEMS, backTargetFor, hashFor, moveFocus, playsAttractMode, resolveHash, type FocusStep, type Screen } from "./navigation";

describe("resolveHash", () => {
  test.each<[string, Screen]>([
    ["#/", "mainMenu"],
    ["", "mainMenu"],
    ["#/play", "match"],
    ["#/settings", "settings"],
    ["#/credits", "credits"],
  ])("%j resolves to %s without replacement", (hash, screen) => {
    expect(resolveHash(hash)).toEqual({ screen, replace: false });
  });

  test.each(["#/foo", "#credits", "#/credits/x"])("unknown hash %j resolves to the main menu with replacement", (hash) => {
    expect(resolveHash(hash)).toEqual({ screen: "mainMenu", replace: true });
  });
});

describe("hashFor", () => {
  test.each<Screen>(["mainMenu", "match", "settings", "credits"])("the hash of %s resolves back to it", (screen) => {
    expect(resolveHash(hashFor(screen))).toEqual({ screen, replace: false });
  });
});

describe("backTargetFor", () => {
  test.each<[Screen, Screen | undefined]>([
    ["match", "mainMenu"],
    ["settings", "mainMenu"],
    ["credits", "mainMenu"],
    ["mainMenu", undefined],
  ])("the back target of %s is %s", (screen, backTarget) => {
    expect(backTargetFor(screen)).toBe(backTarget);
  });
});

describe("playsAttractMode", () => {
  test.each<[Screen, boolean]>([
    ["mainMenu", true],
    ["settings", true],
    ["credits", false],
    ["match", false],
  ])("on %s is %s", (screen, plays) => {
    expect(playsAttractMode(screen, false)).toBe(plays);
  });

  test.each<Screen>(["mainMenu", "settings"])("pauses on %s under reduced motion", (screen) => {
    expect(playsAttractMode(screen, true)).toBe(false);
  });
});

describe("MAIN_MENU_ITEMS", () => {
  test("offers Play, Settings and Credits in that order", () => {
    expect(MAIN_MENU_ITEMS).toEqual([
      { label: "Play", screen: "match" },
      { label: "Settings", screen: "settings" },
      { label: "Credits", screen: "credits" },
    ]);
  });
});

describe("moveFocus", () => {
  test.each<[number, FocusStep, number, number]>([
    [0, 1, 2, 1],
    [1, -1, 2, 0],
    [1, 1, 2, 0],
    [0, -1, 2, 1],
    [0, 1, 3, 1],
    [1, 1, 3, 2],
    [2, -1, 3, 1],
    [1, -1, 3, 0],
    [2, 1, 3, 0],
    [0, -1, 3, 2],
  ])("from %i by %i over %i items lands on %i", (index, step, itemCount, expected) => {
    expect(moveFocus(index, step, itemCount)).toBe(expected);
  });
});
