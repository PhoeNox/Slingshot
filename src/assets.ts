import type { Sprites } from "./renderer";

const FONT_FAMILY = "FreeSansBold";
const FONT_SOURCE = "url(data/FreeSansBold.ttf)";

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function loadSprites(): Promise<Sprites> {
  const backdrop = await loadImage("data/backdrop.png");
  return { backdrop };
}

export async function loadFont(): Promise<void> {
  const font = new FontFace(FONT_FAMILY, FONT_SOURCE);
  await font.load();
  document.fonts.add(font);
}
