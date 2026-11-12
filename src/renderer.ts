import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./display";

export interface Sprites {
  backdrop: HTMLImageElement;
}

export function drawFrame(context: CanvasRenderingContext2D, sprites: Sprites): void {
  context.drawImage(sprites.backdrop, 0, 0, PLAYING_AREA_WIDTH, PLAYING_AREA_HEIGHT);
}
