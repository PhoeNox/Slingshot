// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { SpriteName } from "./frame";
import type { Sprites } from "./renderer";

export const FONT_FAMILY = "FreeSansBold";
const FONT_SOURCE = "url(data/FreeSansBold.ttf)";
const PLANET_SPRITES = [1, 2, 3, 4, 5, 6, 7, 8];

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

async function loadPlanet(sprite: number): Promise<[SpriteName, HTMLImageElement]> {
  const image = await loadImage(`data/planet_${sprite}.png`);
  return [`planet${sprite}`, image];
}

export async function loadSprites(): Promise<Sprites> {
  const backdropLoad = loadImage("data/backdrop.png");
  const leftShipLoad = loadImage("data/red_ship.png");
  const rightShipLoad = loadImage("data/blue_ship.png");
  const missileLoad = loadImage("data/shot.png");
  const explosionLoad = loadImage("data/explosion.png");
  const planetLoads = PLANET_SPRITES.map(loadPlanet);
  const planetEntries = await Promise.all(planetLoads);
  const planets = Object.fromEntries(planetEntries);
  return {
    ...planets,
    backdrop: await backdropLoad,
    leftShip: await leftShipLoad,
    rightShip: await rightShipLoad,
    missile: await missileLoad,
    explosion: await explosionLoad,
  };
}

export async function loadFont(): Promise<void> {
  const font = new FontFace(FONT_FAMILY, FONT_SOURCE);
  await font.load();
  document.fonts.add(font);
}
