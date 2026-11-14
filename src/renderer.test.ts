// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import type { FrameItem, GroupItem, LinesItem, RingItem, StrokeRectItem } from "./frameItems";
import { drawFrame, type Sprites } from "./renderer";

interface StrokeRecorder {
  context: CanvasRenderingContext2D;
  lineWidths: number[];
}

const NO_SPRITES = {} as Sprites;

const LINES: LinesItem = {
  kind: "lines",
  colour: "#fff",
  segments: [{ from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }],
  alpha: 1,
  dash: [],
  glow: true,
};
const RING: RingItem = { kind: "ring", colour: "#fff", centre: { x: 0, y: 0 }, radius: 5, alpha: 1 };
const STROKE_RECT: StrokeRectItem = {
  kind: "strokeRect",
  colour: "#fff",
  rect: { left: 0, top: 0, width: 4, height: 4 },
};

function strokeRecorder(): StrokeRecorder {
  const lineWidths: number[] = [];
  const state = { lineWidth: 1 };
  const ignore = () => undefined;
  const recordStroke = () => {
    lineWidths.push(state.lineWidth);
  };
  const context = {
    save: ignore,
    restore: ignore,
    translate: ignore,
    rotate: ignore,
    scale: ignore,
    setLineDash: ignore,
    beginPath: ignore,
    moveTo: ignore,
    lineTo: ignore,
    arc: ignore,
    stroke: recordStroke,
    strokeRect: recordStroke,
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(width: number) {
      state.lineWidth = width;
    },
  };
  return { context: context as unknown as CanvasRenderingContext2D, lineWidths };
}

function scaledGroup(scale: number, items: FrameItem[]): GroupItem {
  return { kind: "group", transform: { x: 0, y: 0, rotation: 0, scale }, items };
}

function lineWidthsOf(frame: FrameItem[]): number[] {
  const recorder = strokeRecorder();
  drawFrame(recorder.context, NO_SPRITES, frame);
  return recorder.lineWidths;
}

describe("stroke widths", () => {
  test("unscaled strokes use the base widths, glow layers first", () => {
    expect(lineWidthsOf([LINES, RING, STROKE_RECT])).toEqual([5, 2.5, 1, 1, 1]);
  });

  test("strokes inside a scaled group keep their on-screen width", () => {
    const frame = [scaledGroup(0.5, [LINES, RING, STROKE_RECT])];

    expect(lineWidthsOf(frame)).toEqual([10, 5, 2, 2, 2]);
  });

  test("nested group scales combine", () => {
    const frame = [scaledGroup(0.5, [scaledGroup(0.25, [RING])])];

    expect(lineWidthsOf(frame)).toEqual([8]);
  });
});
