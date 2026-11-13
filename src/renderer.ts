// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { TEXT_FONT_FAMILY, TITLE_FONT_FAMILY } from "./assets";
import type { Point } from "./core/flight";
import type {
  BloomItem,
  DotItem,
  FillRectItem,
  FrameItem,
  GroupItem,
  ImageItem,
  LinesItem,
  RingItem,
  SpriteFrameItem,
  SpriteName,
  StrokeRectItem,
  TextItem,
} from "./frame";

export type Sprites = Record<SpriteName, HTMLImageElement>;

interface GlowLayer {
  width: number;
  alpha: number;
}

const LINE_WIDTH = 1;
const LINE_GLOW_LAYERS: readonly GlowLayer[] = [
  { width: 5, alpha: 0.12 },
  { width: 2.5, alpha: 0.3 },
];
const TEXT_GLOW_LAYERS: readonly GlowLayer[] = [
  { width: 4, alpha: 0.12 },
  { width: 2, alpha: 0.25 },
];
const FONT_FAMILIES: Record<TextItem["font"], string> = { title: TITLE_FONT_FAMILY, text: TEXT_FONT_FAMILY };
const BLOOM_EDGE_COLOUR = "rgba(0, 0, 0, 0)";

export function drawFrame(context: CanvasRenderingContext2D, sprites: Sprites, frame: readonly FrameItem[]): void {
  drawItems(context, sprites, frame, 1);
}

function drawItems(
  context: CanvasRenderingContext2D,
  sprites: Sprites,
  items: readonly FrameItem[],
  groupScale: number,
): void {
  for (const item of items) {
    drawItem(context, sprites, item, groupScale);
  }
}

export function drawShakenFrame(
  context: CanvasRenderingContext2D,
  sprites: Sprites,
  frame: readonly FrameItem[],
  offset: Readonly<Point>,
): void {
  context.save();
  context.translate(offset.x, offset.y);
  drawFrame(context, sprites, frame);
  context.restore();
}

function drawItem(context: CanvasRenderingContext2D, sprites: Sprites, item: FrameItem, groupScale: number): void {
  switch (item.kind) {
    case "image":
      drawImage(context, sprites, item);
      break;
    case "spriteFrame":
      drawSpriteFrame(context, sprites, item);
      break;
    case "ring":
      drawRing(context, item, groupScale);
      break;
    case "lines":
      drawLines(context, item, groupScale);
      break;
    case "bloom":
      drawBloom(context, item);
      break;
    case "dot":
      drawDot(context, item);
      break;
    case "fillRect":
      fillRect(context, item);
      break;
    case "strokeRect":
      strokeRect(context, item, groupScale);
      break;
    case "text":
      drawText(context, item);
      break;
    case "group":
      drawGroup(context, sprites, item, groupScale);
      break;
  }
}

function drawImage(context: CanvasRenderingContext2D, sprites: Sprites, item: ImageItem): void {
  const target = item.target;
  context.save();
  context.globalAlpha = item.alpha;
  context.drawImage(sprites[item.sprite], target.left, target.top, target.width, target.height);
  context.restore();
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

function drawRing(context: CanvasRenderingContext2D, item: RingItem, groupScale: number): void {
  context.save();
  context.globalAlpha = item.alpha;
  context.strokeStyle = item.colour;
  context.lineWidth = LINE_WIDTH / groupScale;
  context.beginPath();
  context.arc(item.centre.x, item.centre.y, item.radius, 0, 2 * Math.PI);
  context.stroke();
  context.restore();
}

function drawLines(context: CanvasRenderingContext2D, item: LinesItem, groupScale: number): void {
  context.save();
  context.strokeStyle = item.colour;
  context.setLineDash(item.dash);
  context.lineCap = "round";
  context.beginPath();
  for (const segment of item.segments) {
    context.moveTo(segment.from.x, segment.from.y);
    context.lineTo(segment.to.x, segment.to.y);
  }
  const glowLayers = item.glow ? LINE_GLOW_LAYERS : [];
  for (const layer of glowLayers) {
    context.globalAlpha = item.alpha * layer.alpha;
    context.lineWidth = layer.width / groupScale;
    context.stroke();
  }
  context.globalAlpha = item.alpha;
  context.lineWidth = LINE_WIDTH / groupScale;
  context.stroke();
  context.restore();
}

function drawBloom(context: CanvasRenderingContext2D, item: BloomItem): void {
  const { x, y } = item.centre;
  const radius = item.radius;
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, item.colour);
  gradient.addColorStop(1, BLOOM_EDGE_COLOUR);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = item.alpha;
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
  context.restore();
}

function drawDot(context: CanvasRenderingContext2D, item: DotItem): void {
  const { x, y } = item.centre;
  const half = item.size / 2;
  context.save();
  context.globalAlpha = item.alpha;
  context.fillStyle = item.colour;
  context.fillRect(x - half, y - half, item.size, item.size);
  context.restore();
}

function fillRect(context: CanvasRenderingContext2D, item: FillRectItem): void {
  const rect = item.rect;
  context.save();
  context.fillStyle = item.colour;
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
  context.restore();
}

function strokeRect(context: CanvasRenderingContext2D, item: StrokeRectItem, groupScale: number): void {
  const rect = item.rect;
  context.save();
  context.strokeStyle = item.colour;
  context.lineWidth = LINE_WIDTH / groupScale;
  context.strokeRect(rect.left, rect.top, rect.width, rect.height);
  context.restore();
}

function drawText(context: CanvasRenderingContext2D, item: TextItem): void {
  context.save();
  context.fillStyle = item.colour;
  context.strokeStyle = item.colour;
  context.lineJoin = "round";
  context.font = `${item.fontSize}px "${FONT_FAMILIES[item.font]}"`;
  context.textAlign = item.align;
  context.textBaseline = item.baseline;
  for (const layer of TEXT_GLOW_LAYERS) {
    context.globalAlpha = item.alpha * layer.alpha;
    context.lineWidth = layer.width;
    context.strokeText(item.text, item.x, item.y);
  }
  context.globalAlpha = item.alpha;
  context.fillText(item.text, item.x, item.y);
  context.restore();
}

function drawGroup(context: CanvasRenderingContext2D, sprites: Sprites, item: GroupItem, groupScale: number): void {
  const transform = item.transform;
  context.save();
  context.translate(transform.x, transform.y);
  context.rotate(transform.rotation);
  context.scale(transform.scale, transform.scale);
  drawItems(context, sprites, item.items, groupScale * transform.scale);
  context.restore();
}
