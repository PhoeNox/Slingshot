// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

const SETTINGS_KEY = "slingshot.settings";

export interface SettingsStorage {
  read: () => string | null;
  write: (serialised: string) => void;
}

export function localSettingsStorage(target: Window): SettingsStorage {
  const read = () => {
    try {
      return target.localStorage.getItem(SETTINGS_KEY);
    } catch {
      return null;
    }
  };
  const write = (serialised: string) => {
    try {
      target.localStorage.setItem(SETTINGS_KEY, serialised);
    } catch {
      return;
    }
  };
  return { read, write };
}

export interface MemorySettingsStorage extends SettingsStorage {
  stored: string | null;
}

export function memorySettingsStorage(stored: string | null = null): MemorySettingsStorage {
  const storage: MemorySettingsStorage = {
    stored,
    read: () => storage.stored,
    write: (serialised) => {
      storage.stored = serialised;
    },
  };
  return storage;
}
