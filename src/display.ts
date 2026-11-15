// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./core/playingArea";

export interface CanvasFit {
  cssScale: number;
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
}

export function fitPlayingArea(availableWidth: number, availableHeight: number, devicePixelRatio: number): CanvasFit {
  const cssScale = Math.min(availableWidth / PLAYING_AREA_WIDTH, availableHeight / PLAYING_AREA_HEIGHT);
  const cssWidth = Math.floor(PLAYING_AREA_WIDTH * cssScale);
  const cssHeight = Math.floor(PLAYING_AREA_HEIGHT * cssScale);
  return {
    cssScale,
    cssWidth,
    cssHeight,
    backingWidth: Math.round(cssWidth * devicePixelRatio),
    backingHeight: Math.round(cssHeight * devicePixelRatio),
  };
}

export function applyFit(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, fit: CanvasFit): void {
  canvas.style.width = `${fit.cssWidth}px`;
  canvas.style.height = `${fit.cssHeight}px`;
  canvas.width = fit.backingWidth;
  canvas.height = fit.backingHeight;
  const scaleX = fit.backingWidth / PLAYING_AREA_WIDTH;
  const scaleY = fit.backingHeight / PLAYING_AREA_HEIGHT;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
}

export function applyOverlayFit(overlay: HTMLElement, fit: CanvasFit): void {
  overlay.style.width = `${fit.cssWidth}px`;
  overlay.style.height = `${fit.cssHeight}px`;
}
