// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { scrambleLabel } from "./scramble";

const firstGlyph = () => 0;

describe("scrambleLabel", () => {
  test("shows only scramble glyphs at the start", () => {
    expect(scrambleLabel("Play", 0, firstGlyph)).toBe("AAAA");
  });

  test("decodes the label from the left as progress grows", () => {
    expect(scrambleLabel("Credits", 0.5, firstGlyph)).toBe("CreAAAA");
  });

  test("shows the full label when complete", () => {
    expect(scrambleLabel("Credits", 1, firstGlyph)).toBe("Credits");
  });

  test("keeps spaces in place", () => {
    expect(scrambleLabel("Esc menu", 0, firstGlyph)).toBe("AAA AAAA");
  });

  test("keeps the label length", () => {
    expect(scrambleLabel("Back", 0.3, Math.random)).toHaveLength(4);
  });
});
