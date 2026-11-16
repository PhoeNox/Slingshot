// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import type { SoundName, Sounds } from "./audio";
import type { SpriteName } from "./frameItems";
import type { Sprites } from "./renderer";

export const TEXT_FONT_FAMILY = "Barlow Semi Condensed";
const TEXT_FONT_SOURCE = "url(data/BarlowSemiCondensed-Medium.ttf)";
const TEXT_FONT_DESCRIPTORS: FontFaceDescriptors = { weight: "500" };
export const TITLE_FONT_FAMILY = "Michroma";
const TITLE_FONT_SOURCE = "url(data/Michroma-Regular.ttf)";
const PLANET_SPRITES = [1, 2, 3, 4, 5, 6, 7, 8];
const SOUND_FILES: Readonly<Record<SoundName, string>> = {
  music: "data/music.mp3",
  launch: "data/launch.mp3",
  planetImpact: "data/planet_impact.mp3",
  shipExplosion: "data/ship_explosion.mp3",
  menuSelect: "data/menu_select.mp3",
};

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

async function loadSound(context: BaseAudioContext, name: SoundName): Promise<[SoundName, AudioBuffer]> {
  const url = SOUND_FILES[name];
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load sound ${url}: HTTP ${response.status}`);
  }
  const data = await response.arrayBuffer();
  const buffer = await context.decodeAudioData(data);
  return [name, buffer];
}

export async function loadSounds(context: BaseAudioContext): Promise<Sounds> {
  const names = Object.keys(SOUND_FILES) as SoundName[];
  const soundLoads = names.map((name) => loadSound(context, name));
  const soundEntries = await Promise.all(soundLoads);
  return Object.fromEntries(soundEntries) as Sounds;
}

async function loadFontFace(family: string, source: string, descriptors?: FontFaceDescriptors): Promise<void> {
  const font = new FontFace(family, source, descriptors);
  await font.load();
  document.fonts.add(font);
}

export async function loadFonts(): Promise<void> {
  const textLoad = loadFontFace(TEXT_FONT_FAMILY, TEXT_FONT_SOURCE, TEXT_FONT_DESCRIPTORS);
  const titleLoad = loadFontFace(TITLE_FONT_FAMILY, TITLE_FONT_SOURCE);
  await Promise.all([textLoad, titleLoad]);
}
