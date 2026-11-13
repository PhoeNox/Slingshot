// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { STEPS_PER_SECOND, type Point } from "./flight";
import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./playingArea";

const ZOOM_PADDING = 40;
const ZOOM_IN_PER_STEP = 2 / 3 / STEPS_PER_SECOND;
const ZOOM_PAN_PER_STEP = 10;

export interface Zoom {
  scale: number;
  left: number;
  top: number;
}

export const NO_ZOOM: Readonly<Zoom> = { scale: 1, left: 0, top: 0 };

interface ZoomAxis {
  missile: number | undefined;
  extent: number;
}

interface Span {
  min: number;
  max: number;
}

export function nextZoom(zoom: Readonly<Zoom>, missile: Readonly<Point> | undefined): Zoom {
  const horizontal = { missile: missile?.x, extent: PLAYING_AREA_WIDTH };
  const vertical = { missile: missile?.y, extent: PLAYING_AREA_HEIGHT };
  const fittingScale = Math.min(fittingAxisScale(horizontal), fittingAxisScale(vertical));
  const scale = Math.min(fittingScale, zoom.scale + ZOOM_IN_PER_STEP);
  const keptHorizontal = keptSpan(horizontal, fittingScale);
  const keptVertical = keptSpan(vertical, fittingScale);
  const left = viewStart(zoom.left, keptHorizontal, horizontal.extent / scale, scale);
  const top = viewStart(zoom.top, keptVertical, vertical.extent / scale, scale);
  return { scale, left, top };
}

function missileSpan(axis: Readonly<ZoomAxis>): number {
  return axis.missile === undefined ? 0 : Math.max(axis.missile, axis.extent - axis.missile);
}

function fittingAxisScale(axis: Readonly<ZoomAxis>): number {
  const span = missileSpan(axis);
  return span <= axis.extent ? 1 : (axis.extent - ZOOM_PADDING) / (span - ZOOM_PADDING);
}

function keptSpan(axis: Readonly<ZoomAxis>, scale: number): Span {
  const missile = axis.missile;
  const span = missileSpan(axis);
  if (missile === undefined || span <= axis.extent) {
    return { min: 0, max: axis.extent };
  }
  const margin = (ZOOM_PADDING * (span - axis.extent)) / (span - ZOOM_PADDING) / scale;
  return { min: Math.min(0, missile - margin), max: Math.max(axis.extent, missile + margin) };
}

function viewStart(previous: number, kept: Readonly<Span>, viewLength: number, scale: number): number {
  const centred = (kept.min + kept.max - viewLength) / 2;
  const maxPan = ZOOM_PAN_PER_STEP / scale;
  const panned = clamp(centred, previous - maxPan, previous + maxPan);
  return clamp(panned, kept.max - viewLength, kept.min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
