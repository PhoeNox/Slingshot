// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { NO_ZOOM, nextZoom, type Zoom } from "./zoom";

const ZOOM_IN_PER_STEP = 2 / 3 / 30;
const EPSILON = 1e-9;

type Point = { x: number; y: number };

function expectOnScreen(zoom: Readonly<Zoom>, point: Point): void {
  const screenX = (point.x - zoom.left) * zoom.scale;
  const screenY = (point.y - zoom.top) * zoom.scale;
  expect(screenX).toBeGreaterThanOrEqual(-EPSILON);
  expect(screenX).toBeLessThanOrEqual(800 + EPSILON);
  expect(screenY).toBeGreaterThanOrEqual(-EPSILON);
  expect(screenY).toBeLessThanOrEqual(600 + EPSILON);
}

function expectPlayingAreaOnScreen(zoom: Readonly<Zoom>): void {
  expectOnScreen(zoom, { x: 0, y: 0 });
  expectOnScreen(zoom, { x: 800, y: 600 });
}

describe("nextZoom", () => {
  test.each([
    [{ x: 400, y: 300 }],
    [{ x: 0, y: 0 }],
    [{ x: 800, y: 600 }],
  ])("a missile inside the playing area at %o leaves the view unzoomed", (missile) => {
    expect(nextZoom(NO_ZOOM, missile)).toEqual(NO_ZOOM);
  });

  test("without a missile, an unzoomed view stays unzoomed", () => {
    expect(nextZoom(NO_ZOOM, undefined)).toEqual(NO_ZOOM);
  });

  test("a missile outside the playing area sets the scale that just fits it and the playing area, in one step", () => {
    const missile = { x: 400, y: -300 };

    const zoom = nextZoom(NO_ZOOM, missile);

    expect(zoom.scale).toBeCloseTo((600 - 40) / (900 - 40), 10);
    expectOnScreen(zoom, missile);
    expectPlayingAreaOnScreen(zoom);
  });

  test("the tighter axis sets the scale when the missile is outside on both", () => {
    const zoom = nextZoom(NO_ZOOM, { x: 1300, y: -100 });

    expect(zoom.scale).toBeCloseTo((800 - 40) / (1300 - 40), 10);
  });

  test("a missile above the playing area shows no empty space below it", () => {
    const zoom = nextZoom(NO_ZOOM, { x: 400, y: -300 });

    expect(zoom.top + 600 / zoom.scale).toBeCloseTo(600, 9);
  });

  test("a missile right of the playing area shows no empty space left of it", () => {
    const missile = { x: 1200, y: 300 };

    const zoom = nextZoom(NO_ZOOM, missile);

    expect(zoom.left).toBeCloseTo(0, 9);
    expectOnScreen(zoom, missile);
  });

  test("a missile left of the playing area shows no empty space right of it", () => {
    const missile = { x: -400, y: 300 };

    const zoom = nextZoom(NO_ZOOM, missile);

    expect(zoom.left + 800 / zoom.scale).toBeCloseTo(800, 9);
    expectOnScreen(zoom, missile);
  });

  test("a missile returning inside eases the scale back by the capped rate", () => {
    const zoomed = nextZoom(NO_ZOOM, { x: 400, y: -300 });

    const zoom = nextZoom(zoomed, { x: 400, y: 300 });

    expect(zoom.scale).toBeCloseTo(zoomed.scale + ZOOM_IN_PER_STEP, 10);
    expectPlayingAreaOnScreen(zoom);
  });

  test("without a missile, a zoomed view eases back to unzoomed within about a second", () => {
    let zoom = nextZoom(NO_ZOOM, { x: 400, y: -300 });
    let steps = 0;

    while (zoom.scale < 1) {
      const previous = zoom.scale;
      zoom = nextZoom(zoom, undefined);
      steps++;
      expect(zoom.scale - previous).toBeGreaterThan(0);
      expect(zoom.scale - previous).toBeLessThanOrEqual(ZOOM_IN_PER_STEP + EPSILON);
      expectPlayingAreaOnScreen(zoom);
    }

    expect(steps).toBeLessThanOrEqual(31);
    expect(zoom).toEqual(NO_ZOOM);
  });

  test("a missile moving further out zooms out at once, not at the easing rate", () => {
    const near = nextZoom(NO_ZOOM, { x: 400, y: -100 });

    const far = nextZoom(near, { x: 400, y: -600 });

    expect(far.scale).toBeCloseTo((600 - 40) / (1200 - 40), 10);
  });
});
