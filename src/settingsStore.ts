// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { MatchRules } from "./core/match";
import type { DisplaySettings } from "./frame";
import { displaySettingsFor, matchRulesFor, parseSettings, serialiseSettings, type SettingKey, type Settings } from "./settings";
import type { SettingsStorage } from "./settingsStorage";

export interface SettingsStore {
  current: () => Readonly<Settings>;
  change: <K extends SettingKey>(key: K, value: Settings[K]) => void;
  matchRules: () => MatchRules;
  display: () => Readonly<DisplaySettings>;
}

export function createSettingsStore(storage: SettingsStorage): SettingsStore {
  const stored = storage.read();
  let settings: Readonly<Settings> = parseSettings(stored);
  let display: Readonly<DisplaySettings> = displaySettingsFor(settings);
  const change = <K extends SettingKey>(key: K, value: Settings[K]) => {
    settings = { ...settings, [key]: value };
    display = displaySettingsFor(settings);
    const serialised = serialiseSettings(settings);
    storage.write(serialised);
  };
  return {
    current: () => settings,
    change,
    matchRules: () => matchRulesFor(settings),
    display: () => display,
  };
}
