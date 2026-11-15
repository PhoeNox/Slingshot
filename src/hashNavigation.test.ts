// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { createHashNavigation, memoryHashLocation } from "./hashNavigation";
import type { Route } from "./navigation";

function boundRoutes(hash: string) {
  const location = memoryHashLocation(hash);
  const navigation = createHashNavigation(location);
  const routes: Route[] = [];
  navigation.bindRoutes((route) => routes.push(route));
  return { location, navigation, routes };
}

describe("bindRoutes", () => {
  test("enters the current route on binding", () => {
    const { routes } = boundRoutes("#/settings");

    expect(routes).toEqual([{ screen: "settings", replace: false }]);
  });

  test("an unknown hash enters the main menu and is replaced by its canonical hash without a new entry", () => {
    const { location, routes } = boundRoutes("#/foo");

    expect(routes).toEqual([{ screen: "mainMenu", replace: true }]);
    expect(location.entries).toEqual(["#/"]);
  });

  test("a known hash is left as it is", () => {
    const { location } = boundRoutes("");

    expect(location.entries).toEqual([""]);
  });

  test("enters each route the hash changes to", () => {
    const { location, routes } = boundRoutes("#/");

    location.assign("#/join/a1B2/s3Cr");

    expect(routes.at(-1)).toEqual({ screen: "guest", replace: false, offerCode: "a1B2", roomSecret: "s3Cr" });
  });
});

describe("navigateTo", () => {
  test("pushes the screen's hash and enters its route", () => {
    const { location, navigation, routes } = boundRoutes("#/");

    navigation.navigateTo("credits");

    expect(location.entries).toEqual(["#/", "#/credits"]);
    expect(routes.at(-1)).toEqual({ screen: "credits", replace: false });
  });
});

describe("navigateBack", () => {
  test("navigates to the screen's back target", () => {
    const { location, navigation } = boundRoutes("#/play");

    navigation.navigateBack("match");

    expect(location.entries).toEqual(["#/play", "#/"]);
  });

  test("the remote match navigates back to the main menu", () => {
    const { location, navigation } = boundRoutes("#/host");

    navigation.navigateBack("remoteMatch");

    expect(location.hash()).toBe("#/");
  });

  test("the main menu has nowhere to go back to", () => {
    const { location, navigation, routes } = boundRoutes("#/");

    navigation.navigateBack("mainMenu");

    expect(location.entries).toEqual(["#/"]);
    expect(routes).toHaveLength(1);
  });
});
