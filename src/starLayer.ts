// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { COLOURS } from "./colours";
import { starAlpha, type Star } from "./stars";

export interface StarSprites {
  plain: HTMLCanvasElement;
  glowing: HTMLCanvasElement;
}

const PLAIN_SPRITE_SIZE = 16;
const GLOWING_SPRITE_SIZE = 96;
const CORE_COLOUR = "#ffffff";
const TRANSPARENT = "rgba(191, 239, 255, 0)";
const HALO_COLOUR = "rgba(191, 239, 255, 0.35)";
const CROSS_ARM_WIDTH_RATIO = 0.03;

function createSpriteCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext("2d")!];
}

function renderPlainSprite(): HTMLCanvasElement {
  const [canvas, context] = createSpriteCanvas(PLAIN_SPRITE_SIZE);
  const centre = PLAIN_SPRITE_SIZE / 2;
  const gradient = context.createRadialGradient(centre, centre, 0, centre, centre, centre);
  gradient.addColorStop(0, CORE_COLOUR);
  gradient.addColorStop(0.4, COLOURS.phosphor);
  gradient.addColorStop(1, TRANSPARENT);
  context.fillStyle = gradient;
  context.fillRect(0, 0, PLAIN_SPRITE_SIZE, PLAIN_SPRITE_SIZE);
  return canvas;
}

function renderGlowingSprite(): HTMLCanvasElement {
  const [canvas, context] = createSpriteCanvas(GLOWING_SPRITE_SIZE);
  const centre = GLOWING_SPRITE_SIZE / 2;
  const armWidth = GLOWING_SPRITE_SIZE * CROSS_ARM_WIDTH_RATIO;

  const halo = context.createRadialGradient(centre, centre, 0, centre, centre, centre / 2);
  halo.addColorStop(0, CORE_COLOUR);
  halo.addColorStop(0.15, HALO_COLOUR);
  halo.addColorStop(1, TRANSPARENT);
  context.fillStyle = halo;
  context.fillRect(0, 0, GLOWING_SPRITE_SIZE, GLOWING_SPRITE_SIZE);

  const horizontalArm = context.createLinearGradient(0, centre, GLOWING_SPRITE_SIZE, centre);
  horizontalArm.addColorStop(0, TRANSPARENT);
  horizontalArm.addColorStop(0.5, COLOURS.phosphor);
  horizontalArm.addColorStop(1, TRANSPARENT);
  context.fillStyle = horizontalArm;
  context.fillRect(0, centre - armWidth / 2, GLOWING_SPRITE_SIZE, armWidth);

  const verticalArm = context.createLinearGradient(centre, 0, centre, GLOWING_SPRITE_SIZE);
  verticalArm.addColorStop(0, TRANSPARENT);
  verticalArm.addColorStop(0.5, COLOURS.phosphor);
  verticalArm.addColorStop(1, TRANSPARENT);
  context.fillStyle = verticalArm;
  context.fillRect(centre - armWidth / 2, 0, armWidth, GLOWING_SPRITE_SIZE);
  return canvas;
}

export function renderStarSprites(): StarSprites {
  return { plain: renderPlainSprite(), glowing: renderGlowingSprite() };
}

export function drawStars(context: CanvasRenderingContext2D, sprites: StarSprites, stars: readonly Star[], timeMs: number): void {
  context.save();
  for (const star of stars) {
    const sprite = star.glows ? sprites.glowing : sprites.plain;
    const half = star.size / 2;
    context.globalAlpha = starAlpha(star, timeMs);
    context.drawImage(sprite, star.x - half, star.y - half, star.size, star.size);
  }
  context.restore();
}
