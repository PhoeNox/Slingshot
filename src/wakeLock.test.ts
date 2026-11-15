// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { screenWakeLock, type WakeLockTarget } from "./wakeLock";

interface FakeSentinel {
  released: boolean;
  release: () => Promise<void>;
}

interface FakeDevice {
  target: WakeLockTarget;
  requests: number;
  sentinels: FakeSentinel[];
  settle: () => void;
  refuse: () => void;
  hide: () => void;
  show: () => void;
}

function fakeDevice(): FakeDevice {
  const pending: { resolve: (sentinel: WakeLockSentinel) => void; reject: (error: unknown) => void }[] = [];
  const document = { visibilityState: "visible" as DocumentVisibilityState };
  const device: FakeDevice = {
    requests: 0,
    sentinels: [],
    target: {
      document,
      navigator: {
        wakeLock: {
          request: () => {
            device.requests++;
            return new Promise<WakeLockSentinel>((resolve, reject) => pending.push({ resolve, reject }));
          },
        },
      },
    },
    settle: () => {
      const sentinel: FakeSentinel = {
        released: false,
        release: async () => {
          sentinel.released = true;
        },
      };
      device.sentinels.push(sentinel);
      pending.shift()!.resolve(sentinel as unknown as WakeLockSentinel);
    },
    refuse: () => {
      pending.shift()!.reject(new DOMException("Refused", "NotAllowedError"));
    },
    hide: () => {
      document.visibilityState = "hidden";
      for (const sentinel of device.sentinels) {
        sentinel.released = true;
      }
    },
    show: () => {
      document.visibilityState = "visible";
    },
  };
  return device;
}

async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("screen wake lock", () => {
  test("requests the lock once while it is wanted", async () => {
    const device = fakeDevice();
    const wakeLock = screenWakeLock(device.target);

    wakeLock.keepAwake(true);
    wakeLock.keepAwake(true);
    device.settle();
    await settled();
    wakeLock.keepAwake(true);

    expect(device.requests).toBe(1);
    expect(device.sentinels[0].released).toBe(false);
  });

  test("never requests the lock while it is not wanted", () => {
    const device = fakeDevice();
    const wakeLock = screenWakeLock(device.target);

    wakeLock.keepAwake(false);

    expect(device.requests).toBe(0);
  });

  test("releases the lock once it is no longer wanted", async () => {
    const device = fakeDevice();
    const wakeLock = screenWakeLock(device.target);
    wakeLock.keepAwake(true);
    device.settle();
    await settled();

    wakeLock.keepAwake(false);

    expect(device.sentinels[0].released).toBe(true);
  });

  test("releases a lock that arrives after it stopped being wanted", async () => {
    const device = fakeDevice();
    const wakeLock = screenWakeLock(device.target);
    wakeLock.keepAwake(true);
    wakeLock.keepAwake(false);

    device.settle();
    await settled();

    expect(device.sentinels[0].released).toBe(true);
  });

  test("requests the lock again once the page is visible after the browser released it", async () => {
    const device = fakeDevice();
    const wakeLock = screenWakeLock(device.target);
    wakeLock.keepAwake(true);
    device.settle();
    await settled();

    device.hide();
    wakeLock.keepAwake(true);
    const requestsWhileHidden = device.requests;
    device.show();
    wakeLock.keepAwake(true);

    expect(requestsWhileHidden).toBe(1);
    expect(device.requests).toBe(2);
  });

  test("stops asking after a refusal until the lock is wanted anew", async () => {
    const device = fakeDevice();
    const wakeLock = screenWakeLock(device.target);
    wakeLock.keepAwake(true);
    device.refuse();
    await settled();

    wakeLock.keepAwake(true);
    const requestsAfterRefusal = device.requests;
    wakeLock.keepAwake(false);
    wakeLock.keepAwake(true);

    expect(requestsAfterRefusal).toBe(1);
    expect(device.requests).toBe(2);
  });

  test("does nothing without the Wake Lock API", () => {
    const target: WakeLockTarget = { navigator: {}, document: { visibilityState: "visible" } };
    const wakeLock = screenWakeLock(target);

    expect(() => wakeLock.keepAwake(true)).not.toThrow();
  });
});
