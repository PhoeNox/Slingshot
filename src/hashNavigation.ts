// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { backTargetFor, hashFor, resolveHash, type FixedRouteScreen, type Route, type Screen } from "./navigation";

export interface HashLocation {
  hash: () => string;
  assign: (hash: string) => void;
  replace: (hash: string) => void;
  onChange: (listener: () => void) => void;
}

export interface HashNavigation {
  navigateTo: (screen: FixedRouteScreen) => void;
  navigateBack: (screen: Screen) => void;
  bindRoutes: (enterRoute: (route: Route) => void) => void;
}

export function windowHashLocation(target: Window): HashLocation {
  return {
    hash: () => target.location.hash,
    assign: (hash) => {
      target.location.hash = hash;
    },
    replace: (hash) => {
      target.history.replaceState(null, "", hash);
    },
    onChange: (listener) => {
      target.addEventListener("hashchange", listener);
    },
  };
}

export interface MemoryHashLocation extends HashLocation {
  entries: string[];
}

export function memoryHashLocation(hash = ""): MemoryHashLocation {
  const listeners: (() => void)[] = [];
  const location: MemoryHashLocation = {
    entries: [hash],
    hash: () => location.entries.at(-1)!,
    assign: (assigned) => {
      if (assigned === location.hash()) {
        return;
      }
      location.entries.push(assigned);
      for (const listener of listeners) {
        listener();
      }
    },
    replace: (replaced) => {
      location.entries[location.entries.length - 1] = replaced;
    },
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
  return location;
}

export function createHashNavigation(location: HashLocation): HashNavigation {
  const navigateTo = (screen: FixedRouteScreen) => {
    location.assign(hashFor(screen));
  };
  const navigateBack = (screen: Screen) => {
    const backTarget = backTargetFor(screen);
    if (backTarget !== undefined) {
      navigateTo(backTarget);
    }
  };
  const bindRoutes = (enterRoute: (route: Route) => void) => {
    const applyHash = () => {
      const route = currentRoute(location);
      enterRoute(route);
    };
    location.onChange(applyHash);
    applyHash();
  };
  return { navigateTo, navigateBack, bindRoutes };
}

function currentRoute(location: HashLocation): Route {
  const route = resolveHash(location.hash());
  if (route.replace) {
    const canonicalHash = hashFor(route.screen);
    location.replace(canonicalHash);
  }
  return route;
}
