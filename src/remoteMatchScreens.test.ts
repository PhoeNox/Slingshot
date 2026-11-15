// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { canShareCode, shareCode, type ShareNavigator } from "./remoteMatchScreens";

const LINK: ShareData = { url: "https://example.test/#invitation" };

function sharingNavigator(shared: ShareData[], failure?: unknown): ShareNavigator {
  return {
    canShare: () => true,
    share: async (data) => {
      if (failure !== undefined) {
        throw failure;
      }
      shared.push(data!);
    },
  };
}

describe("sharing a code", () => {
  test("is offered where the navigator can share the data", () => {
    expect(canShareCode(sharingNavigator([]), LINK)).toBe(true);
  });

  test("is not offered without Web Share", () => {
    expect(canShareCode({}, LINK)).toBe(false);
  });

  test("is not offered when the navigator refuses the data", () => {
    const refusing: ShareNavigator = { canShare: () => false, share: async () => {} };

    expect(canShareCode(refusing, LINK)).toBe(false);
  });

  test("hands the data to the share sheet", async () => {
    const shared: ShareData[] = [];

    await shareCode(sharingNavigator(shared), LINK);

    expect(shared).toEqual([LINK]);
  });

  test("ignores a cancelled share sheet", async () => {
    const cancelled = new DOMException("Share cancelled", "AbortError");

    await expect(shareCode(sharingNavigator([], cancelled), LINK)).resolves.toBeUndefined();
  });

  test("rethrows any other share failure", async () => {
    const refused = new DOMException("Share refused", "NotAllowedError");

    await expect(shareCode(sharingNavigator([], refused), LINK)).rejects.toBe(refused);
  });
});
