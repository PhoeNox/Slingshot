// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { FONT_FAMILY } from "./assets";
import type {
  FillRectItem,
  FrameItem,
  GroupItem,
  ImageItem,
  LinesItem,
  SpriteFrameItem,
  SpriteName,
  StrokeRectItem,
  TextItem,
} from "./frame";

export type Sprites = Record<SpriteName, HTMLImageElement>;

const LINE_WIDTH = 1;

export function drawFrame(context: CanvasRenderingContext2D, sprites: Sprites, frame: readonly FrameItem[]): void {
  for (const item of frame) {
    drawItem(context, sprites, item);
  }
}

function drawItem(context: CanvasRenderingContext2D, sprites: Sprites, item: FrameItem): void {
  switch (item.kind) {
    case "image":
      drawImage(context, sprites, item);
      break;
    case "spriteFrame":
      drawSpriteFrame(context, sprites, item);
      break;
    case "lines":
      drawLines(context, item);
      break;
    case "fillRect":
      fillRect(context, item);
      break;
    case "strokeRect":
      strokeRect(context, item);
      break;
    case "text":
      drawText(context, item);
      break;
    case "group":
      drawGroup(context, sprites, item);
      break;
  }
}

function drawImage(context: CanvasRenderingContext2D, sprites: Sprites, item: ImageItem): void {
  const target = item.target;
  context.drawImage(sprites[item.sprite], target.left, target.top, target.width, target.height);
}

function drawSpriteFrame(context: CanvasRenderingContext2D, sprites: Sprites, item: SpriteFrameItem): void {
  const source = item.source;
  const target = item.target;
  context.save();
  context.globalAlpha = item.alpha;
  context.drawImage(
    sprites[item.sprite],
    source.left,
    source.top,
    source.width,
    source.height,
    target.left,
    target.top,
    target.width,
    target.height,
  );
  context.restore();
}

function drawLines(context: CanvasRenderingContext2D, item: LinesItem): void {
  context.save();
  context.strokeStyle = item.colour;
  context.lineWidth = LINE_WIDTH;
  context.beginPath();
  for (const segment of item.segments) {
    context.moveTo(segment.from.x, segment.from.y);
    context.lineTo(segment.to.x, segment.to.y);
  }
  context.stroke();
  context.restore();
}

function fillRect(context: CanvasRenderingContext2D, item: FillRectItem): void {
  const rect = item.rect;
  context.save();
  context.fillStyle = item.colour;
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
  context.restore();
}

function strokeRect(context: CanvasRenderingContext2D, item: StrokeRectItem): void {
  const rect = item.rect;
  context.save();
  context.strokeStyle = item.colour;
  context.lineWidth = LINE_WIDTH;
  context.strokeRect(rect.left, rect.top, rect.width, rect.height);
  context.restore();
}

function drawText(context: CanvasRenderingContext2D, item: TextItem): void {
  context.save();
  context.globalAlpha = item.alpha;
  context.fillStyle = item.colour;
  context.font = `${item.fontSize}px ${FONT_FAMILY}`;
  context.textAlign = item.align;
  context.textBaseline = item.baseline;
  context.fillText(item.text, item.x, item.y);
  context.restore();
}

function drawGroup(context: CanvasRenderingContext2D, sprites: Sprites, item: GroupItem): void {
  const transform = item.transform;
  context.save();
  context.translate(transform.x, transform.y);
  context.rotate(transform.rotation);
  context.scale(transform.scale, transform.scale);
  drawFrame(context, sprites, item.items);
  context.restore();
}
