import { FONT_FAMILY } from "./assets";
import { planets, roundNumber, roundStepCount, ships, type Match, type Planet, type Ship, type Side } from "./core/match";
import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./core/playingArea";

export interface Sprites {
  backdrop: HTMLImageElement;
  planets: HTMLImageElement[];
  ships: Record<Side, HTMLImageElement>;
}

const PLANET_SPRITE_FILL = 0.96;
const SHIP_FRAME_WIDTH = 40;
const SHIP_FRAME_HEIGHT = 33;
const DEFAULT_AIM_FRAME = 0;

const BANNER_START_INTENSITY = 100;
const BANNER_END_INTENSITY = 30;
const BANNER_DECAY_PER_STEP = 1.04;
const BANNER_FONT_SIZE = 100;
const BANNER_GROWTH_DIVISOR = 25;
const BANNER_CENTRE_X = 399;
const BANNER_CENTRE_Y = 299;

export function drawFrame(context: CanvasRenderingContext2D, sprites: Sprites, match: Match): void {
  drawBackdrop(context, sprites.backdrop);
  drawPlanets(context, sprites.planets, planets(match));
  drawShips(context, sprites.ships, ships(match));
  drawRoundBanner(context, roundNumber(match), roundStepCount(match));
}

function drawBackdrop(context: CanvasRenderingContext2D, backdrop: HTMLImageElement): void {
  context.drawImage(backdrop, 0, 0, PLAYING_AREA_WIDTH, PLAYING_AREA_HEIGHT);
}

function drawPlanets(
  context: CanvasRenderingContext2D,
  planetSprites: HTMLImageElement[],
  roundPlanets: readonly Readonly<Planet>[],
): void {
  for (const planet of roundPlanets) {
    const size = Math.round((2 * planet.radius) / PLANET_SPRITE_FILL);
    const left = planet.x - Math.floor(size / 2);
    const top = planet.y - Math.floor(size / 2);
    context.drawImage(planetSprites[planet.sprite - 1], left, top, size, size);
  }
}

function drawShips(
  context: CanvasRenderingContext2D,
  shipSheets: Record<Side, HTMLImageElement>,
  roundShips: Readonly<Record<Side, Readonly<Ship>>>,
): void {
  for (const side of ["left", "right"] as const) {
    const ship = roundShips[side];
    const frameLeft = DEFAULT_AIM_FRAME * SHIP_FRAME_WIDTH;
    const left = ship.x - SHIP_FRAME_WIDTH / 2;
    const top = ship.y - Math.floor(SHIP_FRAME_HEIGHT / 2);
    context.drawImage(
      shipSheets[side],
      frameLeft,
      0,
      SHIP_FRAME_WIDTH,
      SHIP_FRAME_HEIGHT,
      left,
      top,
      SHIP_FRAME_WIDTH,
      SHIP_FRAME_HEIGHT,
    );
  }
}

function drawRoundBanner(context: CanvasRenderingContext2D, round: number, stepsIntoRound: number): void {
  const intensity = BANNER_START_INTENSITY / BANNER_DECAY_PER_STEP ** stepsIntoRound;
  if (intensity <= BANNER_END_INTENSITY) {
    return;
  }
  const fontSize = (BANNER_FONT_SIZE * (BANNER_START_INTENSITY - intensity)) / BANNER_GROWTH_DIVISOR;
  context.save();
  context.globalAlpha = (2 * intensity - 60) / 255;
  context.fillStyle = "#fff";
  context.font = `${fontSize}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`Round ${round}`, BANNER_CENTRE_X, BANNER_CENTRE_Y);
  context.restore();
}
