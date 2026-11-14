// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Point, Segment } from "./core/flight";
import type { Side } from "./core/round";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type SpriteName = "backdrop" | "missile" | "explosion" | `${Side}Ship` | `planet${number}`;

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export interface ImageItem {
  kind: "image";
  sprite: SpriteName;
  target: Rect;
  alpha: number;
}

export interface SpriteFrameItem {
  kind: "spriteFrame";
  sprite: SpriteName;
  source: Rect;
  target: Rect;
  alpha: number;
}

export interface RingItem {
  kind: "ring";
  colour: string;
  centre: Point;
  radius: number;
  alpha: number;
}

export interface LinesItem {
  kind: "lines";
  colour: string;
  segments: Segment[];
  alpha: number;
  dash: number[];
  glow: boolean;
}

export interface BloomItem {
  kind: "bloom";
  colour: string;
  centre: Point;
  radius: number;
  alpha: number;
}

export interface DotItem {
  kind: "dot";
  colour: string;
  centre: Point;
  size: number;
  alpha: number;
}

export interface FillRectItem {
  kind: "fillRect";
  colour: string;
  rect: Rect;
}

export interface StrokeRectItem {
  kind: "strokeRect";
  colour: string;
  rect: Rect;
}

export interface TextItem {
  kind: "text";
  text: string;
  x: number;
  y: number;
  colour: string;
  font: "title" | "text";
  fontSize: number;
  align: "left" | "center" | "right";
  baseline: "top" | "middle" | "bottom";
  alpha: number;
}

export interface GroupItem {
  kind: "group";
  transform: Transform;
  items: FrameItem[];
}

export type FrameItem =
  | ImageItem
  | SpriteFrameItem
  | RingItem
  | LinesItem
  | BloomItem
  | DotItem
  | FillRectItem
  | StrokeRectItem
  | TextItem
  | GroupItem;
