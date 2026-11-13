// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+/<>";

export function scrambleLabel(label: string, progress: number, random: () => number): string {
  const decodedLength = Math.floor(label.length * progress);
  const characters = [...label].map((character, index) => {
    if (index < decodedLength || character === " ") {
      return character;
    }
    const glyphIndex = Math.floor(random() * SCRAMBLE_GLYPHS.length);
    return SCRAMBLE_GLYPHS[glyphIndex];
  });
  return characters.join("");
}
