// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Sprites } from "./renderer";

export const FONT_FAMILY = "FreeSansBold";
const FONT_SOURCE = "url(data/FreeSansBold.ttf)";
const PLANET_SPRITE_URLS = [1, 2, 3, 4, 5, 6, 7, 8].map((sprite) => `data/planet_${sprite}.png`);

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function loadSprites(): Promise<Sprites> {
  const backdropLoad = loadImage("data/backdrop.png");
  const leftShipLoad = loadImage("data/red_ship.png");
  const rightShipLoad = loadImage("data/blue_ship.png");
  const missileLoad = loadImage("data/shot.png");
  const explosionLoad = loadImage("data/explosion.png");
  const planetLoads = PLANET_SPRITE_URLS.map(loadImage);
  const planets = await Promise.all(planetLoads);
  return {
    backdrop: await backdropLoad,
    planets,
    ships: { left: await leftShipLoad, right: await rightShipLoad },
    missile: await missileLoad,
    explosion: await explosionLoad,
  };
}

export async function loadFont(): Promise<void> {
  const font = new FontFace(FONT_FAMILY, FONT_SOURCE);
  await font.load();
  document.fonts.add(font);
}
