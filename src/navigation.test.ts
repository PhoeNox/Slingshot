// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { backTargetFor, hashFor, resolveHash, type Screen } from "./navigation";

describe("resolveHash", () => {
  test.each<[string, Screen]>([
    ["#/", "mainMenu"],
    ["", "mainMenu"],
    ["#/play", "match"],
    ["#/credits", "credits"],
  ])("%j resolves to %s without replacement", (hash, screen) => {
    expect(resolveHash(hash)).toEqual({ screen, replace: false });
  });

  test.each(["#/foo", "#credits", "#/credits/x"])("unknown hash %j resolves to the main menu with replacement", (hash) => {
    expect(resolveHash(hash)).toEqual({ screen: "mainMenu", replace: true });
  });
});

describe("hashFor", () => {
  test.each<Screen>(["mainMenu", "match", "credits"])("the hash of %s resolves back to it", (screen) => {
    expect(resolveHash(hashFor(screen))).toEqual({ screen, replace: false });
  });
});

describe("backTargetFor", () => {
  test.each<[Screen, Screen | undefined]>([
    ["match", "mainMenu"],
    ["credits", "mainMenu"],
    ["mainMenu", undefined],
  ])("the back target of %s is %s", (screen, backTarget) => {
    expect(backTargetFor(screen)).toBe(backTarget);
  });
});
